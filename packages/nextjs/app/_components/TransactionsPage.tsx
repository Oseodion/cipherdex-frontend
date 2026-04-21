"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getContractEvents } from "viem/actions";
import { usePublicClient } from "wagmi";
import PoolABI from "~~/contracts/CipherDEXPool.json";
import { CONTRACTS } from "~~/hooks/useCipherDEX";

type SwapEvent = {
  trader: string;
  aToB: boolean;
  timestamp: number;
  txHash: string;
  blockNumber: bigint;
};

type Filter = "All" | "cUSDT→cETH" | "cETH→cUSDT";
const LOOKBACK_BLOCKS = 120000n;

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
  const [events, setEvents] = useState<SwapEvent[]>([]);
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
      const chunk = 10000n;
      let from = fromBlock;
      const rawLogs: any[] = [];

      while (from <= latest) {
        const to = from + chunk - 1n <= latest ? from + chunk - 1n : latest;
        const logs = await getContractEvents(publicClient, {
          address: CONTRACTS.pool,
          abi: PoolABI.abi,
          eventName: "Swap",
          fromBlock: from,
          toBlock: to,
          strict: false,
        });
        rawLogs.push(...(logs as any[]));
        from = to + 1n;
      }

      // Deduplicate by txHash + logIndex
      const seen = new Set<string>();
      const deduped = rawLogs.filter(log => {
        const key = `${log.transactionHash}:${log.logIndex}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const parsed: SwapEvent[] = deduped
        .map((log: any) => ({
          trader: log.args?.trader as string,
          aToB: log.args?.aToB as boolean,
          timestamp: Number(log.args?.timestamp ?? 0n),
          txHash: log.transactionHash as string,
          blockNumber: log.blockNumber as bigint,
        }))
        .filter(e => e.timestamp > 0 && e.trader)
        .sort((a, b) => b.timestamp - a.timestamp);

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
    return () => window.removeEventListener("cipherdex:swap-confirmed", onSwapConfirmed);
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === "cUSDT→cETH") return events.filter(e => e.aToB);
    if (filter === "cETH→cUSDT") return events.filter(e => !e.aToB);
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
          All swaps are encrypted - amounts are never revealed on-chain
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        {(["All", "cUSDT→cETH", "cETH→cUSDT"] as Filter[]).map(f => (
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
            {/* Column headers — hidden on mobile */}
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
            {filtered.map((ev, i) => {
              const isOwn = address && ev.trader.toLowerCase() === address.toLowerCase();
              return isMobile ? (
                <div
                  key={`${ev.txHash}-${i}`}
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
                        {truncate(ev.trader)}
                      </span>
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 700 }}
                    >
                      <span style={{ color: ev.aToB ? "#fbbf24" : "#60a5fa" }}>{ev.aToB ? "cUSDT" : "cETH"}</span>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#3a3832" strokeWidth="1.5">
                        <path d="M1 5h8M6 2l3 3-3 3" />
                      </svg>
                      <span style={{ color: ev.aToB ? "#60a5fa" : "#fbbf24" }}>{ev.aToB ? "cETH" : "cUSDT"}</span>
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
                  key={`${ev.txHash}-${i}`}
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
                      {truncate(ev.trader)}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 700 }}>
                    <span style={{ color: ev.aToB ? "#fbbf24" : "#60a5fa" }}>{ev.aToB ? "cUSDT" : "cETH"}</span>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#3a3832" strokeWidth="1.5">
                      <path d="M1 5h8M6 2l3 3-3 3" />
                    </svg>
                    <span style={{ color: ev.aToB ? "#60a5fa" : "#fbbf24" }}>{ev.aToB ? "cETH" : "cUSDT"}</span>
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
              {filtered.length} swap{filtered.length !== 1 ? "s" : ""} found · Amounts encrypted by FHE
            </div>
          </>
        )}
      </div>
    </div>
  );
}
