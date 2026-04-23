"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
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

/** One-line context under the stat grid (not repeated inside each card). */
const POOL_STATS_SUMMARY = "Public on-chain fields only - rough signals, not decrypted TVL";

/** Mask line for the scramble effect; keeps spaces and ASCII hyphens so width stays stable. */
function scrambleDisclosure(text: string): string {
  return text.replace(/[^ \-]/g, "▓");
}

const DISCLOSURE_ANIMATION_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function LiquidityPoolsPage({
  fhevmInstance,
  isMobile,
  onSuccess,
}: {
  fhevmInstance: FhevmInstance | undefined;
  isMobile?: boolean;
  onSuccess?: () => void;
}) {
  const mobileRestrictionMessage = "Desktop required for liquidity actions.";
  const { address, isConnected } = useAccount();
  const { ethersSigner, ethersProvider } = useWagmiEthers();
  const { writeContractAsync } = useWriteContract();
  const { poolInitialized, snapshotA, snapshotB, totalShares, refetch } = usePoolInit();

  const [activeTab, setActiveTab] = useState<"Add" | "Remove">("Add");
  const [amtA, setAmtA] = useState("1000"); // cUSDT
  const [amtB, setAmtB] = useState("0.5"); // cETH
  /** Human-readable pool share units - same scale as "Total Pool Shares" stat (we ×1e6 for chain raw uint64). */
  const [removeShares, setRemoveShares] = useState("10");
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localNetAdded, setLocalNetAdded] = useState<{ usdt: number; eth: number }>({ usdt: 0, eth: 0 });
  /** Hover / tap reveals readable disclosure; otherwise masked text (no layout shift). */
  const [hoveredStat, setHoveredStat] = useState<number | null>(null);
  const [pinnedStat, setPinnedStat] = useState<number | null>(null);
  const localLiquidityKey = useMemo(
    () => `cipherdex_local_liquidity_net:${(address ?? "guest").toLowerCase()}`,
    [address],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(localLiquidityKey);
    if (!raw) {
      setLocalNetAdded({ usdt: 0, eth: 0 });
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      setLocalNetAdded({
        usdt: Number(parsed?.usdt ?? 0),
        eth: Number(parsed?.eth ?? 0),
      });
    } catch {
      setLocalNetAdded({ usdt: 0, eth: 0 });
    }
  }, [localLiquidityKey]);

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
    : "-";
  const snapshotBDisplay = snapshotB
    ? (Number(snapshotB) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 4 })
    : "-";
  const totalSharesDisplay = totalShares
    ? (Number(totalShares) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "-";

  async function handleAdd() {
    if (isMobile) {
      setError(mobileRestrictionMessage);
      return;
    }
    let slowEncryptTimer: number | null = null;
    flushSync(() => {
      setIsLoading(true);
      setError(null);
      setStatus("Starting add liquidity…");
    });
    await new Promise<void>(resolve => {
      if (typeof window === "undefined") {
        resolve();
        return;
      }
      window.requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    if (!isConnected || !canEncrypt || !ethersProvider || !address) {
      setError("Wallet or FHE not ready - ensure wallet is connected and FHE instance is initialized.");
      setIsLoading(false);
      return;
    }
    try {
      const rawA = BigInt(Math.floor(parseFloat(amtA) * 1e6));
      const rawB = BigInt(Math.floor(parseFloat(amtB) * 1e9));
      slowEncryptTimer =
        typeof window !== "undefined"
          ? window.setTimeout(() => {
              setStatus("Still encrypting amounts… this can take a bit on some wallets.");
            }, 12000)
          : null;

      // Encrypt before any transactions - same pattern as useSwap.ts.
      // Doing operator approvals first invalidates the ethersSigner's underlying
      // provider (wagmi updates walletClient after each tx), which causes the
      // relayer fetch inside encrypt() to fail with a COEP/SSL error.
      setStatus("Encrypting amounts…");
      // Stage encryptions so the browser can paint between heavy FHE steps.
      const encA = await encryptWith(b => b.add64(rawA));
      await new Promise<void>(resolve => {
        if (typeof window === "undefined") {
          resolve();
          return;
        }
        window.requestAnimationFrame(() => resolve());
      });
      const encB = await encryptWith(b => b.add64(rawB));
      if (slowEncryptTimer) window.clearTimeout(slowEncryptTimer);
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
      const addedUSDT = parseFloat(amtA) || 0;
      const addedETH = parseFloat(amtB) || 0;
      setLocalNetAdded(prev => {
        const next = { usdt: prev.usdt + addedUSDT, eth: prev.eth + addedETH };
        if (typeof window !== "undefined") {
          localStorage.setItem(localLiquidityKey, JSON.stringify(next));
        }
        return next;
      });
      setStatus("Liquidity added. Your encrypted LP share increased - reserve stats update on next swap.");
      onSuccess?.();
      window.dispatchEvent(new CustomEvent("cipherdex:liquidity-changed"));
      setTimeout(() => refetch(), 2500);
    } catch (err: any) {
      const msg = err?.message ?? "Failed";
      setError(msg.includes("gas") ? "Transaction failed - FHE gas limit exceeded. Try again." : msg);
      setStatus(null);
    } finally {
      if (slowEncryptTimer) window.clearTimeout(slowEncryptTimer);
      setIsLoading(false);
    }
  }

  async function handleRemove() {
    if (isMobile) {
      setError(mobileRestrictionMessage);
      return;
    }
    let slowEncryptTimer: number | null = null;
    flushSync(() => {
      setIsLoading(true);
      setError(null);
      setStatus("Starting remove liquidity…");
    });
    await new Promise<void>(resolve => {
      if (typeof window === "undefined") {
        resolve();
        return;
      }
      window.requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    if (!isConnected || !canEncrypt || !ethersProvider) {
      setError("Wallet or FHE not ready - ensure wallet is connected and FHE instance is initialized.");
      setIsLoading(false);
      return;
    }
    try {
      const human = parseFloat(removeShares.replace(/,/g, ""));
      if (!Number.isFinite(human) || human <= 0) {
        throw new Error("Enter a positive share amount (same units as Total Pool Shares).");
      }
      // Match totalSharesDisplay: UI divides chain totalShares by 1e6; convert back to raw uint64 for the contract.
      const sharesToRemove = BigInt(Math.round(human * 1_000_000));
      if (sharesToRemove <= 0n) throw new Error("Share amount too small.");
      slowEncryptTimer =
        typeof window !== "undefined"
          ? window.setTimeout(() => {
              setStatus("Still encrypting share amount… this can take a bit on some wallets.");
            }, 12000)
          : null;
      setStatus("Encrypting share amount…");
      const encShares = await encryptWith(b => b.add64(sharesToRemove));
      if (slowEncryptTimer) window.clearTimeout(slowEncryptTimer);
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
      setStatus("Liquidity removed. Tokens returned to your wallet - reserve stats update on next swap.");
      onSuccess?.();
      window.dispatchEvent(new CustomEvent("cipherdex:liquidity-changed"));
      setTimeout(() => refetch(), 2500);
    } catch (err: any) {
      const msg = err?.message ?? "Failed";
      setError(msg.includes("gas") ? "Transaction failed - FHE gas limit exceeded. Try again." : msg);
      setStatus(null);
    } finally {
      if (slowEncryptTimer) window.clearTimeout(slowEncryptTimer);
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
  const activeStatIndex = hoveredStat !== null ? hoveredStat : pinnedStat;
  const disclosureTimersRef = useRef<Record<number, number | null>>({});
  const [animatedDisclosure, setAnimatedDisclosure] = useState<Record<number, string>>({});
  const prevActiveStatRef = useRef<number | null>(null);
  const [hoverActivated, setHoverActivated] = useState(false);

  const statItems = useMemo(
    () => [
      {
        id: 0,
        label: "Reserve cUSDT",
        value: snapshotADisplay,
        disclosure: "On-chain snapshot divisor used for pool math - not full TVL; updates when swaps run.",
      },
      {
        id: 1,
        label: "Reserve cETH",
        value: snapshotBDisplay,
        disclosure: "On-chain snapshot divisor used for pool math - not full TVL; updates when swaps run.",
      },
      {
        id: 2,
        label: "Total Pool Shares",
        value: totalSharesDisplay,
        disclosure: "Plaintext totalShares field - may not reflect all encrypted LP mints.",
      },
      {
        id: 3,
        label: "Session adds (this device)",
        value: `${localNetAdded.usdt.toLocaleString(undefined, { maximumFractionDigits: 2 })} / ${localNetAdded.eth.toLocaleString(undefined, { maximumFractionDigits: 4 })}`,
        disclosure: "Estimated from this browser for this wallet only - not full on-chain history.",
      },
    ],
    [snapshotADisplay, snapshotBDisplay, totalSharesDisplay, localNetAdded],
  );

  useEffect(() => {
    if (hoverActivated || typeof window === "undefined") return;
    const activateHover = () => {
      setHoverActivated(true);
      window.removeEventListener("mousemove", activateHover);
    };
    window.addEventListener("mousemove", activateHover, { once: true });
    return () => {
      window.removeEventListener("mousemove", activateHover);
    };
  }, [hoverActivated]);

  useEffect(() => {
    setAnimatedDisclosure(prev => {
      const next = { ...prev };
      for (const item of statItems) {
        if (next[item.id] === undefined) {
          next[item.id] = scrambleDisclosure(item.disclosure);
        }
      }
      return next;
    });
  }, [statItems]);

  useEffect(() => {
    const byId = new Map(statItems.map(item => [item.id, item]));
    const runAnimation = (id: number, disclosure: string, reveal: boolean) => {
      const masked = scrambleDisclosure(disclosure);
      const target = reveal ? disclosure : masked;
      const source = reveal ? masked : disclosure;
      if (disclosureTimersRef.current[id]) {
        window.clearInterval(disclosureTimersRef.current[id]!);
      }
      let progress = 0;
      const maxLen = Math.max(source.length, target.length);
      const timer = window.setInterval(() => {
        progress += 1;
        setAnimatedDisclosure(prev => {
          const chars = target.split("").map((ch, idx) => {
            if (ch === " " || ch === "-") return ch;
            if (idx < progress) return ch;
            return DISCLOSURE_ANIMATION_CHARS[Math.floor(Math.random() * DISCLOSURE_ANIMATION_CHARS.length)];
          });
          return { ...prev, [id]: chars.join("") };
        });
        if (progress >= maxLen) {
          window.clearInterval(timer);
          disclosureTimersRef.current[id] = null;
          setAnimatedDisclosure(prev => ({ ...prev, [id]: target }));
        }
      }, 22);
      disclosureTimersRef.current[id] = timer;
    };

    const prevActive = prevActiveStatRef.current;
    const nextActive = activeStatIndex;

    if (prevActive !== null && prevActive !== nextActive) {
      const prevItem = byId.get(prevActive);
      if (prevItem) runAnimation(prevActive, prevItem.disclosure, false);
    }
    if (nextActive !== null && nextActive !== prevActive) {
      const nextItem = byId.get(nextActive);
      if (nextItem) runAnimation(nextActive, nextItem.disclosure, true);
    }

    prevActiveStatRef.current = nextActive;
  }, [activeStatIndex, statItems]);

  useEffect(() => {
    return () => {
      for (const key of Object.keys(disclosureTimersRef.current)) {
        const timer = disclosureTimersRef.current[Number(key)];
        if (timer) window.clearInterval(timer);
      }
    };
  }, []);

  const stat = (i: number, label: string, value: string, disclosure: string) => {
    const reveal = activeStatIndex === i;
    const masked = scrambleDisclosure(disclosure);
    const animatedText = animatedDisclosure[i] ?? masked;
    return (
      <div
        key={i}
        onMouseEnter={() => {
          if (!hoverActivated) return;
          setHoveredStat(i);
        }}
        onMouseLeave={() => setHoveredStat(null)}
        onClick={() => setPinnedStat(p => (p === i ? null : i))}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setPinnedStat(p => (p === i ? null : i));
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`${label}: ${value}. ${reveal ? disclosure : "Masked note, hover or activate to read"}`}
        style={{
          background: "#171714",
          borderRadius: "12px",
          padding: "14px 16px",
          border: "1px solid rgba(255,255,245,0.05)",
          cursor: "pointer",
          textAlign: "left" as const,
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
        <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "monospace", lineHeight: 1.2 }}>{value}</div>
        <div
          style={{
            marginTop: "12px",
            paddingTop: "12px",
            borderTop: "1px solid rgba(255,255,245,0.06)",
          }}
        >
          <div style={{ position: "relative", height: "44px", overflow: "hidden" }}>
            <div
              style={{
                fontSize: "10px",
                lineHeight: 1.45,
                fontFamily: "'Cabinet Grotesk',sans-serif",
                letterSpacing: "0.02em",
                color: "#7a7670",
                opacity: reveal ? 1 : 0.55,
                transition: "opacity 0.2s ease",
                userSelect: "none",
              }}
            >
              {animatedText}
            </div>
          </div>
        </div>
      </div>
    );
  };

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

      {/* Pool not live banner - deployer runs initializePool.ts to remove this */}
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
            Check back shortly - once the pool is live you can add and remove liquidity here.
          </div>
        </div>
      )}

      {/* Pool stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(4,1fr)",
          gap: "10px",
          marginBottom: "20px",
        }}
      >
        {stat(
          0,
          "Reserve cUSDT",
          snapshotADisplay,
          "On-chain snapshot divisor used for pool math - not full TVL; updates when swaps run.",
        )}
        {stat(
          1,
          "Reserve cETH",
          snapshotBDisplay,
          "On-chain snapshot divisor used for pool math - not full TVL; updates when swaps run.",
        )}
        {stat(
          2,
          "Total Pool Shares",
          totalSharesDisplay,
          "Plaintext totalShares field - may not reflect all encrypted LP mints.",
        )}
        {stat(
          3,
          "Session adds (this device)",
          `${localNetAdded.usdt.toLocaleString(undefined, { maximumFractionDigits: 2 })} / ${localNetAdded.eth.toLocaleString(undefined, { maximumFractionDigits: 4 })}`,
          "Estimated from this browser for this wallet only - not full on-chain history.",
        )}
      </div>
      <p
        style={{
          fontSize: "11px",
          color: "#5c5952",
          lineHeight: 1.45,
          margin: "0 0 18px 0",
          letterSpacing: "0.02em",
        }}
      >
        {POOL_STATS_SUMMARY}
      </p>

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
            {isConnected ? "▓▓▓▓▓▓▓▓" : "-"}
          </div>
          <div style={{ fontSize: "10px", color: "#3a3832", marginTop: "4px" }}>
            Encrypted - shares not publicly visible
          </div>
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
              disabled={!!isMobile || isLoading || !isConnected || !canEncrypt || !poolInitialized}
              style={{
                background: !!isMobile || isLoading || !isConnected || !poolInitialized ? "rgba(255,210,8,0.3)" : "#FFD208",
                border: "none",
                borderRadius: "12px",
                padding: "14px",
                fontSize: "14px",
                fontWeight: 800,
                color: "#000",
                cursor: !!isMobile || isLoading ? "not-allowed" : "pointer",
                fontFamily: "'Cabinet Grotesk',sans-serif",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {!!isMobile ? mobileRestrictionMessage : isLoading ? (status ?? "Processing…") : "Add Liquidity"}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <div style={{ fontSize: "11px", color: "#6b6860", marginBottom: "8px", fontWeight: 600 }}>
                Pool shares to burn
              </div>
              <input
                value={removeShares}
                onChange={e => setRemoveShares(e.target.value)}
                placeholder="10"
                style={inputStyle}
              />
              <div style={{ fontSize: "10px", color: "#3a3832", marginTop: "6px", lineHeight: 1.5 }}>
                Use the <strong>same number scale</strong> as <strong>Total Pool Shares</strong> above (e.g. if pool
                shows 1,414.21, that is the same unit system). Your exact wallet balance is encrypted on-chain - we
                cannot show it in plaintext here without decrypting. If you request more shares than you hold, the
                removal effectively does nothing (no tokens returned).
              </div>
            </div>
            <button
              onClick={handleRemove}
              disabled={!!isMobile || isLoading || !isConnected || !canEncrypt}
              style={{
                background: !!isMobile || isLoading || !isConnected ? "rgba(255,210,8,0.3)" : "#FFD208",
                border: "none",
                borderRadius: "12px",
                padding: "14px",
                fontSize: "14px",
                fontWeight: 800,
                color: "#000",
                cursor: !!isMobile || isLoading ? "not-allowed" : "pointer",
                fontFamily: "'Cabinet Grotesk',sans-serif",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {!!isMobile ? mobileRestrictionMessage : isLoading ? (status ?? "Processing…") : "Remove Liquidity"}
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
