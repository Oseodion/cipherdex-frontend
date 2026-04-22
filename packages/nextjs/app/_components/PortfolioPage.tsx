"use client";

import { useMemo } from "react";
import type { FhevmInstance } from "@fhevm-sdk";
import { useReadContract } from "wagmi";
import PoolABI from "~~/contracts/CipherDEXPool.json";
import { useBalances } from "~~/hooks/useBalances";
import { CONTRACTS } from "~~/hooks/useCipherDEX";
import { usePoolInit } from "~~/hooks/usePoolInit";
import { useWagmiEthers } from "~~/hooks/wagmi/useWagmiEthers";

export function PortfolioPage({
  address,
  chainId,
  fhevmInstance,
}: {
  address?: string;
  chainId?: number;
  fhevmInstance: FhevmInstance | undefined;
  isMobile?: boolean;
}) {
  const { totalShares, rateUSDTperETH } = usePoolInit();
  const { ethersSigner } = useWagmiEthers();

  const { cUSDTBalance, cETHBalance, cUSDTRaw, cETHRaw, decrypt, isDecrypting, canDecrypt } = useBalances(
    address as `0x${string}` | undefined,
    !!address,
    chainId,
    fhevmInstance,
    ethersSigner as any,
  );

  useReadContract({
    address: CONTRACTS.pool,
    abi: PoolABI.abi,
    functionName: "getShares",
    args: [address],
    query: { enabled: !!address, staleTime: 15_000 },
  });

  const rate = rateUSDTperETH ?? 2341.5;

  // Estimated portfolio value in cUSDT terms
  const estimatedValue = useMemo(() => {
    if (!cUSDTRaw && !cETHRaw) return null;
    const usdt = cUSDTRaw ? Number(cUSDTRaw) / 1e6 : 0;
    const ethVal = cETHRaw ? (Number(cETHRaw) / 1e9) * rate : 0;
    return (usdt + ethVal).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }, [cUSDTRaw, cETHRaw, rate]);

  const card: React.CSSProperties = {
    background: "rgba(23,23,20,0.5)",
    border: "1px solid rgba(255,255,245,0.06)",
    borderRadius: "14px",
    padding: "20px",
    backdropFilter: "blur(14px)",
  };

  const statRow = (label: string, value: string | null, accent?: boolean, encrypted?: boolean) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "14px 0",
        borderBottom: "1px solid rgba(255,255,245,0.04)",
      }}
    >
      <span style={{ fontSize: "13px", color: "#6b6860" }}>{label}</span>
      <span
        style={{
          fontSize: encrypted ? "16px" : "15px",
          fontWeight: 700,
          fontFamily: "monospace",
          color: encrypted ? "rgba(240,237,230,0.18)" : accent ? "#FFD208" : "#f0ede6",
          letterSpacing: encrypted ? "2px" : undefined,
        }}
      >
        {value ?? "-"}
      </span>
    </div>
  );

  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: "22px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: 900, letterSpacing: "-0.04em" }}>
          My <span style={{ color: "#FFD208" }}>Portfolio</span>
        </h1>
        <p style={{ fontSize: "13px", color: "#6b6860", marginTop: "3px" }}>
          Your encrypted holdings - balances are revealed only to you
        </p>
      </div>

      {!address && (
        <div style={{ ...card, textAlign: "center", color: "#6b6860", padding: "40px" }}>
          Connect your wallet to view your portfolio.
        </div>
      )}

      {address && (
        <>
          {/* Token balances */}
          <div style={{ ...card, marginBottom: "16px" }}>
            <div
              style={{
                fontSize: "11px",
                color: "#3a3832",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontFamily: "monospace",
                marginBottom: "12px",
              }}
            >
              Token Balances
            </div>
            {statRow("cUSDT", cUSDTBalance ?? "▓▓▓▓▓▓▓▓", true, !cUSDTBalance)}
            {statRow("cETH", cETHBalance ?? "▓▓▓▓▓▓▓▓", false, !cETHBalance)}

            <div style={{ marginTop: "16px" }}>
              <button
                onClick={decrypt}
                disabled={isDecrypting || !canDecrypt}
                style={{
                  background: canDecrypt ? "rgba(255,210,8,0.1)" : "rgba(255,255,245,0.04)",
                  border: `1px solid ${canDecrypt ? "rgba(255,210,8,0.3)" : "rgba(255,255,245,0.08)"}`,
                  borderRadius: "10px",
                  padding: "9px 18px",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: canDecrypt ? "#FFD208" : "#3a3832",
                  cursor: canDecrypt ? "pointer" : "not-allowed",
                  fontFamily: "'Cabinet Grotesk',sans-serif",
                  display: "flex",
                  alignItems: "center",
                  gap: "7px",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="5" width="8" height="6" rx="1" />
                  <path d="M4 5V3.5a2 2 0 014 0V5" />
                </svg>
                {isDecrypting ? "Decrypting…" : "Reveal Balances"}
              </button>
            </div>
          </div>

          {/* LP Position */}
          <div style={{ ...card, marginBottom: "16px" }}>
            <div
              style={{
                fontSize: "11px",
                color: "#3a3832",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontFamily: "monospace",
                marginBottom: "12px",
              }}
            >
              LP Position
            </div>
            {statRow("Your Shares", "▓▓▓▓▓▓▓▓", false, true)}
            {statRow(
              "Total Pool Shares",
              totalShares ? (Number(totalShares) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "-",
            )}
            <div style={{ padding: "14px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "13px", color: "#6b6860" }}>Pool Ownership</span>
              <span
                style={{
                  fontSize: "13px",
                  fontFamily: "monospace",
                  color: "rgba(240,237,230,0.18)",
                  letterSpacing: "2px",
                }}
              >
                ▓▓▓▓▓▓▓▓
              </span>
            </div>
            <div style={{ fontSize: "11px", color: "#3a3832", fontFamily: "monospace", marginTop: "4px" }}>
              LP share amount is encrypted - only you can prove ownership
            </div>
          </div>

          {/* Estimated value */}
          <div style={card}>
            <div
              style={{
                fontSize: "11px",
                color: "#3a3832",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontFamily: "monospace",
                marginBottom: "12px",
              }}
            >
              Estimated Portfolio Value
            </div>
            {estimatedValue ? (
              <>
                <div
                  style={{
                    fontSize: "32px",
                    fontWeight: 900,
                    fontFamily: "monospace",
                    color: "#FFD208",
                    letterSpacing: "-0.03em",
                  }}
                >
                  {estimatedValue}
                  <span style={{ fontSize: "16px", marginLeft: "6px", color: "#6b6860", fontWeight: 600 }}>cUSDT</span>
                </div>
                <div style={{ fontSize: "11px", color: "#3a3832", marginTop: "8px" }}>
                  Based on revealed balances + pool snapshot rate (
                  {rate.toLocaleString(undefined, { maximumFractionDigits: 0 })} cUSDT/cETH)
                </div>
              </>
            ) : (
              <div
                style={{
                  fontSize: "20px",
                  fontFamily: "monospace",
                  color: "rgba(240,237,230,0.18)",
                  letterSpacing: "2px",
                }}
              >
                ▓▓▓▓▓▓▓▓
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
