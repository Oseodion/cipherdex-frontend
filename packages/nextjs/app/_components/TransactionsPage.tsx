"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePublicClient } from "wagmi";
import PoolABI from "~~/contracts/CipherDEXPool.json";
import { CONTRACTS } from "~~/hooks/useCipherDEX";
import { fetchEventLogsChunked } from "~~/utils/helper/fetchEventLogs";

type PoolActivityEvent = {
  kind: "swap" | "add" | "remove";
  /** trader (swap) or liquidity provider */
  actor: string;
  aToB?: boolean;
  timestamp: number;
  txHash: string;
  blockNumber: bigint;
  logIndex: number;
};

type Filter = "All" | "cUSDT→cETH" | "cETH→cUSDT" | "Add liquidity" | "Remove liquidity";
const LOOKBACK_BLOCKS = 60000n;

const truncate = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;
const formatAge = (ts: number) => {
  const delta = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (delta < 60) return "just now";
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
};

export function TransactionsPage({ address, isMobile }: { address?: string; isMobile?: boolean }) {
  const publicClient = usePublicClient();
  const [events, setEvents] = useState<PoolActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("All");

  const load = useCallback(async () => {
    if (!publicClient) return;
    setLoading(prev => (events.length === 0 ? true : prev));
    setError(null);
    try {
      const latest = await publicClient.getBlockNumber();
      const fromBlock = latest > LOOKBACK_BLOCKS ? latest - LOOKBACK_BLOCKS : 0n;
      type Tagged = { log: any; kind: PoolActivityEvent["kind"] };
      const rawTagged: Tagged[] = [];
      const [swapLogs, addLogs, removeLogs] = await Promise.all([
        fetchEventLogsChunked({
          publicClient,
          address: CONTRACTS.pool,
          abi: PoolABI.abi,
          eventName: "Swap",
          fromBlock,
          toBlock: latest,
        }),
        fetchEventLogsChunked({
          publicClient,
          address: CONTRACTS.pool,
          abi: PoolABI.abi,
          eventName: "LiquidityAdded",
          fromBlock,
          toBlock: latest,
        }),
        fetchEventLogsChunked({
          publicClient,
          address: CONTRACTS.pool,
          abi: PoolABI.abi,
          eventName: "LiquidityRemoved",
          fromBlock,
          toBlock: latest,
        }),
      ]);
      for (const log of swapLogs as any[]) rawTagged.push({ log, kind: "swap" });
      for (const log of addLogs as any[]) rawTagged.push({ log, kind: "add" });
      for (const log of removeLogs as any[]) rawTagged.push({ log, kind: "remove" });

      // Deduplicate by txHash + logIndex
      const seen = new Set<string>();
      const deduped = rawTagged.filter(({ log }) => {
        const key = `${log.transactionHash}:${log.logIndex}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const parsed: PoolActivityEvent[] = [];
      for (const { log, kind } of deduped) {
        const ts = Number(log.args?.timestamp ?? 0n);
        if (ts <= 0) continue;
        if (kind === "swap") {
          const actor = log.args?.trader as string | undefined;
          if (!actor) continue;
          parsed.push({
            kind,
            actor,
            aToB: log.args?.aToB as boolean,
            timestamp: ts,
            txHash: log.transactionHash as string,
            blockNumber: log.blockNumber as bigint,
            logIndex: Number(log.logIndex),
          });
        } else {
          const actor = log.args?.provider as string | undefined;
          if (!actor) continue;
          parsed.push({
            kind,
            actor,
            timestamp: ts,
            txHash: log.transactionHash as string,
            blockNumber: log.blockNumber as bigint,
            logIndex: Number(log.logIndex),
          });
        }
      }
      parsed.sort((a, b) => b.timestamp - a.timestamp);

      setEvents(parsed);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }, [publicClient, events.length]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onSwapConfirmed = () => {
      load();
    };
    window.addEventListener("cipherdex:swap-confirmed", onSwapConfirmed);
    window.addEventListener("cipherdex:liquidity-changed", onSwapConfirmed);
    return () => {
      window.removeEventListener("cipherdex:swap-confirmed", onSwapConfirmed);
      window.removeEventListener("cipherdex:liquidity-changed", onSwapConfirmed);
    };
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === "cUSDT→cETH") return events.filter(e => e.kind === "swap" && e.aToB);
    if (filter === "cETH→cUSDT") return events.filter(e => e.kind === "swap" && !e.aToB);
    if (filter === "Add liquidity") return events.filter(e => e.kind === "add");
    if (filter === "Remove liquidity") return events.filter(e => e.kind === "remove");
    return events;
  }, [events, filter]);

  const label: React.CSSProperties = {
    fontSize: "9px",
    fontWeight: 700,
    color: "#3a3832",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    fontFamily: "monospace",
  };
  const card: React.CSSProperties = {
    background: "rgba(23,23,20,0.5)",
    border: "1px solid rgba(255,255,245,0.06)",
    borderRadius: "14px",
    padding: "20px",
    backdropFilter: "blur(14px)",
  };

  return (
    <div style={{ width: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: "22px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: 900, letterSpacing: "-0.04em" }}>
          Transaction <span style={{ color: "#FFD208" }}>History</span>
        </h1>
        <p style={{ fontSize: "13px", color: "#6b6860", marginTop: "3px" }}>
          Swaps and liquidity changes from the pool contract - amounts stay encrypted on-chain
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        {(["All", "cUSDT→cETH", "cETH→cUSDT", "Add liquidity", "Remove liquidity"] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? "#FFD208" : "rgba(255,255,245,0.04)",
              border: `1px solid ${filter === f ? "#FFD208" : "rgba(255,255,245,0.08)"}`,
              borderRadius: "20px",
              padding: "6px 14px",
              fontSize: "12px",
              fontWeight: 700,
              color: filter === f ? "#000" : "#6b6860",
              cursor: "pointer",
              fontFamily: "'Cabinet Grotesk',sans-serif",
            }}
          >
            {f}
          </button>
        ))}
        <button
          onClick={load}
          style={{
            marginLeft: "auto",
            background: "transparent",
            border: "1px solid rgba(255,255,245,0.08)",
            borderRadius: "20px",
            padding: "6px 14px",
            fontSize: "12px",
            fontWeight: 700,
            color: "#6b6860",
            cursor: "pointer",
            fontFamily: "'Cabinet Grotesk',sans-serif",
          }}
        >
          Refresh
        </button>
      </div>

      <div style={card}>
        {loading && (
          <div
            style={{
              textAlign: "center",
              padding: "40px 0",
              color: "#3a3832",
              fontFamily: "monospace",
              fontSize: "13px",
            }}
          >
            Scanning Sepolia blocks…
          </div>
        )}
        {error && <div style={{ color: "#ff6060", fontSize: "13px", padding: "20px" }}>{error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "40px 0",
              color: "#3a3832",
              fontFamily: "monospace",
              fontSize: "13px",
            }}
          >
            No transactions found
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <>
            {/* Column headers - hidden on mobile */}
            {!isMobile && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 120px 140px 80px 80px",
                  gap: "12px",
                  padding: "0 8px 12px",
                  borderBottom: "1px solid rgba(255,255,245,0.06)",
                }}
              >
                {["Trader", "Direction", "Amount", "Time", ""].map(h => (
                  <div key={h} style={label}>
                    {h}
                  </div>
                ))}
              </div>
            )}

            {/* Rows */}
            {filtered.map(ev => {
              const isOwn = address && ev.actor.toLowerCase() === address.toLowerCase();
              const rowKey = `${ev.txHash}-${ev.logIndex}`;
              return isMobile ? (
                <div
                  key={rowKey}
                  style={{
                    padding: "12px 8px",
                    borderBottom: "1px solid rgba(255,255,245,0.03)",
                    background: isOwn ? "rgba(255,210,8,0.03)" : "transparent",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "6px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {isOwn && (
                        <span
                          style={{
                            fontSize: "9px",
                            background: "rgba(255,210,8,0.15)",
                            border: "1px solid rgba(255,210,8,0.3)",
                            color: "#FFD208",
                            borderRadius: "4px",
                            padding: "1px 5px",
                            fontWeight: 700,
                            fontFamily: "monospace",
                          }}
                        >
                          YOU
                        </span>
                      )}
                      <span style={{ fontSize: "12px", fontFamily: "monospace", color: isOwn ? "#FFD208" : "#6b6860" }}>
                        {truncate(ev.actor)}
                      </span>
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 700 }}
                    >
                      {ev.kind === "swap" ? (
                        <>
                          <span style={{ color: ev.aToB ? "#fbbf24" : "#60a5fa" }}>{ev.aToB ? "cUSDT" : "cETH"}</span>
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#3a3832" strokeWidth="1.5">
                            <path d="M1 5h8M6 2l3 3-3 3" />
                          </svg>
                          <span style={{ color: ev.aToB ? "#60a5fa" : "#fbbf24" }}>{ev.aToB ? "cETH" : "cUSDT"}</span>
                        </>
                      ) : (
                        <span style={{ color: ev.kind === "add" ? "#4ade80" : "#fb923c" }}>
                          {ev.kind === "add" ? "Add liquidity" : "Remove liquidity"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: "11px",
                        fontFamily: "monospace",
                        color: "rgba(240,237,230,0.18)",
                        letterSpacing: "1px",
                      }}
                    >
                      ░░ ENCRYPTED ░░
                    </span>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <span style={{ fontSize: "10px", color: "#3a3832", fontFamily: "monospace" }}>
                        {ev.timestamp > 0 ? formatAge(ev.timestamp) : `#${ev.blockNumber.toString()}`}
                      </span>
                      <a
                        href={`https://sepolia.etherscan.io/tx/${ev.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: "11px", color: "#FFD208", textDecoration: "none", fontFamily: "monospace" }}
                      >
                        View →
                      </a>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  key={rowKey}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 120px 140px 80px 80px",
                    gap: "12px",
                    padding: "12px 8px",
                    borderBottom: "1px solid rgba(255,255,245,0.03)",
                    background: isOwn ? "rgba(255,210,8,0.03)" : "transparent",
                    alignItems: "center",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {isOwn && (
                      <span
                        style={{
                          fontSize: "9px",
                          background: "rgba(255,210,8,0.15)",
                          border: "1px solid rgba(255,210,8,0.3)",
                          color: "#FFD208",
                          borderRadius: "4px",
                          padding: "1px 5px",
                          fontWeight: 700,
                          fontFamily: "monospace",
                        }}
                      >
                        YOU
                      </span>
                    )}
                    <span style={{ fontSize: "12px", fontFamily: "monospace", color: isOwn ? "#FFD208" : "#6b6860" }}>
                      {truncate(ev.actor)}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 700 }}>
                    {ev.kind === "swap" ? (
                      <>
                        <span style={{ color: ev.aToB ? "#fbbf24" : "#60a5fa" }}>{ev.aToB ? "cUSDT" : "cETH"}</span>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#3a3832" strokeWidth="1.5">
                          <path d="M1 5h8M6 2l3 3-3 3" />
                        </svg>
                        <span style={{ color: ev.aToB ? "#60a5fa" : "#fbbf24" }}>{ev.aToB ? "cETH" : "cUSDT"}</span>
                      </>
                    ) : (
                      <span style={{ color: ev.kind === "add" ? "#4ade80" : "#fb923c" }}>
                        {ev.kind === "add" ? "Add liquidity" : "Remove liquidity"}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: "13px",
                      fontFamily: "monospace",
                      color: "rgba(240,237,230,0.18)",
                      letterSpacing: "2px",
                    }}
                  >
                    ░░ ENCRYPTED ░░
                  </div>
                  <div style={{ fontSize: "11px", color: "#3a3832", fontFamily: "monospace" }}>
                    {ev.timestamp > 0 ? formatAge(ev.timestamp) : `#${ev.blockNumber.toString()}`}
                  </div>
                  <div>
                    <a
                      href={`https://sepolia.etherscan.io/tx/${ev.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: "11px", color: "#FFD208", textDecoration: "none", fontFamily: "monospace" }}
                    >
                      View →
                    </a>
                  </div>
                </div>
              );
            })}

            {/* Footer */}
            <div style={{ padding: "12px 8px 0", fontSize: "10px", color: "#3a3832", fontFamily: "monospace" }}>
              {filtered.length} {filtered.length === 1 ? "activity" : "activities"} found · Amounts encrypted by FHE
            </div>
          </>
        )}
      </div>
    </div>
  );
}
