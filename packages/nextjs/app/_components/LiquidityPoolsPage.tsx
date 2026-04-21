"use client";

import { useState } from "react";
import { toHex, useFHEEncryption } from "@fhevm-sdk";
import type { FhevmInstance } from "@fhevm-sdk";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import PoolABI from "~~/contracts/CipherDEXPool.json";
import TokenABI from "~~/contracts/ConfidentialToken.json";
import { CONTRACTS } from "~~/hooks/useCipherDEX";
import { usePoolInit } from "~~/hooks/usePoolInit";
import { useWagmiEthers } from "~~/hooks/wagmi/useWagmiEthers";

const ADD_GAS = 10_000_000n;
const REMOVE_GAS = 10_000_000n;

export function LiquidityPoolsPage({
  fhevmInstance,
  isMobile,
  onSuccess,
}: {
  fhevmInstance: FhevmInstance | undefined;
  isMobile?: boolean;
  onSuccess?: () => void;
}) {
  const { address, isConnected } = useAccount();
  const { ethersSigner, ethersProvider } = useWagmiEthers();
  const { writeContractAsync } = useWriteContract();
  const { poolInitialized, snapshotA, snapshotB, totalShares, refetch } = usePoolInit();

  const [activeTab, setActiveTab] = useState<"Add" | "Remove">("Add");
  const [amtA, setAmtA] = useState("1000"); // cUSDT
  const [amtB, setAmtB] = useState("0.5"); // cETH
  const [removeShares, setRemoveShares] = useState("100");
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAddedSummary, setLastAddedSummary] = useState<string | null>(null);

  const { encryptWith, canEncrypt } = useFHEEncryption({
    instance: fhevmInstance,
    ethersSigner: ethersSigner ?? undefined,
    contractAddress: CONTRACTS.pool,
  });

  // User's LP share is FHE-encrypted; we just show "Encrypted" in the UI
  useReadContract({
    address: CONTRACTS.pool,
    abi: PoolABI.abi,
    functionName: "getShares",
    args: [address],
    query: { enabled: !!address && isConnected, staleTime: 15_000 },
  });

  const snapshotADisplay = snapshotA
    ? (Number(snapshotA) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "—";
  const snapshotBDisplay = snapshotB
    ? (Number(snapshotB) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 4 })
    : "—";
  const totalSharesDisplay = totalShares
    ? (Number(totalShares) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "—";

  async function handleAdd() {
    setIsLoading(true);
    setError(null);
    setStatus(null);
    if (!isConnected || !canEncrypt || !ethersProvider || !address) {
      setError("Wallet or FHE not ready — ensure wallet is connected and FHE instance is initialized.");
      setIsLoading(false);
      return;
    }
    try {
      const rawA = BigInt(Math.floor(parseFloat(amtA) * 1e6));
      const rawB = BigInt(Math.floor(parseFloat(amtB) * 1e9));

      // Encrypt before any transactions — same pattern as useSwap.ts.
      // Doing operator approvals first invalidates the ethersSigner's underlying
      // provider (wagmi updates walletClient after each tx), which causes the
      // relayer fetch inside encrypt() to fail with a COEP/SSL error.
      setStatus("Encrypting amounts…");
      const encA = await encryptWith(b => b.add64(rawA));
      const encB = await encryptWith(b => b.add64(rawB));
      if (!encA || !encB) throw new Error("Encryption failed");

      const futureTs = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const { ethers } = await import("ethers");
      const signer = await ethersProvider.getSigner();

      const cUSDTContract = new ethers.Contract(CONTRACTS.cUSDT, TokenABI.abi, signer);
      const alreadyOperatorA: boolean = await cUSDTContract.isOperator(address, CONTRACTS.pool);
      if (!alreadyOperatorA) {
        setStatus("Approving cUSDT operator…");
        const txA = await writeContractAsync({
          address: CONTRACTS.cUSDT,
          abi: TokenABI.abi,
          functionName: "setOperator",
          args: [CONTRACTS.pool, futureTs],
        });
        await ethersProvider.waitForTransaction(txA as string);
      }

      const cETHContract = new ethers.Contract(CONTRACTS.cETH, TokenABI.abi, signer);
      const alreadyOperatorB: boolean = await cETHContract.isOperator(address, CONTRACTS.pool);
      if (!alreadyOperatorB) {
        setStatus("Approving cETH operator…");
        const txB = await writeContractAsync({
          address: CONTRACTS.cETH,
          abi: TokenABI.abi,
          functionName: "setOperator",
          args: [CONTRACTS.pool, futureTs],
        });
        await ethersProvider.waitForTransaction(txB as string);
      }

      setStatus("Submitting addLiquidity…");
      const tx = await writeContractAsync({
        address: CONTRACTS.pool,
        abi: PoolABI.abi,
        functionName: "addLiquidity",
        gas: ADD_GAS,
        args: [toHex(encA.handles[0]), toHex(encA.inputProof), toHex(encB.handles[0]), toHex(encB.inputProof)],
      });
      await ethersProvider.waitForTransaction(tx as string);
      setLastAddedSummary(`${parseFloat(amtA).toLocaleString()} cUSDT + ${parseFloat(amtB)} cETH`);
      setStatus("Liquidity added. Your encrypted LP share increased — reserve stats update on next swap.");
      onSuccess?.();
      window.dispatchEvent(new CustomEvent("cipherdex:liquidity-changed"));
      setTimeout(() => refetch(), 2500);
    } catch (err: any) {
      const msg = err?.message ?? "Failed";
      setError(msg.includes("gas") ? "Transaction failed — FHE gas limit exceeded. Try again." : msg);
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRemove() {
    setIsLoading(true);
    setError(null);
    setStatus(null);
    if (!isConnected || !canEncrypt || !ethersProvider) {
      setError("Wallet or FHE not ready — ensure wallet is connected and FHE instance is initialized.");
      setIsLoading(false);
      return;
    }
    try {
      const sharesToRemove = BigInt(Math.floor(parseFloat(removeShares)));
      setStatus("Encrypting share amount…");
      const encShares = await encryptWith(b => b.add64(sharesToRemove));
      if (!encShares) throw new Error("Encryption failed");

      setStatus("Submitting removeLiquidity…");
      const tx = await writeContractAsync({
        address: CONTRACTS.pool,
        abi: PoolABI.abi,
        functionName: "removeLiquidity",
        gas: REMOVE_GAS,
        args: [toHex(encShares.handles[0]), toHex(encShares.inputProof)],
      });
      await ethersProvider.waitForTransaction(tx as string);
      setStatus("Liquidity removed. Tokens returned to your wallet — reserve stats update on next swap.");
      onSuccess?.();
      window.dispatchEvent(new CustomEvent("cipherdex:liquidity-changed"));
      setTimeout(() => refetch(), 2500);
    } catch (err: any) {
      const msg = err?.message ?? "Failed";
      setError(msg.includes("gas") ? "Transaction failed — FHE gas limit exceeded. Try again." : msg);
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }

  const card: React.CSSProperties = {
    background: "rgba(23,23,20,0.5)",
    border: "1px solid rgba(255,255,245,0.06)",
    borderRadius: "14px",
    padding: "20px",
    backdropFilter: "blur(14px)",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,245,0.04)",
    border: "1px solid rgba(255,255,245,0.08)",
    borderRadius: "10px",
    padding: "11px 14px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#f0ede6",
    fontFamily: "'Cabinet Grotesk',sans-serif",
    outline: "none",
  };
  const stat = (label: string, value: string, sub?: string) => (
    <div
      style={{
        background: "#171714",
        borderRadius: "12px",
        padding: "14px 16px",
        border: "1px solid rgba(255,255,245,0.05)",
      }}
    >
      <div
        style={{
          fontSize: "9px",
          color: "#3a3832",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          fontFamily: "monospace",
          marginBottom: "8px",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: "10px", color: "#3a3832", marginTop: "4px" }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: "22px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: 900, letterSpacing: "-0.04em" }}>
          Liquidity <span style={{ color: "#FFD208" }}>Pools</span>
        </h1>
        <p style={{ fontSize: "13px", color: "#6b6860", marginTop: "3px" }}>
          Provide encrypted liquidity - your deposit amounts are never revealed
        </p>
      </div>

      {/* Pool not live banner — deployer runs initializePool.ts to remove this */}
      {poolInitialized === false && (
        <div
          style={{
            background: "rgba(255,255,245,0.03)",
            border: "1px solid rgba(255,255,245,0.08)",
            borderRadius: "12px",
            padding: "24px",
            marginBottom: "20px",
            textAlign: "center",
          }}
        >
          <div style={{ marginBottom: "12px", display: "flex", justifyContent: "center" }}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="#FFD208"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="9" width="12" height="9" rx="2" />
              <path d="M7 9V6a3 3 0 016 0v3" />
            </svg>
          </div>
          <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "6px" }}>Pool Not Yet Live</div>
          <div style={{ fontSize: "13px", color: "#6b6860", lineHeight: 1.6 }}>
            Initial liquidity is being seeded by the deployer.
            <br />
            Check back shortly — once the pool is live you can add and remove liquidity here.
          </div>
        </div>
      )}

      {/* Pool stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)",
          gap: "10px",
          marginBottom: "20px",
        }}
      >
        {stat("Reserve cUSDT", snapshotADisplay, "Plaintext snapshot — refreshes on swap")}
        {stat("Reserve cETH", snapshotBDisplay, "Plaintext snapshot — refreshes on swap")}
        {stat("Total Pool Shares", totalSharesDisplay, "May lag depending on contract snapshot behavior")}
      </div>
      <div
        style={{
          fontSize: "11px",
          color: "#3a3832",
          lineHeight: "1.5",
          marginBottom: "18px",
          letterSpacing: "0.01em",
        }}
      >
        Reserve values reflect the last swap. Liquidity additions are fully encrypted and processed on-chain — amounts are never revealed in the contract state.
      </div>

      {/* Your position */}
      <div
        style={{
          ...card,
          marginBottom: "18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "11px",
              color: "#3a3832",
              fontFamily: "monospace",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: "6px",
            }}
          >
            Your LP Position
          </div>
          <div
            style={{ fontSize: "20px", fontFamily: "monospace", color: "rgba(240,237,230,0.2)", letterSpacing: "2px" }}
          >
            {isConnected ? "▓▓▓▓▓▓▓▓" : "—"}
          </div>
          <div style={{ fontSize: "10px", color: "#3a3832", marginTop: "4px" }}>
            Encrypted - shares not publicly visible
          </div>
          {lastAddedSummary && (
            <div style={{ fontSize: "10px", color: "#FFD208", marginTop: "6px", fontFamily: "monospace" }}>
              Last added (local): {lastAddedSummary}
            </div>
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "11px",
            color: "#FFD208",
            background: "rgba(255,210,8,0.07)",
            border: "1px solid rgba(255,210,8,0.2)",
            borderRadius: "8px",
            padding: "6px 12px",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#FFD208" strokeWidth="1.5">
            <rect x="2" y="5" width="8" height="6" rx="1" />
            <path d="M4 5V3.5a2 2 0 014 0V5" />
          </svg>
          FHE Protected
        </div>
      </div>

      {/* Action card */}
      <div style={card}>
        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: "4px",
            background: "rgba(255,255,245,0.04)",
            borderRadius: "10px",
            padding: "4px",
            marginBottom: "20px",
          }}
        >
          {(["Add", "Remove"] as const).map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{
                flex: 1,
                background: activeTab === t ? "#FFD208" : "transparent",
                border: "none",
                borderRadius: "7px",
                padding: "9px",
                fontSize: "13px",
                fontWeight: 700,
                color: activeTab === t ? "#000" : "#6b6860",
                cursor: "pointer",
                fontFamily: "'Cabinet Grotesk',sans-serif",
                transition: "all 0.15s",
              }}
            >
              {t} Liquidity
            </button>
          ))}
        </div>

        {activeTab === "Add" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <div style={{ fontSize: "11px", color: "#6b6860", marginBottom: "8px", fontWeight: 600 }}>
                cUSDT Amount
              </div>
              <input value={amtA} onChange={e => setAmtA(e.target.value)} placeholder="1000" style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "#6b6860", marginBottom: "8px", fontWeight: 600 }}>
                cETH Amount
              </div>
              <input value={amtB} onChange={e => setAmtB(e.target.value)} placeholder="0.5" style={inputStyle} />
            </div>
            <div
              style={{
                background: "rgba(255,210,8,0.06)",
                border: "1px solid rgba(255,210,8,0.15)",
                borderRadius: "10px",
                padding: "12px 14px",
                fontSize: "12px",
                color: "#6b6860",
                lineHeight: 1.6,
              }}
            >
              Your deposit amounts are FHE-encrypted before submission. The pool calculates your LP share using
              encrypted arithmetic - no amount is ever leaked on-chain.
            </div>
            <button
              onClick={handleAdd}
              disabled={isLoading || !isConnected || !canEncrypt || !poolInitialized}
              style={{
                background: isLoading || !isConnected || !poolInitialized ? "rgba(255,210,8,0.3)" : "#FFD208",
                border: "none",
                borderRadius: "12px",
                padding: "14px",
                fontSize: "14px",
                fontWeight: 800,
                color: "#000",
                cursor: isLoading ? "not-allowed" : "pointer",
                fontFamily: "'Cabinet Grotesk',sans-serif",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {isLoading && (
                <svg width="16" height="16" viewBox="0 0 16 16" style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}>
                  <circle cx="8" cy="8" r="6" fill="none" stroke="#000" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10" strokeLinecap="round" />
                </svg>
              )}
              {isLoading ? (status ?? "Processing…") : "Add Liquidity"}
            </button>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <div style={{ fontSize: "11px", color: "#6b6860", marginBottom: "8px", fontWeight: 600 }}>
                Shares to Remove
              </div>
              <input
                value={removeShares}
                onChange={e => setRemoveShares(e.target.value)}
                placeholder="100"
                style={inputStyle}
              />
              <div style={{ fontSize: "10px", color: "#3a3832", marginTop: "6px" }}>
                Enter the number of LP shares to redeem
              </div>
            </div>
            <button
              onClick={handleRemove}
              disabled={isLoading || !isConnected || !canEncrypt}
              style={{
                background: isLoading || !isConnected ? "rgba(255,210,8,0.3)" : "#FFD208",
                border: "none",
                borderRadius: "12px",
                padding: "14px",
                fontSize: "14px",
                fontWeight: 800,
                color: "#000",
                cursor: isLoading ? "not-allowed" : "pointer",
                fontFamily: "'Cabinet Grotesk',sans-serif",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {isLoading && (
                <svg width="16" height="16" viewBox="0 0 16 16" style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}>
                  <circle cx="8" cy="8" r="6" fill="none" stroke="#000" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10" strokeLinecap="round" />
                </svg>
              )}
              {isLoading ? (status ?? "Processing…") : "Remove Liquidity"}
            </button>
          </div>
        )}

        {error && <div style={{ marginTop: "12px", color: "#ff6060", fontSize: "12px" }}>{error}</div>}
        {!isLoading && status && !error && (
          <div style={{ marginTop: "12px", color: "#FFD208", fontSize: "12px" }}>{status}</div>
        )}
      </div>
    </div>
  );
}
