"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CONTRACTS } from "./useCipherDEX";
import { usePublicClient } from "wagmi";
import PoolABI from "~~/contracts/CipherDEXPool.json";
import { fetchEventLogsChunked } from "~~/utils/helper/fetchEventLogs";

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_BLOCKS = 60000n;

const formatAge = (timestampSeconds: number) => {
  const delta = Math.max(0, Math.floor(Date.now() / 1000) - timestampSeconds);
  if (delta < 60) return "just now";
  if (delta < 3600) return `${Math.floor(delta / 60)} min ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
};

const formatTrader = (trader: string) => `${trader.slice(0, 6)}...${trader.slice(-4)}`;

export type SwapRecord = {
  trader: string;
  aToB: boolean;
  timestamp: number;
  txHash: string;
  blockNumber: bigint;
};

type SwapConfirmedDetail = {
  txHash?: string | null;
  aToB?: boolean;
  trader?: string | null;
  timestamp?: number;
};

export function usePoolStats() {
  const publicClient = usePublicClient();
  const [activeTraders, setActiveTraders] = useState(0);
  const [totalTrades, setTotalTrades] = useState(0);
  const [heatmapCounts, setHeatmapCounts] = useState<number[]>(Array(28).fill(0));
  const [recentTrades, setRecentTrades] = useState<string[]>([]);
  const [swapRecords, setSwapRecords] = useState<SwapRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const swapEvent = useMemo(() => PoolABI.abi.find((item: any) => item.type === "event" && item.name === "Swap"), []);

  const loadPoolMetrics = useCallback(async (opts?: { foreground?: boolean }) => {
    if (!publicClient || !CONTRACTS.pool || !swapEvent) return;
    const foreground = opts?.foreground ?? false;
    if (foreground) setLoading(true);
    else setRefreshing(true);
    setError(null);

    const applySwapLogs = (rawLogs: any[]) => {

      const uniqueLogs = rawLogs.filter(
        (log, index, self) =>
          index === self.findIndex(l => l.transactionHash === log.transactionHash && l.logIndex === log.logIndex),
      );

      const dayBuckets = Array(28).fill(0);
      const uniqueTraders = new Set<string>();
      const now = Date.now();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);

      const swaps: SwapRecord[] = uniqueLogs
        .map((log: any) => ({
          trader: log.args?.trader as string,
          aToB: log.args?.aToB as boolean,
          timestamp: Number(log.args?.timestamp ?? 0n),
          txHash: log.transactionHash as string,
          blockNumber: log.blockNumber as bigint,
        }))
        .filter(item => item.timestamp > 0 && item.trader)
        .sort((a, b) => b.timestamp - a.timestamp);

      swaps.forEach(item => {
        const eventDate = new Date(item.timestamp * 1000);
        eventDate.setHours(0, 0, 0, 0);
        const daysAgo = Math.floor((today.getTime() - eventDate.getTime()) / DAY_MS);
        const bucketIdx = 27 - daysAgo;
        if (daysAgo >= 0 && daysAgo < 28) {
          dayBuckets[bucketIdx] += 1;
        }
        uniqueTraders.add(item.trader.toLowerCase());
      });

      setActiveTraders(uniqueTraders.size);
      setTotalTrades(swaps.length);
      setHeatmapCounts(dayBuckets);
      setSwapRecords(swaps);
      setRecentTrades(
        swaps.slice(0, 3).map(item => {
          const sold = item.aToB ? "cUSDT" : "cETH";
          const bought = item.aToB ? "cETH" : "cUSDT";
          return `${sold} → ${bought} (${formatTrader(item.trader)}) · ${formatAge(item.timestamp)}`;
        }),
      );
    };

    try {
      const latestBlock = await publicClient.getBlockNumber();
      const fromBlock = latestBlock > LOOKBACK_BLOCKS ? latestBlock - LOOKBACK_BLOCKS : 0n;
      const logs = await fetchEventLogsChunked({
        publicClient,
        address: CONTRACTS.pool,
        abi: PoolABI.abi,
        eventName: "Swap",
        fromBlock,
        toBlock: latestBlock,
      });
      applySwapLogs(logs);
      setRefreshing(false);
      if (foreground) setLoading(false);
    } catch (err: any) {
      setError(err?.message ?? "Unable to load pool activity");
      setRefreshing(false);
      if (foreground) setLoading(false);
    }
  }, [publicClient, swapEvent]);

  useEffect(() => {
    loadPoolMetrics({ foreground: true });
    return undefined;
  }, [loadPoolMetrics]);

  useEffect(() => {
    const onSwapConfirmed = (evt: Event) => {
      const detail = (evt as CustomEvent<SwapConfirmedDetail>).detail;
      const ts = detail?.timestamp ?? Math.floor(Date.now() / 1000);
      const hasDirection = typeof detail?.aToB === "boolean";
      const sold = hasDirection && detail.aToB ? "cUSDT" : "cETH";
      const bought = hasDirection && detail?.aToB === false ? "cUSDT" : "cETH";
      const traderLabel = detail?.trader ? formatTrader(detail.trader) : "pending";
      const recent = hasDirection
        ? `${sold} → ${bought} (${traderLabel}) · ${formatAge(ts)}`
        : `Swap (${traderLabel}) · ${formatAge(ts)}`;

      setRecentTrades(prev => [recent, ...prev.filter(item => item !== recent)].slice(0, 3));
      setTotalTrades(prev => prev + 1);
      setHeatmapCounts(prev => {
        const next = [...prev];
        next[next.length - 1] = (next[next.length - 1] ?? 0) + 1;
        return next;
      });

      if (detail?.trader) {
        const trader = detail.trader.toLowerCase();
        setActiveTraders(prev => (swapRecords.some(r => r.trader.toLowerCase() === trader) ? prev : prev + 1));
      }
      // Delay reconciliation slightly so RPC indexers have time to surface the new event.
      window.setTimeout(() => {
        loadPoolMetrics();
      }, 1500);
    };
    window.addEventListener("cipherdex:swap-confirmed", onSwapConfirmed);
    return () => window.removeEventListener("cipherdex:swap-confirmed", onSwapConfirmed);
  }, [loadPoolMetrics, swapRecords]);

  return {
    activeTraders,
    totalTrades,
    heatmapCounts,
    recentTrades,
    swapRecords,
    loading,
    refreshing,
    error,
    refetch: () => loadPoolMetrics(),
  };
}
