"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import PoolABI from "~~/contracts/CipherDEXPool.json";
import { CONTRACTS } from "~~/hooks/useCipherDEX";
import { fetchEventLogsChunked } from "~~/utils/helper/fetchEventLogs";

type SwapRecord = {
  trader: string;
  aToB: boolean;
  timestamp: number;
  txHash: string;
  blockNumber: bigint;
};
const LOOKBACK_BLOCKS = 60000n;
const QUICK_LOOKBACK_BLOCKS = 8000n;

const truncate = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

export function AuditViewPage({ address, isMobile }: { address?: string; isMobile?: boolean }) {
  const publicClient = usePublicClient();
  const [events, setEvents] = useState<SwapRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [proofCount, setProofCount] = useState(() => {
    if (typeof window === "undefined") return 0;
    const stored = localStorage.getItem("cipherdex_fhe_proofs");
    return stored ? parseInt(stored, 10) : 0;
  });

  useEffect(() => {
    const refreshProofCount = () => {
      const stored = localStorage.getItem("cipherdex_fhe_proofs");
      setProofCount(stored ? parseInt(stored, 10) : 0);
    };
    refreshProofCount();
    window.addEventListener("cipherdex:swap-confirmed", refreshProofCount);
    return () => window.removeEventListener("cipherdex:swap-confirmed", refreshProofCount);
  }, []);

  useEffect(() => {
    if (!publicClient) return;
    (async () => {
      setLoading(true);
      try {
        const latest = await publicClient.getBlockNumber();
        const from = latest > LOOKBACK_BLOCKS ? latest - LOOKBACK_BLOCKS : 0n;
        const quickFrom = latest > QUICK_LOOKBACK_BLOCKS ? latest - QUICK_LOOKBACK_BLOCKS : 0n;
        const parse = (rawLogs: any[]) => {
          // Deduplicate by txHash + logIndex
          const seen = new Set<string>();
          const deduped = rawLogs.filter(log => {
            const key = `${log.transactionHash}:${log.logIndex}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          return deduped
            .map((l: any) => ({
              trader: l.args?.trader,
              aToB: l.args?.aToB,
              timestamp: Number(l.args?.timestamp ?? 0n),
              txHash: l.transactionHash,
              blockNumber: l.blockNumber,
            }))
            .filter(e => e.timestamp > 0 && e.trader)
            .sort((a, b) => b.timestamp - a.timestamp);
        };

        const quickLogs = await fetchEventLogsChunked({
          publicClient,
          address: CONTRACTS.pool,
          abi: PoolABI.abi,
          eventName: "Swap",
          fromBlock: quickFrom,
          toBlock: latest,
        });
        setEvents(parse(quickLogs));
        setLoading(false);

        if (quickFrom > from) {
          void fetchEventLogsChunked({
            publicClient,
            address: CONTRACTS.pool,
            abi: PoolABI.abi,
            eventName: "Swap",
            fromBlock: from,
            toBlock: latest,
          })
            .then(fullLogs => setEvents(parse(fullLogs)))
            .catch(() => {
              // keep quick results if backfill fails
            });
        }
      } catch {
        // Silently fail - still show the page
      } finally {
        setLoading(false);
      }
    })();
  }, [publicClient]);

  function downloadReport() {
    const report = {
      generated: new Date().toISOString(),
      contract: CONTRACTS.pool,
      network: "Sepolia",
      totalSwaps: events.length,
      note: "Swap amounts are FHE-encrypted. Handles are stored on-chain but values are only accessible to authorised parties via the Zama FHEVM ACL.",
      swaps: events.map(e => ({
        txHash: e.txHash,
        trader: e.trader,
        direction: e.aToB ? "cUSDT→cETH" : "cETH→cUSDT",
        timestamp: e.timestamp,
        blockNumber: e.blockNumber.toString(),
        encryptedAmountIn: "0x[FHE handle - not revealed]",
        encryptedAmountOut: "0x[FHE handle - not revealed]",
      })),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cipherdex-audit-report.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const card: React.CSSProperties = {
    background: "rgba(23,23,20,0.5)",
    border: "1px solid rgba(255,255,245,0.06)",
    borderRadius: "14px",
    padding: "20px",
    backdropFilter: "blur(14px)",
  };

  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          marginBottom: "22px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: "26px", fontWeight: 900, letterSpacing: "-0.04em" }}>
            Audit <span style={{ color: "#FFD208" }}>View</span>
          </h1>
          <p style={{ fontSize: "13px", color: "#6b6860", marginTop: "3px" }}>
            FHE compliance log - proves trade integrity without revealing amounts
          </p>
          {loading && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                marginTop: "8px",
                padding: "4px 10px",
                borderRadius: "999px",
                border: "1px solid rgba(255,210,8,0.24)",
                background: "rgba(255,210,8,0.08)",
                color: "#FFD208",
                fontSize: "10px",
                fontFamily: "monospace",
                fontWeight: 700,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
                <path d="M5 1a4 4 0 0 1 4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0 5 5"
                    to="360 5 5"
                    dur="0.9s"
                    repeatCount="indefinite"
                  />
                </path>
              </svg>
              Loading stats…
            </div>
          )}
        </div>
        <button
          onClick={downloadReport}
          style={{
            background: "rgba(255,210,8,0.1)",
            border: "1px solid rgba(255,210,8,0.3)",
            borderRadius: "10px",
            padding: "10px 18px",
            fontSize: "12px",
            fontWeight: 700,
            color: "#FFD208",
            cursor: "pointer",
            fontFamily: "'Cabinet Grotesk',sans-serif",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#FFD208" strokeWidth="1.5">
            <path d="M6.5 1v8M3 7l3.5 4 3.5-4M1 12h11" />
          </svg>
          Download Audit Report
        </button>
      </div>

      {/* Privacy guarantee */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: "12px",
          marginBottom: "18px",
        }}
      >
        <div style={{ ...card, borderColor: "rgba(255,60,60,0.2)" }}>
          <div
            style={{
              fontSize: "10px",
              color: "#ff6060",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontFamily: "monospace",
              marginBottom: "12px",
            }}
          >
            Public AMM (Uniswap-style)
          </div>
          {[
            "Swap amount visible in mempool",
            "Front-running trivially possible",
            "MEV bots extract value pre-trade",
            "Order size leaked to competitors",
          ].map(item => (
            <div
              key={item}
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "flex-start",
                marginBottom: "8px",
                fontSize: "12px",
                color: "#6b6860",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="#ff6060"
                strokeWidth="1.5"
                style={{ flexShrink: 0, marginTop: "1px" }}
              >
                <path d="M3 3l8 8M11 3l-8 8" />
              </svg>
              {item}
            </div>
          ))}
        </div>
        <div style={{ ...card, borderColor: "rgba(255,210,8,0.2)", background: "rgba(255,210,8,0.04)" }}>
          <div
            style={{
              fontSize: "10px",
              color: "#FFD208",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontFamily: "monospace",
              marginBottom: "12px",
            }}
          >
            CipherDEX (FHE-encrypted)
          </div>
          {[
            "Swap amount encrypted before submission",
            "Front-running mathematically impossible",
            "MEV bots see only encrypted ciphertext",
            "Amounts provably private via ZK+FHE",
          ].map(item => (
            <div
              key={item}
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "flex-start",
                marginBottom: "8px",
                fontSize: "12px",
                color: "#f0ede6",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="#FFD208"
                strokeWidth="2"
                style={{ flexShrink: 0, marginTop: "1px" }}
              >
                <path d="M2 7l4 4 6-7" />
              </svg>
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* ACL explanation */}
      <div style={{ ...card, marginBottom: "18px" }}>
        <div
          style={{
            fontSize: "11px",
            color: "#3a3832",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontFamily: "monospace",
            marginBottom: "14px",
          }}
        >
          Zama ACL - Access Control List
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "14px" }}>
          {[
            { who: "Trader", can: "Decrypt their own swap amounts (after Zama gateway processes request)" },
            { who: "Pool Contract", can: "Access encrypted reserves for AMM arithmetic (transient permission)" },
            { who: "MEV Bot", can: "Nothing - encrypted handles are useless without ACL permission" },
            { who: "Auditor", can: "View tx hashes, addresses, and directions - amounts remain hidden" },
          ].map(row => (
            <div key={row.who} style={{ background: "rgba(255,255,245,0.03)", borderRadius: "10px", padding: "12px" }}>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#FFD208",
                  marginBottom: "5px",
                  fontFamily: "monospace",
                }}
              >
                {row.who}
              </div>
              <div style={{ fontSize: "11px", color: "#6b6860", lineHeight: 1.5 }}>{row.can}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Session proof count */}
      <div style={{ ...card, marginBottom: "18px", display: "flex", alignItems: "center", gap: "16px" }}>
        <div
          style={{
            width: "52px",
            height: "52px",
            background: "rgba(255,210,8,0.07)",
            border: "1px solid rgba(255,210,8,0.22)",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#FFD208" strokeWidth="1.5">
            <path d="M11 2L20 7V15C20 19 11 21 11 21C11 21 2 19 2 15V7Z" />
            <path d="M8 11l2 2 4-4" stroke="#FFD208" strokeWidth="2" />
          </svg>
        </div>
        <div>
          <div
            style={{
              fontSize: "11px",
              color: "#3a3832",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontFamily: "monospace",
              marginBottom: "4px",
            }}
          >
            FHE Proofs Verified This Session
          </div>
          <div style={{ fontSize: "28px", fontWeight: 900, fontFamily: "monospace", color: "#FFD208" }}>
            {proofCount}
          </div>
          <div style={{ fontSize: "11px", color: "#6b6860" }}>
            Each encrypted input is validated by Zama&apos;s proof system before the EVM executes
          </div>
          <div style={{ fontSize: "10px", color: "#3a3832", marginTop: "4px", fontFamily: "monospace" }}>
            Estimated on-chain proofs in loaded history: {events.length * 2}
          </div>
        </div>
      </div>

      {/* Encrypted trade log */}
      <div style={card}>
        <div
          style={{
            fontSize: "11px",
            color: "#3a3832",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontFamily: "monospace",
            marginBottom: "14px",
          }}
        >
          Encrypted Trade Log ({events.length} records)
        </div>
        {loading && (
          <div style={{ color: "#3a3832", fontFamily: "monospace", fontSize: "12px" }}>Scanning Sepolia…</div>
        )}
        {!loading && events.length === 0 && (
          <div style={{ color: "#3a3832", fontFamily: "monospace", fontSize: "12px" }}>No swaps recorded yet</div>
        )}
        {events.slice(0, 10).map((ev, i) => {
          const isOwn = address && ev.trader.toLowerCase() === address.toLowerCase();
          const ageStr =
            ev.timestamp > 0
              ? (() => {
                  const delta = Math.max(0, Math.floor(Date.now() / 1000) - ev.timestamp);
                  if (delta < 60) return "just now";
                  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
                  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
                  return `${Math.floor(delta / 86400)}d ago`;
                })()
              : `block #${ev.blockNumber}`;
          return (
            <div
              key={ev.txHash + i}
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "120px 110px 1fr 100px 80px",
                gap: "8px",
                padding: "10px 0",
                borderBottom: i < Math.min(events.length, 10) - 1 ? "1px solid rgba(255,255,245,0.04)" : "none",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontFamily: "monospace",
                  color: isOwn ? "#FFD208" : "#3a3832",
                }}
              >
                {truncate(ev.trader)}
              </div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: ev.aToB ? "#fbbf24" : "#60a5fa" }}>
                {ev.aToB ? "cUSDT→cETH" : "cETH→cUSDT"}
              </div>
              <div
                style={{
                  fontSize: "11px",
                  fontFamily: "monospace",
                  color: "rgba(240,237,230,0.15)",
                  letterSpacing: "1px",
                }}
              >
                Amount: ▓▓▓▓▓▓▓▓
              </div>
              <div style={{ fontSize: "10px", color: "#3a3832", fontFamily: "monospace" }}>{ageStr}</div>
              <a
                href={`https://sepolia.etherscan.io/tx/${ev.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: "11px", color: "#FFD208", textDecoration: "none", fontFamily: "monospace" }}
              >
                {ev.txHash.slice(0, 8)}…
              </a>
            </div>
          );
        })}
        {events.length > 10 && (
          <div style={{ fontSize: "11px", color: "#3a3832", fontFamily: "monospace", marginTop: "12px" }}>
            +{events.length - 10} more - download the full audit report
          </div>
        )}
      </div>
    </div>
  );
}
