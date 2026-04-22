"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { CONTRACTS } from "~~/hooks/useCipherDEX";

export function SettingsPage({}: { isMobile?: boolean } = {}) {
  const { address, isConnected } = useAccount();
  const [slippage, setSlippage] = useState("0.5");
  const [customSlippage, setCustomSlippage] = useState("");

  function clearSession() {
    if (typeof window === "undefined") return;
    // Session storage may hold third-party keys; FHE decrypt signatures live in memory until reload.
    sessionStorage.clear();
    window.location.reload();
  }

  const card: React.CSSProperties = {
    background: "rgba(23,23,20,0.5)",
    border: "1px solid rgba(255,255,245,0.06)",
    borderRadius: "14px",
    padding: "20px",
    backdropFilter: "blur(14px)",
    marginBottom: "16px",
  };
  const sectionLabel: React.CSSProperties = {
    fontSize: "11px",
    color: "#3a3832",
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    fontFamily: "monospace",
    marginBottom: "16px",
  };

  const Toggle = ({
    on,
    label,
    sublabel,
    locked,
  }: {
    on: boolean;
    label: string;
    sublabel: string;
    locked?: boolean;
  }) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        padding: "12px 0",
        borderBottom: "1px solid rgba(255,255,245,0.04)",
      }}
    >
      <div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: locked ? "#3a3832" : "#f0ede6" }}>{label}</div>
        <div style={{ fontSize: "11px", color: "#3a3832", marginTop: "3px" }}>{sublabel}</div>
      </div>
      <div
        style={{
          width: "42px",
          height: "24px",
          borderRadius: "12px",
          background: on ? (locked ? "rgba(255,210,8,0.3)" : "#FFD208") : "rgba(255,255,245,0.08)",
          position: "relative",
          cursor: locked ? "not-allowed" : "pointer",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: "18px",
            height: "18px",
            borderRadius: "50%",
            background: on ? (locked ? "rgba(255,255,255,0.4)" : "#000") : "#3a3832",
            position: "absolute",
            top: "3px",
            left: on ? "21px" : "3px",
            transition: "left 0.2s",
          }}
        />
      </div>
    </div>
  );

  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: "22px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: 900, letterSpacing: "-0.04em" }}>
          <span style={{ color: "#FFD208" }}>Settings</span>
        </h1>
        <p style={{ fontSize: "13px", color: "#6b6860", marginTop: "3px" }}>
          Configure trading preferences and privacy options
        </p>
      </div>

      {/* Privacy settings */}
      <div style={card}>
        <div style={sectionLabel}>Privacy Settings</div>
        <Toggle
          on
          label="MEV Protection"
          sublabel="All swap amounts encrypted via FHE before submission - always active"
          locked
        />
        <Toggle on label="FHE Encryption" sublabel="Uses Zama FHEVM to keep trade sizes confidential on-chain" locked />
        <Toggle
          on
          label="Encrypted Balances"
          sublabel="Your cUSDT and cETH balances are encrypted - only you can reveal them"
          locked
        />
        <div style={{ marginTop: "12px", fontSize: "11px", color: "#3a3832", fontFamily: "monospace" }}>
          Privacy features are enforced at the protocol level and cannot be disabled.
        </div>
      </div>

      {/* Slippage */}
      <div style={card}>
        <div style={sectionLabel}>Slippage Tolerance</div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {["0.1", "0.5", "1.0"].map(s => (
            <button
              key={s}
              onClick={() => {
                setSlippage(s);
                setCustomSlippage("");
              }}
              style={{
                background: slippage === s && !customSlippage ? "#FFD208" : "rgba(255,255,245,0.04)",
                border: `1px solid ${slippage === s && !customSlippage ? "#FFD208" : "rgba(255,255,245,0.08)"}`,
                borderRadius: "8px",
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: 700,
                color: slippage === s && !customSlippage ? "#000" : "#6b6860",
                cursor: "pointer",
                fontFamily: "'Cabinet Grotesk',sans-serif",
              }}
            >
              {s}%
            </button>
          ))}
          <input
            placeholder="Custom %"
            value={customSlippage}
            onChange={e => {
              setCustomSlippage(e.target.value);
              setSlippage(e.target.value || "0.5");
            }}
            style={{
              background: "rgba(255,255,245,0.04)",
              border: "1px solid rgba(255,255,245,0.08)",
              borderRadius: "8px",
              padding: "8px 12px",
              fontSize: "13px",
              fontWeight: 600,
              color: "#f0ede6",
              fontFamily: "'Cabinet Grotesk',sans-serif",
              width: "100px",
              outline: "none",
            }}
          />
        </div>
        <div style={{ fontSize: "11px", color: "#3a3832", marginTop: "10px" }}>
          Current: {customSlippage || slippage}% - Applied to all swaps as minimum received protection
        </div>
      </div>

      {/* Contract addresses */}
      <div style={card}>
        <div style={sectionLabel}>Contract Addresses (Sepolia)</div>
        {[
          { label: "cUSDT", addr: CONTRACTS.cUSDT },
          { label: "cETH", addr: CONTRACTS.cETH },
          { label: "CipherDEX Pool", addr: CONTRACTS.pool },
          { label: "Faucet", addr: CONTRACTS.faucet },
        ].map(row => (
          <div
            key={row.label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 0",
              borderBottom: "1px solid rgba(255,255,245,0.04)",
            }}
          >
            <span style={{ fontSize: "12px", color: "#6b6860" }}>{row.label}</span>
            <a
              href={`https://sepolia.etherscan.io/address/${row.addr}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: "11px", fontFamily: "monospace", color: "#FFD208", textDecoration: "none" }}
            >
              {row.addr ? `${row.addr.slice(0, 10)}…${row.addr.slice(-6)}` : "-"}
            </a>
          </div>
        ))}
      </div>

      {/* Session */}
      <div style={card}>
        <div style={sectionLabel}>Session</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600 }}>Connected Wallet</div>
            <div style={{ fontSize: "11px", color: "#3a3832", fontFamily: "monospace", marginTop: "3px" }}>
              {isConnected && address ? `${address.slice(0, 10)}…${address.slice(-6)}` : "Not connected"}
            </div>
          </div>
          <button
            onClick={clearSession}
            style={{
              background: "rgba(255,60,60,0.08)",
              border: "1px solid rgba(255,60,60,0.2)",
              borderRadius: "8px",
              padding: "8px 16px",
              fontSize: "12px",
              fontWeight: 700,
              color: "#ff6060",
              cursor: "pointer",
              fontFamily: "'Cabinet Grotesk',sans-serif",
            }}
          >
            Clear session and reload
          </button>
        </div>
        <div style={{ marginTop: "12px", fontSize: "11px", color: "#3a3832", lineHeight: 1.45 }}>
          {
            "Clears this site's session storage, then reloads the page so in-memory FHE data (like decryption signatures) is reset. After reload, revealing balances may ask for wallet confirmation again."
          }
        </div>
      </div>

      {/* Version */}
      <div
        style={{ fontSize: "11px", color: "#3a3832", fontFamily: "monospace", textAlign: "center", padding: "8px 0" }}
      >
        CipherDEX v1.0.0 · Zama FHEVM · Sepolia Testnet · Built for Season 2 Builder Track
      </div>
    </div>
  );
}
