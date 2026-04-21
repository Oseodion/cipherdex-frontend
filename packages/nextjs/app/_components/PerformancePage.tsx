"use client";

import { usePoolInit } from "~~/hooks/usePoolInit";
import { usePoolStats } from "~~/hooks/usePoolStats";

const DAY_LABELS = Array.from({ length: 28 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (27 - i));
  return d.toLocaleDateString("en", { month: "short", day: "numeric" });
});

function txHashToHeight(hash: string, bar: number): number {
  let h = bar * 1009;
  for (let i = 0; i < hash.length; i++) {
    h = (h * 31 + hash.charCodeAt(i)) | 0;
  }
  return 20 + (Math.abs(h) % 71); // 20%-90%
}

export function PerformancePage({ isMobile }: { isMobile?: boolean }) {
  const { activeTraders, totalTrades, heatmapCounts, recentTrades, swapRecords, loading } = usePoolStats();
  const { snapshotA, snapshotB } = usePoolInit();

  const maxCount = Math.max(...heatmapCounts, 1);
  const normalised = heatmapCounts.map(c => c / maxCount);

  const card: React.CSSProperties = {
    background: "rgba(23,23,20,0.5)",
    border: "1px solid rgba(255,255,245,0.06)",
    borderRadius: "14px",
    padding: "20px",
    backdropFilter: "blur(14px)",
  };

  const snapshotADisplay = snapshotA
    ? (Number(snapshotA) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "-";
  const snapshotBDisplay = snapshotB
    ? (Number(snapshotB) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 4 })
    : "-";

  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: "22px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: 900, letterSpacing: "-0.04em" }}>
          Pool <span style={{ color: "#FFD208" }}>Performance</span>
        </h1>
        <p style={{ fontSize: "13px", color: "#6b6860", marginTop: "3px" }}>
          On-chain activity metrics - trade volumes are encrypted, counts are public
        </p>
      </div>

      {/* Summary stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)",
          gap: "10px",
          marginBottom: "20px",
        }}
      >
        {[
          { label: "Total Trades", value: totalTrades.toString(), sub: "All time" },
          { label: "Active Traders", value: activeTraders.toString(), sub: "Unique addresses" },
          { label: "Reserve cUSDT", value: snapshotADisplay, sub: "Snapshot" },
          { label: "Reserve cETH", value: snapshotBDisplay, sub: "Snapshot" },
        ].map(s => (
          <div
            key={s.label}
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
              {s.label}
            </div>
            <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "monospace" }}>{s.value}</div>
            <div style={{ fontSize: "10px", color: "#3a3832", marginTop: "4px" }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* 28-day heatmap */}
      <div style={{ ...card, marginBottom: "18px" }}>
        <div
          style={{
            fontSize: "11px",
            color: "#3a3832",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontFamily: "monospace",
            marginBottom: "16px",
          }}
        >
          28-Day Trade Activity
        </div>
        <div style={{ display: "flex", gap: "4px", alignItems: "flex-end", height: "60px" }}>
          {normalised.map((n, i) => (
            <div
              key={i}
              title={`${DAY_LABELS[i]}: ${heatmapCounts[i]} swap${heatmapCounts[i] !== 1 ? "s" : ""}`}
              style={{
                flex: 1,
                borderRadius: "3px 3px 0 0",
                background: n > 0 ? `rgba(255,210,8,${0.2 + n * 0.8})` : "rgba(255,210,8,0.05)",
                height: `${Math.max(n * 100, n > 0 ? 8 : 4)}%`,
                minHeight: n > 0 ? "8px" : "4px",
                transition: "height 0.3s ease",
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px" }}>
          <span style={{ fontSize: "9px", color: "#3a3832", fontFamily: "monospace" }}>{DAY_LABELS[0]}</span>
          <span style={{ fontSize: "9px", color: "#3a3832", fontFamily: "monospace" }}>Today</span>
        </div>
      </div>

      {/* Volume chart (encrypted - show block graphic per design rules) */}
      <div style={{ ...card, marginBottom: "18px" }}>
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
          Volume (Encrypted)
        </div>
        <div style={{ display: "flex", gap: "3px", alignItems: "flex-end", height: "60px", width: "100%" }}>
          {Array.from({ length: 14 }, (_, i) => {
            const seed = swapRecords.length > 0 ? swapRecords[i % swapRecords.length].txHash : `fallback-${i}`;
            const heightPct = txHashToHeight(seed, i);
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  background: `rgba(255,210,8,${0.15 + (i / 13) * 0.7})`,
                  borderRadius: "2px 2px 0 0",
                  height: `${heightPct}%`,
                  animation: `volumePulse ${1.8 + i * 0.12}s ease-in-out infinite alternate`,
                  minHeight: "4px",
                }}
              />
            );
          })}
        </div>
        <div style={{ fontSize: "11px", color: "#3a3832", marginTop: "10px" }}>
          Swap amounts are FHE-encrypted - volume is provably private
        </div>
        <style>{`@keyframes volumePulse { from { opacity: 0.4; } to { opacity: 1; } }`}</style>
      </div>

      {/* Recent trades */}
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
          Recent Swaps
        </div>
        {loading && recentTrades.length === 0 && (
          <div style={{ fontSize: "13px", color: "#3a3832", fontFamily: "monospace" }}>Loading…</div>
        )}
        {!loading && recentTrades.length === 0 && (
          <div style={{ fontSize: "13px", color: "#3a3832", fontFamily: "monospace" }}>No swaps recorded yet</div>
        )}
        {recentTrades.map((t, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 0",
              borderBottom: i < recentTrades.length - 1 ? "1px solid rgba(255,255,245,0.04)" : "none",
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: "rgba(255,255,245,0.04)",
                border: "1px solid rgba(255,255,245,0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#FFD208" strokeWidth="1.5">
                <path d="M1 5h8M6 2l3 3-3 3" />
              </svg>
            </div>
            <div style={{ fontSize: "11px", fontFamily: "monospace", color: "#3a3832", flex: 1 }}>{t}</div>
            <div
              style={{
                fontSize: "13px",
                fontFamily: "monospace",
                color: "rgba(240,237,230,0.18)",
                letterSpacing: "2px",
              }}
            >
              ░░░░
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
