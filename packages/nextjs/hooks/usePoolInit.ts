"use client";

import { useCallback, useEffect } from "react";
import { useReadContract, useWriteContract } from "wagmi";
import { CONTRACTS } from "./useCipherDEX";
import PoolABI from "~~/contracts/CipherDEXPool.json";
import TokenABI from "~~/contracts/ConfidentialToken.json";

// FHEVM addLiquidity/initializePool ops need high gas budget
const INIT_GAS_LIMIT = 10_000_000n;

export function usePoolInit() {
  const { writeContractAsync } = useWriteContract();

  const { data: initialized, isLoading: initLoading, refetch: refetchInit } = useReadContract({
    address: CONTRACTS.pool,
    abi: PoolABI.abi,
    functionName: "initialized",
    query: { staleTime: 30_000 },
  });

  const { data: snapshotARaw, refetch: refetchA } = useReadContract({
    address: CONTRACTS.pool,
    abi: PoolABI.abi,
    functionName: "reserveSnapshotA",
    query: { staleTime: 15_000 },
  });

  const { data: snapshotBRaw, refetch: refetchB } = useReadContract({
    address: CONTRACTS.pool,
    abi: PoolABI.abi,
    functionName: "reserveSnapshotB",
    query: { staleTime: 15_000 },
  });

  const { data: totalSharesRaw, refetch: refetchShares } = useReadContract({
    address: CONTRACTS.pool,
    abi: PoolABI.abi,
    functionName: "totalShares",
    query: { staleTime: 15_000 },
  });

  const snapshotA = snapshotARaw as bigint | undefined;
  const snapshotB = snapshotBRaw as bigint | undefined;
  const totalShares = totalSharesRaw as bigint | undefined;

  // Exchange rate: snapshotA = cUSDT (6 dec), snapshotB = cETH (9 dec)
  // price = snapshotA / 1e6 / (snapshotB / 1e9) cUSDT per cETH
  const rateUSDTperETH =
    snapshotA && snapshotB && snapshotB > 0n
      ? Number(snapshotA) * 1e3 / Number(snapshotB)
      : null;

  const refetch = useCallback(() => {
    refetchInit();
    refetchA();
    refetchB();
    refetchShares();
  }, [refetchInit, refetchA, refetchB, refetchShares]);

  useEffect(() => {
    const onLiquidityChanged = () => refetch();
    window.addEventListener("cipherdex:liquidity-changed", onLiquidityChanged);
    return () => window.removeEventListener("cipherdex:liquidity-changed", onLiquidityChanged);
  }, [refetch]);

  // Admin-only: seed initial liquidity into the pool.
  // amountA = cUSDT raw (6 decimals), amountB = cETH raw (9 decimals)
  const initPool = useCallback(async (amountA: bigint, amountB: bigint) => {
    const futureTs = BigInt(Math.floor(Date.now() / 1000) + 3600);
    await writeContractAsync({
      address: CONTRACTS.cUSDT,
      abi: TokenABI.abi,
      functionName: "setOperator",
      args: [CONTRACTS.pool, futureTs],
    });
    await writeContractAsync({
      address: CONTRACTS.cETH,
      abi: TokenABI.abi,
      functionName: "setOperator",
      args: [CONTRACTS.pool, futureTs],
    });
    await writeContractAsync({
      address: CONTRACTS.pool,
      abi: PoolABI.abi,
      functionName: "initializePool",
      gas: INIT_GAS_LIMIT,
      args: [amountA, amountB],
    });
    refetch();
  }, [writeContractAsync, refetch]);

  return {
    poolInitialized: initialized as boolean | undefined,
    initLoading,
    snapshotA,
    snapshotB,
    totalShares,
    rateUSDTperETH,
    initPool,
    refetch,
  };
}
