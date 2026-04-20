"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CONTRACTS } from "./useCipherDEX";
import { getContractEvents } from "viem/actions";
import { usePublicClient } from "wagmi";
import PoolABI from "~~/contracts/CipherDEXPool.json";

const DAY_MS = 24 * 60 * 60 * 1000;
const SCAN_RANGE = 10000n;

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
    if (foreground) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    try {
      const latestBlock = await publicClient.getBlockNumber();
      const fromBlock = latestBlock > SCAN_RANGE ? latestBlock - SCAN_RANGE : 0n;
      let scanFrom = fromBlock;
      const rawLogs: any[] = [];

      while (scanFrom <= latestBlock) {
        const scanTo = scanFrom + SCAN_RANGE - 1n <= latestBlock ? scanFrom + SCAN_RANGE - 1n : latestBlock;
        const chunkLogs = await getContractEvents(publicClient, {
          address: CONTRACTS.pool,
          abi: PoolABI.abi,
          eventName: "Swap",
          fromBlock: scanFrom,
          toBlock: scanTo,
          strict: false,
        });
        rawLogs.push(...(chunkLogs as any[]));
        scanFrom = scanTo + 1n;
      }

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
    } catch (err: any) {
      setError(err?.message ?? "Unable to load pool activity");
    } finally {
      if (foreground) {
        setLoading(false);
      }
      setRefreshing(false);
    }
  }, [publicClient, swapEvent]);

  useEffect(() => {
    loadPoolMetrics({ foreground: true });
    const intervalId = window.setInterval(() => loadPoolMetrics(), 60000);
    return () => window.clearInterval(intervalId);
  }, [loadPoolMetrics]);

  useEffect(() => {
    const onSwapConfirmed = () => {
      loadPoolMetrics();
    };
    window.addEventListener("cipherdex:swap-confirmed", onSwapConfirmed);
    return () => window.removeEventListener("cipherdex:swap-confirmed", onSwapConfirmed);
  }, [loadPoolMetrics]);

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
