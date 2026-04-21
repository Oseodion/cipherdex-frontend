"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuditViewPage } from "./AuditViewPage";
import { LiquidityPoolsPage } from "./LiquidityPoolsPage";
import { PerformancePage } from "./PerformancePage";
import { PortfolioPage } from "./PortfolioPage";
import { SettingsPage } from "./SettingsPage";
import { TransactionsPage } from "./TransactionsPage";
import { useFhevm } from "@fhevm-sdk";
import { useConnectorClient } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/helper/RainbowKitCustomConnectButton";
import { useBalances } from "~~/hooks/useBalances";
import { useCipherDEX } from "~~/hooks/useCipherDEX";
import { useFaucet } from "~~/hooks/useFaucet";
import { usePoolInit } from "~~/hooks/usePoolInit";
import { usePoolStats } from "~~/hooks/usePoolStats";
import { useSwap } from "~~/hooks/useSwap";

export function SwapPage() {
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [revealed, setRevealed] = useState<{ [k: number]: boolean }>({});
  const [revealing, setRevealing] = useState<{ [k: number]: boolean }>({});
  const [displayBals, setDisplayBals] = useState<{ [k: number]: string }>({ 1: "▓▓▓▓▓▓▓▓", 2: "▓▓▓▓▓▓▓▓" });
  const [amountIn, setAmountIn] = useState("1000");
  const [amountOut, setAmountOut] = useState<string | null>(null);
  const [isAToB, setIsAToB] = useState(true);
  const [toastVisible, setToastVisible] = useState(false);
  const [slippage, setSlippage] = useState("0.5");
  const [showSlippage, setShowSlippage] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [decryptUiError, setDecryptUiError] = useState<string | null>(null);
  const revealTimeoutRef = useRef<number | null>(null);
  const [fheUnsupportedReason, setFheUnsupportedReason] = useState<string | null>(null);

  const { address, isConnected, chainId } = useCipherDEX();
  const { data: connectorClient } = useConnectorClient();
  const provider = useMemo(() => {
    const globalProvider = typeof window !== "undefined" ? (window as any).ethereum : undefined;
    if (globalProvider) return globalProvider;
    if (!connectorClient) return undefined;
    return (connectorClient as any).transport?.value?.provider ?? (connectorClient as any).transport;
  }, [connectorClient]);

  const { instance: fhevmInstance, status: fhevmStatus, error: fhevmError } = useFhevm({
    provider,
    chainId,
    enabled: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Balances (must be declared before useFaucet so refetch is available) ---
  const [pendingReveal, setPendingReveal] = useState<number | null>(null);
  const [decryptRequest, setDecryptRequest] = useState<number | null>(null);
  const { cUSDTBalance, cETHBalance, isDecrypting, canDecrypt, decrypt, refetch } = useBalances(
    address,
    isConnected,
    chainId,
    fhevmInstance,
  );

  // --- Faucet: refetch balances on confirmed claim ---
  const handleFaucetSuccess = useCallback(() => {
    // Reset reveals so user sees updated encrypted handles after refetch
    setRevealed({});
    setDisplayBals({ 1: "▓▓▓▓▓▓▓▓", 2: "▓▓▓▓▓▓▓▓" });
    refetch();
  }, [refetch]);
  const { claim, isClaiming, canClaim, cooldownRemaining, cooldownFormatted } = useFaucet(handleFaucetSuccess);

  // --- Swap hook ---
  const {
    swap,
    isSwapping: isRealSwapping,
    txStep: realTxStep,
    swapError,
    swapSuccess,
    isConfirmed,
    canSwap,
    txHash,
    reset: resetSwap,
  } = useSwap(fhevmInstance);

  const {
    activeTraders,
    totalTrades,
    heatmapCounts,
    recentTrades,
    loading: statsLoading,
    refreshing: statsRefreshing,
    refetch: poolRefetch,
  } = usePoolStats();
  const { poolInitialized, snapshotA, snapshotB, rateUSDTperETH, refetch: poolInitRefetch } = usePoolInit();

  // --- Balance reveal animation ---
  // Only run animation once per pendingReveal when balance is available
  const runningReveal = useRef<{ [k: number]: boolean }>({});
  useEffect(() => {
    if (pendingReveal === null) return;
    const bal = pendingReveal === 1 ? cUSDTBalance : cETHBalance;
    if (bal === null || bal === undefined) return;
    if (runningReveal.current[pendingReveal]) return;
    runningReveal.current[pendingReveal] = true;

    const target = bal;
    let iterations = 0;
    const iv = setInterval(() => {
      setDisplayBals(prev => ({
        ...prev,
        [pendingReveal]: target
          .split("")
          .map((char, idx) => {
            if (char === "," || char === ".") return char;
            if (idx < iterations) return char;
            return ALPHA[Math.floor(Math.random() * ALPHA.length)];
          })
          .join(""),
      }));
      iterations += 1 / 5;
      if (iterations >= target.length) {
        clearInterval(iv);
        setDisplayBals(prev => ({ ...prev, [pendingReveal]: target }));
        setRevealed(prev => ({ ...prev, [pendingReveal]: true }));
        setRevealing(prev => ({ ...prev, [pendingReveal]: false }));
        runningReveal.current[pendingReveal] = false;
        setPendingReveal(null);
      }
    }, 30);
    return () => {
      clearInterval(iv);
      runningReveal.current[pendingReveal] = false;
    };
  }, [pendingReveal, cUSDTBalance, cETHBalance]);

  useEffect(() => {
    if (decryptRequest === null) return;
    if (isDecrypting) return;

    const bal = decryptRequest === 1 ? cUSDTBalance : cETHBalance;
    if (bal === null || bal === undefined) return;

    setPendingReveal(decryptRequest);
    setDecryptRequest(null);
  }, [decryptRequest, isDecrypting, cUSDTBalance, cETHBalance]);

  useEffect(() => {
    if (decryptRequest === null) return;
    if (revealTimeoutRef.current) {
      window.clearTimeout(revealTimeoutRef.current);
    }
    revealTimeoutRef.current = window.setTimeout(() => {
      const n = decryptRequest;
      setDecryptUiError("Decrypt did not return a balance in time. Please retry.");
      setDecryptRequest(null);
      setRevealing(prev => ({ ...prev, [n]: false }));
    }, 25000);

    return () => {
      if (revealTimeoutRef.current) {
        window.clearTimeout(revealTimeoutRef.current);
        revealTimeoutRef.current = null;
      }
    };
  }, [decryptRequest]);

  // --- After swap settles: run amountOut count-up then show toast ---
  // Use refs for values that shouldn't re-trigger the effect
  const amountInRef = useRef(amountIn);
  const isAToBRef = useRef(isAToB);
  const RATERef = useRef(0);
  const refetchRef = useRef(refetch);
  const toastTxHashRef = useRef<string | undefined>(undefined);
  const animationRanRef = useRef(false);
  const finalizedTxRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    amountInRef.current = amountIn;
  }, [amountIn]);
  useEffect(() => {
    isAToBRef.current = isAToB;
  }, [isAToB]);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);
  useEffect(() => {
    if (txHash) {
      toastTxHashRef.current = txHash;
    }
  }, [txHash]);

  // Hard fallback: always finalize post-swap UI exactly once per tx hash.
  useEffect(() => {
    const completed = swapSuccess || isConfirmed;
    const hash = txHash ?? toastTxHashRef.current;
    if (!completed || !hash) return;
    if (finalizedTxRef.current === hash) return;
    finalizedTxRef.current = hash;

    toastTxHashRef.current = hash;
    setToastVisible(true);
    window.setTimeout(() => setToastVisible(false), 5000);

    // Hide balances immediately so next reveal gets fresh encrypted handles.
    setRevealing({});
    setRevealed({});
    setPendingReveal(null);
    setDisplayBals({ 1: "▓▓▓▓▓▓▓▓", 2: "▓▓▓▓▓▓▓▓" });

    poolRefetch();
    window.dispatchEvent(new CustomEvent("cipherdex:swap-confirmed", { detail: { txHash: hash } }));
    window.setTimeout(() => poolInitRefetch(), 1200);

    if (typeof window !== "undefined") {
      const prev = parseInt(localStorage.getItem("cipherdex_fhe_proofs") ?? "0", 10);
      localStorage.setItem("cipherdex_fhe_proofs", String(prev + 2));
    }

    window.setTimeout(() => {
      refetchRef.current().finally(() => {
        setAmountIn("");
        setAmountOut(null);
        animationRanRef.current = false;
        resetSwap();
      });
    }, 1800);
  }, [swapSuccess, isConfirmed, txHash, poolRefetch, poolInitRefetch, resetSwap]);

  useEffect(() => {
    if (!(swapSuccess || isConfirmed)) {
      animationRanRef.current = false;
      return;
    }
    if (animationRanRef.current) return;
    animationRanRef.current = true;

    // cUSDT→cETH: divide by rate; cETH→cUSDT: multiply by rate
    const amtIn = parseFloat(amountInRef.current);
    const target = isAToBRef.current ? amtIn / RATERef.current : amtIn * RATERef.current;
    const steps = 60;
    let i = 0;
    const iv = setInterval(() => {
      i++;
      const eased = 1 - Math.pow(1 - i / steps, 3);
      setAmountOut((target * eased).toFixed(4));
      if (i >= steps) {
        clearInterval(iv);
        setAmountOut(target.toFixed(4));
        // txHash is mirrored into toastTxHashRef by a dedicated effect.
        setToastVisible(true);
        setTimeout(() => setToastVisible(false), 5000);
        // Hide revealed balances immediately after a successful swap so next reveal shows updated ciphertext handles.
        setRevealing({});
        setRevealed({});
        setPendingReveal(null);
        setDisplayBals({ 1: "▓▓▓▓▓▓▓▓", 2: "▓▓▓▓▓▓▓▓" });
        poolRefetch();
        window.dispatchEvent(
          new CustomEvent("cipherdex:swap-confirmed", {
            detail: { txHash: txHash ?? null },
          }),
        );
        setTimeout(() => poolInitRefetch(), 2000);
        if (typeof window !== "undefined") {
          const prev = parseInt(localStorage.getItem("cipherdex_fhe_proofs") ?? "0", 10);
          localStorage.setItem("cipherdex_fhe_proofs", String(prev + 2));
        }
        setTimeout(() => resetSwap(), 300);
        setAmountIn("");
        setAmountOut(null);
        // Delay refetch so RPC has time to propagate new encrypted handles
        setTimeout(() => {
          refetchRef.current().then(() => {
            runningReveal.current = {};
            setRevealing({});
            setRevealed({});
            setPendingReveal(null);
            setDisplayBals({ 1: "▓▓▓▓▓▓▓▓", 2: "▓▓▓▓▓▓▓▓" });
          });
        }, 3000);
      }
    }, 16);
    return () => clearInterval(iv);
  }, [swapSuccess, isConfirmed, resetSwap, poolRefetch, poolInitRefetch, txHash]);

  // Use live pool snapshots; fall back to a static reference rate when pool isn't initialized
  const RATE = rateUSDTperETH ?? 2341.5;
  RATERef.current = RATE;
  const amountInValue = parseFloat(amountIn);
  const isValidAmount = Number.isFinite(amountInValue) && amountInValue > 0;
  const FEE = 0.997; // 0.3% pool fee
  const estimatedOut = isValidAmount
    ? isAToB
      ? ((amountInValue / RATE) * FEE).toFixed(4)
      : (amountInValue * RATE * FEE).toFixed(4)
    : null;
  const slippageValue = parseFloat(slippage);
  const minReceived =
    estimatedOut && !Number.isNaN(slippageValue)
      ? Math.max(0, parseFloat(estimatedOut) * (1 - slippageValue / 100)).toFixed(4)
      : null;
  // Always show rate as "1 cETH ≈ X cUSDT" regardless of direction
  const exchangeRateLabel = `1 cETH ≈ ${RATE.toLocaleString(undefined, { maximumFractionDigits: 2 })} cUSDT`;
  const payToken = isAToB ? { name: "cUSDT", icon: <CUSDTIcon /> } : { name: "cETH", icon: <CETHIcon /> };
  const receiveToken = isAToB ? { name: "cETH", icon: <CETHIcon /> } : { name: "cUSDT", icon: <CUSDTIcon /> };
  const payTokenIndex = isAToB ? 1 : 2;
  const inputDecimals = isAToB ? 6 : 9;  // cUSDT=6 decimals, cETH=9 decimals
  const outputDecimals = isAToB ? 9 : 6;
  const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const heatmap = useMemo(() => {
    const maxCount = Math.max(...heatmapCounts, 1);
    return heatmapCounts.map((count: number) => ({
      // Color alpha: any active day gets a floor of 0.25 so it's always visible,
      // then scales to 1.0 at the max. 0 stays dark.
      intensity: count > 0 ? 0.25 + (count / maxCount) * 0.75 : 0,
      // Height: purely proportional to raw count so bars stay visually honest.
      heightPct: count > 0 ? Math.max((count / maxCount) * 100, 15) : 5,
    }));
  }, [heatmapCounts]);

  // --- Mobile detection ---
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isMobile) {
      setFheUnsupportedReason(null);
      return;
    }
    if (typeof (window as any).SharedArrayBuffer === "undefined") {
      setFheUnsupportedReason("Mobile browser does not expose SharedArrayBuffer for FHE.");
      return;
    }
    if (!window.crossOriginIsolated) {
      setFheUnsupportedReason("Mobile browser session is not cross-origin isolated for FHE.");
      return;
    }
    setFheUnsupportedReason(null);
  }, [isMobile]);

  // --- Hide balances immediately on wallet disconnect ---
  useEffect(() => {
    if (!isConnected) {
      setRevealed({});
      setRevealing({});
      setDisplayBals({ 1: "▓▓▓▓▓▓▓▓", 2: "▓▓▓▓▓▓▓▓" });
      setPendingReveal(null);
      setDecryptRequest(null);
    }
  }, [isConnected]);

  // --- Balance reveal ---
  async function revealBalance(n: number) {
    if (!isConnected || !address) return;
    if (revealing[n] || runningReveal.current[n]) return;
    setDecryptUiError(null);
    if (revealed[n]) {
      setRevealed(prev => ({ ...prev, [n]: false }));
      setDisplayBals(prev => ({ ...prev, [n]: "▓▓▓▓▓▓▓▓" }));
      return;
    }

    if (fhevmStatus !== "ready" || !canDecrypt) {
      setDecryptUiError("FHE wallet session not ready yet. Reconnect wallet and try reveal again.");
      return;
    }

    await refetch();
    setRevealing(prev => ({ ...prev, [n]: true }));
    setDisplayBals(prev => ({ ...prev, [n]: "▓▓▓▓▓▓▓▓" }));
    setDecryptRequest(n);

    try {
      const timeoutMs = 20000;
      await Promise.race([
        decrypt(),
        new Promise((_, reject) => {
          window.setTimeout(() => reject(new Error("Decrypt request timed out on mobile wallet")), timeoutMs);
        }),
      ]);
    } catch (err) {
      console.error("Balance reveal failed", err);
      setDecryptUiError("Decrypt confirmation did not complete. Please retry in wallet browser.");
      setDecryptRequest(null);
      setRevealing(prev => ({ ...prev, [n]: false }));
    }
  }

  // --- Swap ---
  async function doSwap() {
    setIsSubmitting(true);
    try {
      if (fheUnsupportedReason) {
        setIsSubmitting(false);
        return;
      }
      // Immediately hide displayed balances when a swap attempt starts.
      setRevealing({});
      setRevealed({});
      setPendingReveal(null);
      setDisplayBals({ 1: "▓▓▓▓▓▓▓▓", 2: "▓▓▓▓▓▓▓▓" });
    if (isRealSwapping || !canSwap || !isConnected) { setIsSubmitting(false); return; }
    const amountValue = parseFloat(amountIn);
    if (!Number.isFinite(amountValue) || amountValue <= 0) { setIsSubmitting(false); return; }
      resetSwap();
      setAmountOut(null);
      const amountInBig = BigInt(Math.floor(amountValue * 10 ** inputDecimals));
      const minOut = minReceived ? BigInt(Math.floor(parseFloat(minReceived) * 10 ** outputDecimals)) : BigInt(0);
      await swap(amountInBig, minOut, isAToB);
    } finally {
      setIsSubmitting(false);
    }
    // amountOut count-up is driven by the swapSuccess effect above
  }

  const slideInStyle = `
  @keyframes slideIn {
    from { transform: translateX(-100%); }
    to { transform: translateX(0); }
  }
  @keyframes stepPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(255,210,8,0.5); }
    50% { box-shadow: 0 0 0 5px rgba(255,210,8,0); }
  }
  @keyframes stepComplete {
    0% { transform: scale(0.7); opacity: 0; }
    60% { transform: scale(1.15); }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes fadeSlideIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes countUp {
    from { opacity: 0.4; }
    to { opacity: 1; }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

  const card: React.CSSProperties = {
    background: "rgba(23,23,20,0.5)",
    border: "1px solid rgba(255,255,245,0.06)",
    borderRadius: "14px",
    padding: "15px",
    position: "relative",
    overflow: "hidden",
    backdropFilter: "blur(14px)",
  };
  const cardShine: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: "15%",
    right: "15%",
    height: "1px",
    background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.09),transparent)",
  };

  const navItems = [
    { name: "Dashboard", icon: <DashIcon /> },
    { name: "Swap", icon: <SwapIcon /> },
    { name: "Transactions", icon: <TxIcon /> },
    { name: "Liquidity Pools", icon: <PoolIcon /> },
    { name: "Performance", icon: <PerfIcon /> },
  ];
  const accountItems = [
    { name: "Portfolio", icon: <PortIcon /> },
    { name: "Audit View", icon: <AuditIcon /> },
  ];

  const SidebarContent = () => (
    <>
      <div
        style={{
          padding: "20px 18px",
          borderBottom: "1px solid rgba(255,255,245,0.05)",
          display: "flex",
          alignItems: "center",
          gap: "11px",
        }}
      >
        <svg width="34" height="34" viewBox="0 0 34 34">
          <rect width="34" height="34" rx="9" fill="#FFD208" />
          <path d="M17 5L28 11V23C28 28.5 17 32 17 32C17 32 6 28.5 6 23V11Z" fill="#000" />
          <path
            d="M11 17h12M19 13l4 4-4 4"
            fill="none"
            stroke="#FFD208"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M23 17H11M15 21l-4-4 4-4"
            fill="none"
            stroke="#FFD208"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span style={{ fontSize: "16px", fontWeight: 900, letterSpacing: "-0.03em" }}>
          Cipher<span style={{ color: "#FFD208" }}>DEX</span>
        </span>
        {isMobile && (
          <button
            onClick={() => setShowSidebar(false)}
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "none",
              color: "#6b6860",
              fontSize: "20px",
              cursor: "pointer",
              padding: "0 4px",
            }}
          >
            ×
          </button>
        )}
      </div>
      <nav
        style={{
          padding: "14px 10px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "1px",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            fontSize: "10px",
            fontWeight: 700,
            color: "#3a3832",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            padding: "12px 10px 5px",
            fontFamily: "monospace",
          }}
        >
          Trading
        </div>
        {navItems.map(item => (
          <div
            key={item.name}
            onClick={() => {
              setActiveNav(item.name);
              if (isMobile) setShowSidebar(false);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "9px 11px",
              borderRadius: "9px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
              color: activeNav === item.name ? "#f0ede6" : "#6b6860",
              background: activeNav === item.name ? "#1e1e1a" : "transparent",
              position: "relative",
              transition: "all 0.15s",
            }}
          >
            {activeNav === item.name && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: "20%",
                  bottom: "20%",
                  width: "3px",
                  background: "#FFD208",
                  borderRadius: "0 2px 2px 0",
                }}
              />
            )}
            <span style={{ opacity: activeNav === item.name ? 1 : 0.5 }}>{item.icon}</span>
            {item.name}
            {activeNav === item.name && (
              <span
                style={{
                  marginLeft: "auto",
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "#FFD208",
                  boxShadow: "0 0 8px #FFD208",
                  display: "inline-block",
                }}
              />
            )}
          </div>
        ))}
        <div
          style={{
            fontSize: "10px",
            fontWeight: 700,
            color: "#3a3832",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            padding: "12px 10px 5px",
            fontFamily: "monospace",
          }}
        >
          Account
        </div>
        {accountItems.map(item => (
          <div
            key={item.name}
            onClick={() => {
              setActiveNav(item.name);
              if (isMobile) setShowSidebar(false);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "9px 11px",
              borderRadius: "9px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
              color: activeNav === item.name ? "#f0ede6" : "#6b6860",
              background: activeNav === item.name ? "#1e1e1a" : "transparent",
              position: "relative",
              transition: "all 0.15s",
            }}
          >
            {activeNav === item.name && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: "20%",
                  bottom: "20%",
                  width: "3px",
                  background: "#FFD208",
                  borderRadius: "0 2px 2px 0",
                }}
              />
            )}
            <span style={{ opacity: activeNav === item.name ? 1 : 0.5 }}>{item.icon}</span>
            {item.name}
            {activeNav === item.name && (
              <span
                style={{
                  marginLeft: "auto",
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "#FFD208",
                  boxShadow: "0 0 8px #FFD208",
                  display: "inline-block",
                }}
              />
            )}
          </div>
        ))}
        <div
          style={{
            fontSize: "10px",
            fontWeight: 700,
            color: "#3a3832",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            padding: "12px 10px 5px",
            fontFamily: "monospace",
          }}
        >
          Other
        </div>
        <div
          onClick={() => setActiveNav("Settings")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "9px 11px",
            borderRadius: "9px",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: 500,
            color: activeNav === "Settings" ? "#f0ede6" : "#6b6860",
            background: activeNav === "Settings" ? "#1e1e1a" : "transparent",
            position: "relative",
          }}
        >
          {activeNav === "Settings" && (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: "20%",
                bottom: "20%",
                width: "3px",
                background: "#FFD208",
                borderRadius: "0 2px 2px 0",
              }}
            />
          )}
          <span style={{ opacity: activeNav === "Settings" ? 1 : 0.5 }}>
            <SettingsIcon />
          </span>
          Settings
          {activeNav === "Settings" && (
            <span
              style={{
                marginLeft: "auto",
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "#FFD208",
                boxShadow: "0 0 8px #FFD208",
                display: "inline-block",
              }}
            />
          )}
        </div>
      </nav>
      <div style={{ padding: "14px", borderTop: "1px solid rgba(255,255,245,0.05)" }}>
        <div
          style={{
            background: "linear-gradient(135deg,rgba(255,210,8,0.09),rgba(255,210,8,0.02))",
            border: "1px solid rgba(255,210,8,0.22)",
            borderRadius: "12px",
            padding: "14px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "38px",
              height: "38px",
              background: "rgba(255,210,8,0.07)",
              border: "1px solid rgba(255,210,8,0.22)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 9px",
            }}
          >
            <FaucetIcon />
          </div>
          <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "3px" }}>Get Test Tokens</div>
          <div style={{ fontSize: "11px", color: "#6b6860", marginBottom: "10px", lineHeight: 1.5 }}>
            Claim free cUSDT and cETH on Sepolia
          </div>
          <button
            onClick={claim}
            disabled={!canClaim}
            style={{
              width: "100%",
              background: canClaim ? "#FFD208" : "rgba(255,210,8,0.3)",
              color: "#000",
              border: "none",
              borderRadius: "8px",
              padding: "8px",
              fontSize: "12px",
              fontWeight: 800,
              cursor: canClaim ? "pointer" : "not-allowed",
              transition: "all 0.2s",
            }}
          >
            {isClaiming ? "Claiming..." : cooldownRemaining > 0 ? `Wait ${cooldownFormatted}` : "Claim from Faucet"}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#0a0a08",
        color: "#f0ede6",
        fontFamily: "'Cabinet Grotesk',sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{slideInStyle}</style>
      {/* BG orbs */}
      <div
        style={{
          position: "fixed",
          width: "500px",
          height: "500px",
          borderRadius: "50%",
          filter: "blur(100px)",
          background: "rgba(255,210,8,0.03)",
          top: "-150px",
          right: "-150px",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: "fixed",
          width: "350px",
          height: "350px",
          borderRadius: "50%",
          filter: "blur(100px)",
          background: "rgba(96,165,250,0.02)",
          bottom: "50px",
          left: "-80px",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* SIDEBAR - desktop */}
      {!isMobile && (
        <aside
          style={{
            width: "230px",
            flexShrink: 0,
            background: "#111110",
            borderRight: "1px solid rgba(255,255,245,0.05)",
            display: "flex",
            flexDirection: "column",
            position: "fixed",
            top: 0,
            left: 0,
            height: "100vh",
            zIndex: 10,
            overflowY: "auto",
          }}
        >
          <SidebarContent />
        </aside>
      )}

      {/* SIDEBAR - mobile overlay */}
      {isMobile && showSidebar && (
        <>
          <div
            onClick={() => setShowSidebar(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              zIndex: 190,
              backdropFilter: "blur(4px)",
            }}
          />
          <aside
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              bottom: 0,
              width: "280px",
              background: "#111110",
              borderRight: "1px solid rgba(255,255,245,0.05)",
              display: "flex",
              flexDirection: "column",
              zIndex: 200,
              overflowY: "auto",
              transform: "translateX(0)",
              animation: "slideIn 0.25s ease-out",
            }}
          >
            <SidebarContent />
          </aside>
        </>
      )}

      {/* MAIN */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
          position: "relative",
          zIndex: 1,
          minWidth: 0,
          marginLeft: isMobile ? "0" : "230px",
        }}
      >
        {/* Topbar */}
        <header
          style={{
            height: "56px",
            borderBottom: "1px solid rgba(255,255,245,0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            background: "rgba(10,10,8,0.96)",
            backdropFilter: "blur(20px)",
            position: "sticky",
            top: 0,
            zIndex: 100,
            gap: "8px",
          }}
        >
          {isMobile ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                <button
                  onClick={() => setShowSidebar(true)}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: "4px",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#f0ede6" strokeWidth="1.5">
                    <line x1="2" y1="5" x2="18" y2="5" />
                    <line x1="2" y1="10" x2="18" y2="10" />
                    <line x1="2" y1="15" x2="18" y2="15" />
                  </svg>
                </button>
                <span style={{ fontSize: "15px", fontWeight: 900, letterSpacing: "-0.03em" }}>
                  Cipher<span style={{ color: "#FFD208" }}>DEX</span>
                </span>
              </div>
              <RainbowKitCustomConnectButton />
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "13px", color: "#6b6860" }}>
                <HomeIcon />
                <span style={{ color: "#3a3832" }}>›</span>
                <span>Dashboard</span>
                <span style={{ color: "#3a3832" }}>›</span>
                <span style={{ color: "#f0ede6", fontWeight: 600 }}>Swap</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ fontSize: "12px", color: "#6b6860" }}>
                  Status: <strong style={{ color: "#FFD208" }}>Active</strong> · System operating normally
                </div>
                <RainbowKitCustomConnectButton />
              </div>
            </>
          )}
        </header>

        <main style={{ padding: isMobile ? "14px 14px 80px" : "24px", flex: 1 }}>
          {/* Routed sub-pages */}
          {activeNav === "Transactions" && <TransactionsPage address={address} isMobile={isMobile} />}
          {activeNav === "Liquidity Pools" && (
            <LiquidityPoolsPage
              fhevmInstance={fhevmInstance}
              isMobile={isMobile}
              onSuccess={() => {
                setRevealed({});
                setRevealing({});
                runningReveal.current = {};
                setPendingReveal(null);
                setDisplayBals({ 1: "▓▓▓▓▓▓▓▓", 2: "▓▓▓▓▓▓▓▓" });
                setTimeout(() => refetch(), 3000);
              }}
            />
          )}
          {activeNav === "Portfolio" && (
            <PortfolioPage address={address} chainId={chainId} fhevmInstance={fhevmInstance} isMobile={isMobile} />
          )}
          {activeNav === "Performance" && <PerformancePage isMobile={isMobile} />}
          {activeNav === "Audit View" && <AuditViewPage address={address} isMobile={isMobile} />}
          {activeNav === "Settings" && <SettingsPage isMobile={isMobile} />}

          {/* ── DASHBOARD ─────────────────────────────── */}
          {activeNav === "Dashboard" && (
            <>
              <div style={{ marginBottom: "22px" }}>
                <h1 style={{ fontSize: isMobile ? "22px" : "26px", fontWeight: 900, letterSpacing: "-0.04em" }}>
                  Cipher<span style={{ color: "#FFD208" }}>DEX</span> Overview
                </h1>
                <p style={{ fontSize: "13px", color: "#6b6860", marginTop: "3px" }}>
                  Live pool analytics and your encrypted portfolio
                </p>
              </div>

              {/* Pool not live notice — disappears once deployer runs initializePool.ts */}
              {poolInitialized === false && (
                <div
                  style={{
                    background: "rgba(255,255,245,0.03)",
                    border: "1px solid rgba(255,255,245,0.08)",
                    borderRadius: "12px",
                    padding: "14px 18px",
                    marginBottom: "18px",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="#6b6860"
                    strokeWidth="1.5"
                    style={{ flexShrink: 0 }}
                  >
                    <circle cx="8" cy="8" r="7" />
                    <path d="M8 5v3.5M8 11v.5" />
                  </svg>
                  <div style={{ fontSize: "13px", color: "#6b6860" }}>
                    Pool not yet live - initial liquidity is being seeded. Check back shortly.
                  </div>
                </div>
              )}

              {/* Stats: 4 cards */}
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
                  {
                    label: "Active Traders",
                    value: activeTraders.toString(),
                    sub: "Unique wallets",
                  },
                  {
                    label: "Reserve cUSDT",
                    value: snapshotA
                      ? (Number(snapshotA) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 })
                      : "▓▓▓▓",
                    sub: "Snapshot",
                    enc: !snapshotA,
                  },
                  {
                    label: "Reserve cETH",
                    value: snapshotB
                      ? (Number(snapshotB) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 4 })
                      : "▓▓▓▓",
                    sub: "Snapshot",
                    enc: !snapshotB,
                  },
                ].map((s: any) => (
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
                    <div
                      style={{
                        fontSize: "20px",
                        fontWeight: 700,
                        fontFamily: "monospace",
                        color: s.enc ? "rgba(240,237,230,0.22)" : "#f0ede6",
                        letterSpacing: s.enc ? "2px" : undefined,
                      }}
                    >
                      {s.value}
                    </div>
                    <div style={{ fontSize: "10px", color: "#3a3832", marginTop: "4px" }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* 2-column: balances + recent trades */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                  gap: "18px",
                  marginBottom: "18px",
                }}
              >
                {/* Balances card */}
                <div style={card}>
                  <div style={cardShine} />
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
                    Your Balances
                  </div>
                  {(
                    [
                      { n: 1, label: "cUSDT", accent: true },
                      { n: 2, label: "cETH", accent: false },
                    ] as const
                  ).map(({ n, label, accent }) => (
                    <div
                      key={n}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "12px 0",
                        borderBottom: n === 1 ? "1px solid rgba(255,255,245,0.05)" : "none",
                      }}
                    >
                      <span style={{ fontSize: "13px", color: "#6b6860" }}>{label}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          style={{
                            fontSize: "15px",
                            fontWeight: 700,
                            fontFamily: "monospace",
                            color: accent ? "#FFD208" : "#f0ede6",
                          }}
                        >
                          {displayBals[n]}
                        </span>
                        <button
                          onClick={() => revealBalance(n)}
                          style={{
                            background: "transparent",
                            border: "1px solid rgba(255,255,245,0.08)",
                            borderRadius: "6px",
                            padding: "3px 8px",
                            fontSize: "10px",
                            color: "#6b6860",
                            cursor: "pointer",
                            fontFamily: "'Cabinet Grotesk',sans-serif",
                          }}
                        >
                          {revealed[n] ? "Hide" : revealing[n] ? "…" : "Reveal"}
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => setActiveNav("Swap")}
                    style={{
                      width: "100%",
                      background: "#FFD208",
                      border: "none",
                      borderRadius: "10px",
                      padding: "10px",
                      fontSize: "13px",
                      fontWeight: 800,
                      color: "#000",
                      cursor: "pointer",
                      fontFamily: "'Cabinet Grotesk',sans-serif",
                      marginTop: "16px",
                    }}
                  >
                    Swap Now →
                  </button>
                </div>

                {/* Recent trades (real on-chain data) */}
                <div style={card}>
                  <div style={cardShine} />
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "12px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#3a3832",
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        fontFamily: "monospace",
                      }}
                    >
                      Recent Trades
                    </div>
                    <span style={{ fontSize: "10px", color: "#3a3832" }}>Amounts encrypted</span>
                  </div>
                  {statsLoading && recentTrades.length === 0 && (
                    <div style={{ fontSize: "12px", color: "#3a3832", fontFamily: "monospace" }}>Loading…</div>
                  )}
                  {!statsLoading && recentTrades.length === 0 && (
                    <div style={{ fontSize: "12px", color: "#3a3832", fontFamily: "monospace" }}>No trades yet</div>
                  )}
                  {recentTrades.map((trade, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "8px 9px",
                        background: "rgba(0,0,0,0.14)",
                        borderRadius: "8px",
                        marginBottom: i < recentTrades.length - 1 ? "5px" : "0",
                      }}
                    >
                      <div
                        style={{
                          width: "26px",
                          height: "26px",
                          background: "rgba(255,255,245,0.04)",
                          borderRadius: "7px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <ArrowRightIcon />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: "10px",
                            fontFamily: "monospace",
                            color: "#3a3832",
                            wordBreak: "break-word",
                          }}
                        >
                          {trade}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          fontFamily: "monospace",
                          color: "rgba(240,237,230,0.18)",
                          letterSpacing: "2px",
                          flexShrink: 0,
                        }}
                      >
                        ░░░░
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => setActiveNav("Transactions")}
                    style={{
                      width: "100%",
                      background: "transparent",
                      border: "1px solid rgba(255,255,245,0.08)",
                      borderRadius: "10px",
                      padding: "9px",
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#6b6860",
                      cursor: "pointer",
                      fontFamily: "'Cabinet Grotesk',sans-serif",
                      marginTop: "12px",
                    }}
                  >
                    View All Transactions →
                  </button>
                </div>
              </div>

              {/* 28-day heatmap */}
              <div style={card}>
                <div style={cardShine} />
                <div
                  style={{
                    fontSize: "11px",
                    color: "#3a3832",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    fontFamily: "monospace",
                    marginBottom: "10px",
                  }}
                >
                  28-Day Trade Activity
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(28,1fr)",
                    gap: "3px",
                    alignItems: "flex-end",
                    height: "40px",
                  }}
                >
                  {heatmap.map(({ intensity, heightPct }, idx) => (
                    <div
                      key={idx}
                      title={`${heatmapCounts[idx]} trade${heatmapCounts[idx] !== 1 ? "s" : ""}`}
                      style={{
                        height: `${heightPct}%`,
                        background: intensity > 0 ? `rgba(255,210,8,${intensity})` : "rgba(255,210,8,0.05)",
                        borderRadius: "2px 2px 0 0",
                        minHeight: "2px",
                      }}
                    />
                  ))}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: "8px",
                    fontSize: "9px",
                    color: "#3a3832",
                    fontFamily: "monospace",
                  }}
                >
                  <span>28 days ago</span>
                  <span>
                    Today · {totalTrades} swaps {statsRefreshing ? "· refreshing…" : ""}
                  </span>
                </div>
              </div>
            </>
          )}

          {/* ── SWAP ──────────────────────────────────── */}
          {activeNav === "Swap" && (
            <>
              {/* Pool not live notice */}
              {poolInitialized === false && (
                <div
                  style={{
                    background: "rgba(255,255,245,0.03)",
                    border: "1px solid rgba(255,255,245,0.08)",
                    borderRadius: "12px",
                    padding: "14px 16px",
                    marginBottom: "18px",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="#6b6860"
                    strokeWidth="1.5"
                    style={{ flexShrink: 0 }}
                  >
                    <circle cx="8" cy="8" r="7" />
                    <path d="M8 5v3.5M8 11v.5" />
                  </svg>
                  <div style={{ fontSize: "13px", color: "#6b6860" }}>
                    Pool not yet live - swapping will be available once initial liquidity is seeded.
                  </div>
                </div>
              )}
              {/* Page header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  marginBottom: "22px",
                  flexWrap: "wrap",
                  gap: "10px",
                }}
              >
                <div>
                  <h1 style={{ fontSize: isMobile ? "22px" : "26px", fontWeight: 900, letterSpacing: "-0.04em" }}>
                    Private <span style={{ color: "#FFD208" }}>Swap</span>
                  </h1>
                  <p style={{ fontSize: "13px", color: "#6b6860", marginTop: "3px" }}>
                    Encrypted orders - zero front-running, zero MEV loss
                  </p>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "7px",
                    background: "rgba(255,210,8,0.07)",
                    border: "1px solid rgba(255,210,8,0.22)",
                    borderRadius: "20px",
                    padding: "7px 14px",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#FFD208",
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "#FFD208",
                      boxShadow: "0 0 8px #FFD208",
                      display: "inline-block",
                    }}
                  />
                  MEV Protection Active
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "10px", marginBottom: "20px" }}>
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
                    Total Volume
                  </div>
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: 700,
                      fontFamily: "monospace",
                      color: "rgba(240,237,230,0.22)",
                      letterSpacing: "2px",
                    }}
                  >
                    ▓▓▓▓▓▓▓▓
                  </div>
                  <div style={{ fontSize: "10px", color: "#3a3832", marginTop: "4px" }}>Encrypted on-chain</div>
                </div>
                {[
                  { label: "Your cUSDT", value: cUSDTBalance ?? "—", sub: "Decrypted balance", acc: true },
                  { label: "Your cETH", value: cETHBalance ?? "—", sub: "Decrypted balance" },
                  {
                    label: "Active Traders",
                    value: activeTraders.toString(),
                    sub: "On Sepolia",
                  },
                ].map((s, i) => (
                  <div
                    key={i}
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
                    <div
                      style={{
                        fontSize: "20px",
                        fontWeight: 700,
                        fontFamily: "monospace",
                        letterSpacing: "-0.02em",
                        color: s.acc ? "#FFD208" : "#f0ede6",
                      }}
                    >
                      {s.value}
                    </div>
                    <div style={{ fontSize: "10px", color: s.acc ? "#FFD208" : "#3a3832", marginTop: "4px" }}>
                      {s.sub}
                    </div>
                  </div>
                ))}
              </div>

              {/* Main grid */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 320px", gap: "18px" }}>
                {/* Swap card */}
                <div
                  style={{
                    position: "relative",
                    borderRadius: "18px",
                    padding: "22px",
                    background: "rgba(23,23,20,0.65)",
                    backdropFilter: "blur(30px)",
                    border: "1px solid rgba(255,255,245,0.07)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      height: "1px",
                      background:
                        "linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.18) 25%,rgba(255,210,8,0.3) 50%,rgba(255,255,255,0.08) 75%,transparent 100%)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      bottom: 0,
                      width: "1px",
                      background:
                        "linear-gradient(180deg,rgba(255,255,255,0.15) 0%,rgba(255,255,255,0.03) 50%,transparent 100%)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: "-50px",
                      right: "-50px",
                      width: "180px",
                      height: "180px",
                      background: "radial-gradient(circle,rgba(255,210,8,0.06) 0%,transparent 70%)",
                      pointerEvents: "none",
                    }}
                  />

                  <div
                    style={{
                      display: "flex",
                      alignItems: isMobile ? "flex-start" : "center",
                      justifyContent: "space-between",
                      marginBottom: "18px",
                      flexDirection: isMobile ? "column" : "row",
                      gap: isMobile ? "10px" : "0",
                    }}
                  >
                    <h3 style={{ fontSize: "14px", fontWeight: 800 }}>Swap Tokens Privately</h3>
                  </div>

                  {/* You Pay */}
                  <div
                    style={{
                      background: "rgba(0,0,0,0.28)",
                      border: "1px solid rgba(255,255,245,0.06)",
                      borderRadius: "12px",
                      padding: "14px",
                      marginBottom: "7px",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: "25%",
                        right: "25%",
                        height: "1px",
                        background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.07),transparent)",
                      }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                      <span
                        style={{
                          fontSize: "9px",
                          fontWeight: 700,
                          color: "#3a3832",
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          fontFamily: "monospace",
                        }}
                      >
                        You Pay
                      </span>
                      <span style={{ fontSize: "10px", color: "#3a3832" }}>
                        Bal:{" "}
                        <span
                          style={{
                            color: revealed[payTokenIndex] ? "#FFD208" : "#3a3832",
                            cursor: "pointer",
                            fontWeight: 700,
                            fontFamily: "monospace",
                          }}
                          onClick={() => revealBalance(payTokenIndex)}
                        >
                          {revealed[payTokenIndex]
                            ? payTokenIndex === 1
                              ? (cUSDTBalance ?? "▓▓▓▓")
                              : (cETHBalance ?? "▓▓▓▓")
                            : "▓▓▓▓"}
                        </span>{" "}
                        {payToken.name}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                      <input
                        type="number"
                        value={amountIn}
                        onChange={e => setAmountIn(e.target.value)}
                        style={
                          {
                            background: "transparent",
                            border: "none",
                            outline: "none",
                            fontSize: isMobile ? "22px" : "28px",
                            fontWeight: 700,
                            fontFamily: "monospace",
                            color: "#f0ede6",
                            width: "100%",
                            minWidth: 0,
                            letterSpacing: "-0.02em",
                            WebkitAppearance: "none",
                            MozAppearance: "textfield",
                          } as React.CSSProperties
                        }
                      />
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          background: "rgba(255,255,245,0.05)",
                          border: "1px solid rgba(255,255,245,0.08)",
                          borderRadius: "10px",
                          padding: "8px 10px",
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >
                        {payToken.icon}
                        <span style={{ fontSize: "12px", fontWeight: 800 }}>{payToken.name}</span>
                      </div>
                    </div>
                  </div>

                  {/* Swap arrow */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                      margin: "3px 0",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        height: "1px",
                        background: "rgba(255,255,245,0.04)",
                      }}
                    />
                    <button
                      onClick={() => {
                        setIsAToB(prev => {
                          const next = !prev;
                          setAmountIn(prevAmount => {
                            const current = parseFloat(prevAmount);
                            if (!Number.isFinite(current) || current <= 0) return prevAmount;
                            return prev ? (current / RATE).toFixed(6) : (current * RATE).toFixed(6);
                          });
                          return next;
                        });
                      }}
                      style={{
                        width: "32px",
                        height: "32px",
                        background: "rgba(255,255,245,0.05)",
                        border: "1px solid rgba(255,255,245,0.08)",
                        borderRadius: "9px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        zIndex: 1,
                      }}
                    >
                      <ArrowUpDownIcon />
                    </button>
                  </div>

                  {/* You Receive */}
                  <div
                    style={{
                      background: "rgba(0,0,0,0.28)",
                      border: `1px solid ${amountOut !== null || estimatedOut !== null ? "rgba(255,210,8,0.18)" : "rgba(255,255,245,0.06)"}`,
                      borderRadius: "12px",
                      padding: "14px",
                      position: "relative",
                      overflow: "hidden",
                      transition: "border-color 0.4s",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: "25%",
                        right: "25%",
                        height: "1px",
                        background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.07),transparent)",
                      }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                      <span
                        style={{
                          fontSize: "9px",
                          fontWeight: 700,
                          color: "#3a3832",
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          fontFamily: "monospace",
                        }}
                      >
                        You Receive
                      </span>
                      <span style={{ fontSize: "10px", color: "#3a3832" }}>Encrypted on-chain</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                      <div
                        style={{
                          fontSize: isMobile ? "22px" : "26px",
                          fontFamily: "monospace",
                          fontWeight: 700,
                          minHeight: "36px",
                          color:
                            amountOut !== null
                              ? "#FFD208"
                              : estimatedOut !== null
                                ? "#f0ede6"
                                : "rgba(240,237,230,0.22)",
                          letterSpacing: amountOut !== null ? "-0.02em" : estimatedOut !== null ? "-0.01em" : "2px",
                          minWidth: 0,
                          overflow: "hidden",
                          textShadow: amountOut !== null ? "0 0 20px rgba(255,210,8,0.35)" : "none",
                          transition: "color 0.3s, text-shadow 0.3s",
                          animation: amountOut !== null && swapSuccess ? "countUp 0.15s ease" : "none",
                        }}
                      >
                        {isRealSwapping ? (
                          <span style={{ fontSize: "13px", color: "#3a3832", letterSpacing: "0.05em" }}>
                            Computing…
                          </span>
                        ) : amountOut !== null ? (
                          amountOut
                        ) : (
                          (estimatedOut ?? "▓▓▓▓▓▓▓▓")
                        )}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          background: "rgba(255,255,245,0.05)",
                          border: "1px solid rgba(255,255,245,0.08)",
                          borderRadius: "10px",
                          padding: "8px 10px",
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >
                        {receiveToken.icon}
                        <span style={{ fontSize: "12px", fontWeight: 800 }}>{receiveToken.name}</span>
                      </div>
                    </div>
                  </div>

                  {/* Enc notice */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "9px",
                      background: "rgba(255,210,8,0.07)",
                      border: "1px solid rgba(255,210,8,0.22)",
                      borderRadius: "10px",
                      padding: "9px 12px",
                      margin: "12px 0",
                    }}
                  >
                    <LockIcon />
                    <p style={{ fontSize: "11px", color: "#FFD208", fontWeight: 600, lineHeight: 1.4 }}>
                      Amount encrypts with FHE before submission - front-running impossible
                    </p>
                  </div>

                  {/* Rate table */}
                  <div style={{ marginBottom: "14px" }}>
                    {[
                      { k: "Exchange Rate", v: exchangeRateLabel },
                      { k: "Estimated Output", v: estimatedOut ? `${estimatedOut} ${receiveToken.name}` : "—" },
                      { k: "Min. Received", v: minReceived ? `${minReceived} ${receiveToken.name}` : "—" },
                      { k: "Network Fee", v: "~$0.42" },
                      { k: "MEV Protection", v: "Active", ok: true },
                    ].map((r, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "6px 0",
                          borderBottom: i < 4 ? "1px solid rgba(255,255,245,0.04)" : "none",
                        }}
                      >
                        <span style={{ fontSize: "11px", color: "#3a3832" }}>{r.k}</span>
                        <span
                          style={{
                            fontSize: "11px",
                            fontFamily: "monospace",
                            color: r.ok ? "#FFD208" : "#6b6860",
                            letterSpacing: "0",
                            fontWeight: r.ok ? 700 : 400,
                          }}
                        >
                          {r.v}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Slippage */}
                  <div style={{ marginBottom: "14px" }}>
                    <button
                      onClick={() => setShowSlippage(!showSlippage)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "11px",
                        color: "#6b6860",
                        padding: "0",
                        fontFamily: "'Cabinet Grotesk',sans-serif",
                      }}
                    >
                      <SettingsIcon size={11} /> Slippage:{" "}
                      <span style={{ color: "#f0ede6", fontWeight: 700 }}>{slippage}%</span>
                      <span style={{ fontSize: "9px" }}>{showSlippage ? "▲" : "▼"}</span>
                    </button>
                    {showSlippage && (
                      <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
                        {["0.1", "0.5", "1.0"].map(s => (
                          <button
                            key={s}
                            onClick={() => setSlippage(s)}
                            style={{
                              padding: "5px 12px",
                              borderRadius: "7px",
                              fontSize: "11px",
                              fontWeight: 700,
                              cursor: "pointer",
                              border: "1px solid",
                              borderColor: slippage === s ? "#FFD208" : "rgba(255,255,245,0.08)",
                              background: slippage === s ? "rgba(255,210,8,0.1)" : "rgba(255,255,245,0.04)",
                              color: slippage === s ? "#FFD208" : "#6b6860",
                            }}
                          >
                            {s}%
                          </button>
                        ))}
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <input
                            type="number"
                            placeholder="Custom"
                            value={!["0.1", "0.5", "1.0"].includes(slippage) ? slippage : ""}
                            onChange={e => setSlippage(e.target.value)}
                            style={
                              {
                                width: "70px",
                                padding: "5px 8px",
                                borderRadius: "7px",
                                fontSize: "11px",
                                background: "rgba(255,255,245,0.04)",
                                border: "1px solid rgba(255,255,245,0.08)",
                                color: "#f0ede6",
                                outline: "none",
                                fontFamily: "monospace",
                                WebkitAppearance: "none",
                              } as React.CSSProperties
                            }
                          />
                          <span style={{ fontSize: "10px", color: "#6b6860" }}>%</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* FHE status indicator */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: "6px", minHeight: "16px" }}>
                    {fhevmStatus === "ready" && (
                      <div style={{ display: "flex", alignItems: "center", gap: "5px", animation: "fadeSlideIn 0.3s ease" }}>
                        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px rgba(74,222,128,0.6)" }} />
                        <span style={{ fontSize: "10px", color: "#4ade80", fontWeight: 600, fontFamily: "monospace", letterSpacing: "0.05em" }}>FHE Ready</span>
                      </div>
                    )}
                    {fhevmStatus === "loading" && isConnected && (
                      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                        <svg width="10" height="10" viewBox="0 0 10 10" style={{ animation: "spin 0.9s linear infinite", flexShrink: 0 }}>
                          <circle cx="5" cy="5" r="4" fill="none" stroke="#6b6860" strokeWidth="1.5" strokeDasharray="18" strokeDashoffset="6" strokeLinecap="round" />
                        </svg>
                        <span style={{ fontSize: "10px", color: "#6b6860", fontFamily: "monospace" }}>Initializing FHE…</span>
                      </div>
                    )}
                  </div>

                  {/* Swap button */}
                  <button
                    onClick={doSwap}
                    disabled={isSubmitting || !canSwap || isRealSwapping || !isValidAmount || !!fheUnsupportedReason}
                    style={{
                      width: "100%",
                      background:
                        isSubmitting || !canSwap || isRealSwapping || !isValidAmount || !!fheUnsupportedReason
                          ? "rgba(255,210,8,0.1)"
                          : "#FFD208",
                      color:
                        isSubmitting || !canSwap || isRealSwapping || !isValidAmount || !!fheUnsupportedReason
                          ? "#FFD208"
                          : "#000",
                      border:
                        isSubmitting || !canSwap || isRealSwapping || !isValidAmount || !!fheUnsupportedReason
                          ? "1px solid rgba(255,210,8,0.22)"
                          : "none",
                      borderRadius: "12px",
                      padding: "14px",
                      fontSize: "14px",
                      fontWeight: 900,
                      cursor:
                        isSubmitting || !canSwap || isRealSwapping || !isValidAmount || !!fheUnsupportedReason
                          ? "not-allowed"
                          : "pointer",
                      transition: "background 0.25s, color 0.25s",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                    }}
                  >
                    {(isSubmitting || isRealSwapping) && (
                      <svg width="16" height="16" viewBox="0 0 16 16" style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}>
                        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10" strokeLinecap="round" />
                      </svg>
                    )}
                    {isSubmitting || isRealSwapping
                      ? "Processing…"
                      : fheUnsupportedReason
                        ? "FHE Unsupported on Mobile"
                      : !isValidAmount
                        ? "Enter an amount"
                        : swapError
                          ? "Retry Swap"
                          : "Swap Privately"}
                  </button>

                  {/* FHE init error */}
                  {fhevmStatus === "error" && isConnected && (
                    <div
                      style={{
                        marginTop: "8px",
                        padding: "10px 12px",
                        background: "rgba(239,68,68,0.07)",
                        border: "1px solid rgba(239,68,68,0.18)",
                        borderRadius: "8px",
                        fontSize: "11px",
                        color: "#ef4444",
                        lineHeight: "1.6",
                        animation: "fadeSlideIn 0.2s ease",
                      }}
                    >
                      <span style={{ fontWeight: 700 }}>FHE initialization failed.</span> Possible causes: (1) the Zama
                      relayer at <span style={{ fontFamily: "monospace" }}>relayer.testnet.zama.org</span> is
                      temporarily unreachable — try clearing your browser DNS cache or switching networks; (2) multiple
                      wallet extensions installed in the same browser profile can conflict — use a dedicated profile
                      with one extension.
                      {fhevmError && (
                        <span style={{ display: "block", marginTop: "4px", color: "rgba(239,68,68,0.6)", fontFamily: "monospace", fontSize: "10px", wordBreak: "break-all" }}>
                          {fhevmError.message}
                        </span>
                      )}
                    </div>
                  )}
                  {decryptUiError && isConnected && (
                    <div
                      style={{
                        marginTop: "10px",
                        color: "rgba(239,68,68,0.8)",
                        fontFamily: "monospace",
                        fontSize: "10px",
                        lineHeight: 1.4,
                      }}
                    >
                      {decryptUiError}
                    </div>
                  )}
                  {fheUnsupportedReason && isConnected && (
                    <div
                      style={{
                        marginTop: "8px",
                        padding: "10px 12px",
                        background: "rgba(255,255,245,0.03)",
                        border: "1px solid rgba(255,255,245,0.08)",
                        borderRadius: "8px",
                        fontSize: "11px",
                        color: "#6b6860",
                        lineHeight: 1.5,
                      }}
                    >
                      {fheUnsupportedReason} Use desktop browser for FHE decrypt/swap.
                    </div>
                  )}

                  {/* Pre-connect / FHE setup notice — hidden once FHE is ready */}
                  {fhevmStatus !== "ready" && !isRealSwapping && !swapSuccess && (
                    <div
                      style={{
                        marginTop: "8px",
                        fontSize: "10px",
                        color: "#3a3832",
                        lineHeight: "1.5",
                        textAlign: "center",
                        letterSpacing: "0.01em",
                      }}
                    >
                      For FHE encryption to work, use a browser profile with one wallet extension installed.
                    </div>
                  )}

                  {/* Swap error */}
                  {swapError && !isRealSwapping && (
                    <div
                      style={{
                        marginTop: "8px",
                        padding: "9px 12px",
                        background: "rgba(239,68,68,0.08)",
                        border: "1px solid rgba(239,68,68,0.2)",
                        borderRadius: "8px",
                        fontSize: "11px",
                        color: "#ef4444",
                        animation: "fadeSlideIn 0.2s ease",
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                      }}
                    >
                      {swapError}
                    </div>
                  )}

                  {/* TX Steps — shown while swapping or just completed */}
                  {(isRealSwapping || (txHash && (isConfirmed || swapSuccess))) && (
                    <div
                      style={{
                        background: "rgba(0,0,0,0.22)",
                        border: "1px solid rgba(255,255,245,0.05)",
                        borderRadius: "12px",
                        padding: "16px",
                        marginTop: "12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                        animation: "fadeSlideIn 0.25s ease",
                      }}
                    >
                      {[
                        "Encrypting amount with FHE",
                        "Setting token operator on-chain",
                        "Broadcasting encrypted swap tx",
                        "Waiting for settlement confirmation",
                      ].map((label, i) => {
                        const stepNum = i + 1;
                        const isDone = realTxStep > stepNum;
                        const isActive = realTxStep === stepNum;
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <div
                              style={{
                                width: "24px",
                                height: "24px",
                                borderRadius: "50%",
                                flexShrink: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: isDone ? "#FFD208" : isActive ? "transparent" : "transparent",
                                border: isDone ? "none" : isActive ? "1.5px solid #FFD208" : "1.5px solid #2a2a24",
                                fontSize: "11px",
                                fontWeight: 800,
                                color: "#000",
                                transition: "background 0.1s, border-color 0.1s",
                                animation: isDone
                                  ? "stepComplete 0.2s ease"
                                  : isActive
                                    ? "stepPulse 1.4s ease-in-out infinite"
                                    : "none",
                              }}
                            >
                              {isDone ? (
                                "✓"
                              ) : isActive ? (
                                <div
                                  style={{
                                    width: "8px",
                                    height: "8px",
                                    borderRadius: "50%",
                                    background: "#FFD208",
                                    animation: "stepPulse 1s ease-in-out infinite",
                                  }}
                                />
                              ) : null}
                            </div>
                            <div style={{ flex: 1 }}>
                              <span
                                style={{
                                  fontSize: "11px",
                                  fontWeight: isActive ? 700 : 400,
                                  color: isDone ? "#4a4a40" : isActive ? "#f0ede6" : "#2a2a24",
                                  transition: "color 0.1s",
                                }}
                              >
                                {label}
                              </span>
                              {isActive && (
                                <div
                                  style={{
                                    marginTop: "4px",
                                    height: "2px",
                                    borderRadius: "2px",
                                    background: "rgba(255,210,8,0.12)",
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      height: "100%",
                                      width: "40%",
                                      background: "#FFD208",
                                      borderRadius: "2px",
                                      animation: "slideIn 1.2s ease-in-out infinite alternate",
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Pool stats */}
                  <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid rgba(255,255,245,0.05)" }}>
                    <div
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        color: "#3a3832",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        fontFamily: "monospace",
                        marginBottom: "10px",
                      }}
                    >
                      Pool Stats
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                      {[
                        { label: "TVL", value: "▓▓▓▓▓▓", enc: true },
                        { label: "24h Volume", value: "▓▓▓▓▓", enc: true },
                        { label: "Pool Fee", value: "0.30%" },
                        { label: "Your Share", value: "▓▓▓▓▓▓", enc: true },
                      ].map((s, i) => (
                        <div
                          key={i}
                          style={{
                            background: "rgba(0,0,0,0.2)",
                            borderRadius: "8px",
                            padding: "10px 12px",
                            border: "1px solid rgba(255,255,245,0.04)",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "9px",
                              color: "#3a3832",
                              fontFamily: "monospace",
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                              marginBottom: "5px",
                            }}
                          >
                            {s.label}
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              fontWeight: 700,
                              fontFamily: "monospace",
                              color: s.enc ? "rgba(240,237,230,0.2)" : "#f0ede6",
                              letterSpacing: s.enc ? "1px" : "0",
                            }}
                          >
                            {s.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right column */}
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {/* MEV */}
                  <div style={card}>
                    <div style={cardShine} />
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "12px",
                      }}
                    >
                      <h4 style={{ fontSize: "12px", fontWeight: 800 }}>MEV Protection</h4>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "5px",
                          background: "rgba(255,210,8,0.07)",
                          border: "1px solid rgba(255,210,8,0.22)",
                          borderRadius: "20px",
                          padding: "3px 9px",
                          fontSize: "9px",
                          fontWeight: 700,
                          color: "#FFD208",
                          fontFamily: "monospace",
                        }}
                      >
                        <span
                          style={{
                            width: "5px",
                            height: "5px",
                            borderRadius: "50%",
                            background: "#FFD208",
                            display: "inline-block",
                          }}
                        />
                        Live
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px" }}>
                      <div
                        style={{
                          background: "rgba(239,68,68,0.07)",
                          border: "1px solid rgba(239,68,68,0.15)",
                          borderRadius: "8px",
                          padding: "10px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "8px",
                            fontWeight: 700,
                            letterSpacing: "0.12em",
                            textTransform: "uppercase",
                            marginBottom: "6px",
                            color: "#ef4444",
                            fontFamily: "monospace",
                          }}
                        >
                          Public DEX
                        </div>
                        <div
                          style={{
                            fontSize: "10px",
                            fontFamily: "monospace",
                            lineHeight: 1.8,
                            color: "rgba(239,68,68,0.7)",
                          }}
                        >
                          SWAP 1,000
                          <br />
                          USDT - ETH
                          <br />
                          <br />
                          <span style={{ fontSize: "9px" }}>Bot reads this</span>
                        </div>
                      </div>
                      <div
                        style={{
                          background: "rgba(255,210,8,0.07)",
                          border: "1px solid rgba(255,210,8,0.22)",
                          borderRadius: "8px",
                          padding: "10px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "8px",
                            fontWeight: 700,
                            letterSpacing: "0.12em",
                            textTransform: "uppercase",
                            marginBottom: "6px",
                            color: "#FFD208",
                            fontFamily: "monospace",
                          }}
                        >
                          CipherDEX
                        </div>
                        <div style={{ fontSize: "10px", fontFamily: "monospace", lineHeight: 1.8, color: "#3a3832" }}>
                          0x4f2a
                          <br />
                          9c81d3e7
                          <br />
                          <br />
                          <span style={{ color: "#FFD208", fontSize: "9px" }}>Encrypted</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Balances */}
                  <div style={card}>
                    <div style={cardShine} />
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "12px",
                      }}
                    >
                      <h4 style={{ fontSize: "12px", fontWeight: 800 }}>Your Balances</h4>
                      <span style={{ fontSize: "10px", color: "#3a3832" }}>Tap to decrypt</span>
                    </div>
                    {[
                      { n: 1, name: "cUSDT", sub: "Confidential USDT", icon: <CUSDTIcon large /> },
                      { n: 2, name: "cETH", sub: "Confidential ETH", icon: <CETHIcon large /> },
                    ].map(token => (
                      <div
                        key={token.n}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 0",
                          borderBottom: token.n === 1 ? "1px solid rgba(255,255,245,0.04)" : "none",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          {token.icon}
                          <div>
                            <div style={{ fontSize: "12px", fontWeight: 800 }}>{token.name}</div>
                            <div style={{ fontSize: "10px", color: "#3a3832", marginTop: "1px" }}>{token.sub}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div
                            style={{
                              fontSize: "13px",
                              fontFamily: "monospace",
                              minWidth: "80px",
                              textAlign: "right",
                              color: revealed[token.n] ? "#FFD208" : "rgba(240,237,230,0.25)",
                              letterSpacing: revealed[token.n] ? "0" : "1px",
                              fontWeight: revealed[token.n] ? 600 : 400,
                              textShadow: revealed[token.n] ? "0 0 10px rgba(255,210,8,0.3)" : "none",
                              transition: "text-shadow 0.4s",
                            }}
                          >
                            {displayBals[token.n]}
                          </div>
                          <button
                            onClick={() => revealBalance(token.n)}
                            disabled={revealing[token.n]}
                            style={{
                              fontSize: "9px",
                              fontWeight: 700,
                              color: revealed[token.n] ? "#FFD208" : "#3a3832",
                              background: revealed[token.n] ? "rgba(255,210,8,0.07)" : "rgba(0,0,0,0.18)",
                              border: revealed[token.n]
                                ? "1px solid rgba(255,210,8,0.22)"
                                : "1px solid rgba(255,255,245,0.05)",
                              borderRadius: "5px",
                              padding: "3px 9px",
                              cursor: revealing[token.n] ? "not-allowed" : "pointer",
                              marginTop: "3px",
                              display: "block",
                              width: "100%",
                              transition: "all 0.3s",
                            }}
                          >
                            {revealing[token.n] ? "Decrypting…" : revealed[token.n] ? "Hide" : "Reveal"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Trading Activity */}
                  <div style={card}>
                    <div style={cardShine} />
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "12px",
                      }}
                    >
                      <h4 style={{ fontSize: "12px", fontWeight: 800 }}>Trading Activity</h4>
                      <span style={{ fontSize: "10px", color: "#3a3832" }}>Last 4 weeks</span>
                    </div>
                    <div
                      style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "3px", marginBottom: "5px" }}
                    >
                      {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                        <div
                          key={i}
                          style={{ fontSize: "8px", color: "#3a3832", textAlign: "center", fontFamily: "monospace" }}
                        >
                          {d}
                        </div>
                      ))}
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(7,1fr)",
                        gap: "3px",
                        position: "relative",
                      }}
                    >
                      {heatmap.map(({ intensity }, i) => {
                        const op = intensity > 0 ? intensity : 0.05;
                        const tradeCount = heatmapCounts[i];
                        const daysAgo = 27 - i;
                        const date = new Date();
                        date.setDate(date.getDate() - daysAgo);
                        const label = date.toLocaleDateString("en", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        });
                        return (
                          <div
                            key={i}
                            style={{
                              aspectRatio: "1",
                              borderRadius: "3px",
                              background: `rgba(255,210,8,${op})`,
                              cursor: "default",
                              position: "relative",
                            }}
                            onMouseEnter={e => {
                              const t = e.currentTarget.querySelector(".tip") as HTMLElement;
                              if (t) t.style.display = "block";
                            }}
                            onMouseLeave={e => {
                              const t = e.currentTarget.querySelector(".tip") as HTMLElement;
                              if (t) t.style.display = "none";
                            }}
                          >
                            <div
                              className="tip"
                              style={{
                                display: "none",
                                position: "absolute",
                                bottom: "calc(100% + 6px)",
                                left: "50%",
                                transform: "translateX(-50%)",
                                background: "#1e1e1a",
                                border: "1px solid rgba(255,255,245,0.1)",
                                borderRadius: "6px",
                                padding: "5px 8px",
                                whiteSpace: "nowrap",
                                zIndex: 50,
                                pointerEvents: "none",
                              }}
                            >
                              <div
                                style={{ fontSize: "9px", fontWeight: 700, color: "#f0ede6", fontFamily: "monospace" }}
                              >
                                {tradeCount} swap{tradeCount !== 1 ? "s" : ""}
                              </div>
                              <div
                                style={{ fontSize: "9px", color: "#6b6860", fontFamily: "monospace", marginTop: "1px" }}
                              >
                                {label}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "10px" }}>
                      <div>
                        <div style={{ fontSize: "16px", fontWeight: 700, fontFamily: "monospace", color: "#FFD208" }}>
                          {totalTrades.toLocaleString()}
                        </div>
                        <div
                          style={{
                            fontSize: "9px",
                            color: "#3a3832",
                            fontFamily: "monospace",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            marginTop: "2px",
                          }}
                        >
                          Total trades
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "16px", fontWeight: 700, fontFamily: "monospace" }}>
                          {activeTraders.toString()}
                        </div>
                        <div
                          style={{
                            fontSize: "9px",
                            color: "#3a3832",
                            fontFamily: "monospace",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            marginTop: "2px",
                          }}
                        >
                          Traders
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Recent Trades */}
                  <div style={card}>
                    <div style={cardShine} />
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "12px",
                      }}
                    >
                      <h4 style={{ fontSize: "12px", fontWeight: 800 }}>Recent Trades</h4>
                      <span style={{ fontSize: "10px", color: "#3a3832" }}>All private</span>
                    </div>
                    {recentTrades.map((trade, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "8px 9px",
                          background: "rgba(0,0,0,0.14)",
                          borderRadius: "8px",
                          marginBottom: i < 2 ? "5px" : "0",
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            width: "26px",
                            height: "26px",
                            background: "rgba(255,255,245,0.04)",
                            borderRadius: "7px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <ArrowRightIcon />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: "10px",
                              fontFamily: "monospace",
                              color: "#3a3832",
                              whiteSpace: "normal",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              wordBreak: "break-word",
                            }}
                          >
                            {trade}
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: "9px",
                            fontWeight: 700,
                            color: "#3a3832",
                            background: "rgba(255,255,245,0.04)",
                            borderRadius: "4px",
                            padding: "2px 6px",
                            fontFamily: "monospace",
                          }}
                        >
                          Settled
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Mobile bottom nav */}
      {isMobile && (
        <nav
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            height: "60px",
            background: "rgba(17,17,16,0.97)",
            borderTop: "1px solid rgba(255,255,245,0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-around",
            zIndex: 150,
            backdropFilter: "blur(20px)",
          }}
        >
          {[
            { name: "Dashboard", icon: <DashIcon /> },
            { name: "Swap", icon: <SwapIcon /> },
            { name: "Portfolio", icon: <PortIcon /> },
            { name: "Audit View", icon: <AuditIcon /> },
          ].map(item => (
            <button
              key={item.name}
              onClick={() => setActiveNav(item.name)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "3px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "4px 8px",
              }}
            >
              <span style={{ color: activeNav === item.name ? "#FFD208" : "#6b6860" }}>{item.icon}</span>
              <span
                style={{
                  fontSize: "9px",
                  color: activeNav === item.name ? "#FFD208" : "#6b6860",
                  fontFamily: "monospace",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {item.name.split(" ")[0]}
              </span>
            </button>
          ))}
        </nav>
      )}

      {/* Toast */}
      {toastVisible && (
        <div
          style={{
            position: "fixed",
            bottom: isMobile ? "70px" : "20px",
            right: "20px",
            background: "rgba(17,17,16,0.96)",
            border: "1px solid rgba(255,210,8,0.22)",
            borderRadius: "13px",
            padding: "13px 16px",
            display: "flex",
            alignItems: "center",
            gap: "11px",
            backdropFilter: "blur(20px)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
            zIndex: 1000,
            maxWidth: isMobile ? "calc(100vw - 40px)" : "auto",
          }}
        >
          <div
            style={{
              width: "24px",
              height: "24px",
              background: "#FFD208",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <CheckIcon />
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 800 }}>Swap Completed</div>
            <div
              onClick={() => toastTxHashRef.current && window.open(`https://sepolia.etherscan.io/tx/${toastTxHashRef.current}`, "_blank")}
              style={{ fontSize: "10px", color: "#FFD208", cursor: "pointer", marginTop: "2px" }}
            >
              {toastTxHashRef.current ? `${toastTxHashRef.current.slice(0, 10)}…  View on Etherscan →` : "View on Etherscan →"}
            </div>
          </div>
          <span
            onClick={() => setToastVisible(false)}
            style={{ fontSize: "17px", color: "#3a3832", cursor: "pointer", marginLeft: "auto", padding: "0 3px" }}
          >
            ×
          </span>
        </div>
      )}
    </div>
  );
}

function DashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="1" width="5" height="5" rx="1" />
      <rect x="9" y="1" width="5" height="5" rx="1" />
      <rect x="1" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}
function SwapIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 7.5h11M9 3l4 4.5L9 12" />
    </svg>
  );
}
function TxIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="2" width="13" height="11" rx="1.5" />
      <path d="M4 6h7M4 9h5" />
    </svg>
  );
}
function PoolIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="7.5" cy="7.5" r="6" />
      <path d="M4 7.5h7M7.5 4v7" />
    </svg>
  );
}
function PerfIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="1,12 4,8 7,10 11,5 14,7" />
    </svg>
  );
}
function PortIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="4" width="13" height="10" rx="1.5" />
      <path d="M5 4V3a1 1 0 011-1h3a1 1 0 011 1v1" />
    </svg>
  );
}
function AuditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="7.5" cy="7.5" r="6" />
      <path d="M7.5 4v4l2.5 2" />
    </svg>
  );
}
function SettingsIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="7.5" cy="7.5" r="2" />
      <path d="M7.5 1v2M7.5 12v2M1 7.5h2M12 7.5h2M3 3l1.5 1.5M10.5 10.5L12 12M3 12l1.5-1.5M10.5 4.5L12 3" />
    </svg>
  );
}
function HomeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 6l5.5-4.5L12 6v6H8.5V9h-4v3H1z" />
    </svg>
  );
}
function FaucetIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#FFD208" strokeWidth="1.5">
      <path d="M9 2v8M7 5l2-3 2 3" />
      <path d="M4 10a5 5 0 1010 0" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#FFD208" strokeWidth="1.5">
      <rect x="3" y="6" width="8" height="7" rx="1" />
      <path d="M5 6V4.5a2 2 0 014 0V6" />
      <circle cx="7" cy="9.5" r="1" fill="#FFD208" stroke="none" />
    </svg>
  );
}
function ArrowUpDownIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6.5 1v11M3 8l3.5 4 3.5-4M3 5l3.5-4 3.5 4" />
    </svg>
  );
}
function ArrowRightIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M1 5.5h9M6 2l4 3.5L6 9" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#000" strokeWidth="2.5">
      <path d="M1.5 6l3 3.5 6-7" />
    </svg>
  );
}
function CUSDTIcon({ large }: { large?: boolean }) {
  const s = large ? 32 : 22;
  return (
    <svg width={s} height={s} viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="16" fill="#1e1800" />
      <circle cx="16" cy="16" r="14" fill="#2a2200" stroke="#FFD208" strokeWidth="0.5" strokeOpacity="0.4" />
      <text x="16" y="20" textAnchor="middle" fill="#FFD208" fontSize="10" fontWeight="700" fontFamily="monospace">
        cU
      </text>
    </svg>
  );
}
function CETHIcon({ large }: { large?: boolean }) {
  const s = large ? 32 : 22;
  return (
    <svg width={s} height={s} viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="16" fill="#0a1428" />
      <circle cx="16" cy="16" r="14" fill="#0e1d38" stroke="#60a5fa" strokeWidth="0.5" strokeOpacity="0.4" />
      <text x="16" y="20" textAnchor="middle" fill="#60a5fa" fontSize="10" fontWeight="700" fontFamily="monospace">
        cE
      </text>
    </svg>
  );
}
