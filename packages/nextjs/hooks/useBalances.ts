"use client";

import { useCallback, useMemo } from "react";
import { useReadContract } from "wagmi";
import { useFHEDecrypt, useInMemoryStorage } from "@fhevm-sdk";
import TokenABI from "~~/contracts/ConfidentialToken.json";
import { CONTRACTS } from "./useCipherDEX";
import type { FhevmInstance } from "@fhevm-sdk";
import type { ethers } from "ethers";

export function useBalances(
  address: `0x${string}` | undefined,
  isConnected: boolean,
  chainId: number | undefined,
  fhevmInstance: FhevmInstance | undefined,
  ethersSigner: ethers.JsonRpcSigner | undefined,
) {
  const { storage: fhevmDecryptionSignatureStorage } = useInMemoryStorage();

  const { data: cUSDTRawHandle, refetch: refetchUSDT } = useReadContract({
    address: CONTRACTS.cUSDT,
    abi: TokenABI.abi,
    functionName: "confidentialBalanceOf",
    args: [address],
    query: {
      enabled: isConnected && !!address,
      staleTime: 0,
      gcTime: 0,
    },
  });
  const cUSDTHandle = cUSDTRawHandle as `0x${string}` | undefined;

  const { data: cETHRawHandle, refetch: refetchETH } = useReadContract({
    address: CONTRACTS.cETH,
    abi: TokenABI.abi,
    functionName: "confidentialBalanceOf",
    args: [address],
    query: {
      enabled: isConnected && !!address,
      staleTime: 0,
      gcTime: 0,
    },
  });
  const cETHHandle = cETHRawHandle as `0x${string}` | undefined;

  const requests = useMemo(() => {
    if (!cUSDTHandle && !cETHHandle) return undefined;
    const reqs = [];
    if (cUSDTHandle) reqs.push({
      handle: cUSDTHandle as string,
      contractAddress: CONTRACTS.cUSDT,
    });
    if (cETHHandle) reqs.push({
      handle: cETHHandle as string,
      contractAddress: CONTRACTS.cETH,
    });
    return reqs.length > 0 ? reqs : undefined;
  }, [cUSDTHandle, cETHHandle]);

  const {
    decrypt,
    isDecrypting,
    results,
    error: decryptError,
    canDecrypt,
  } = useFHEDecrypt({
    instance: fhevmInstance,
    ethersSigner: ethersSigner as any,
    fhevmDecryptionSignatureStorage,
    chainId,
    requests,
  });

  const formatBalance = (raw: bigint | undefined, decimals: number) => {
    if (raw === undefined) return null;
    const divisor = BigInt(10 ** decimals);
    const whole = raw / divisor;
    const fraction = raw % divisor;
    const fractionStr = fraction.toString().padStart(decimals, "0").slice(0, 1);
    return `${whole.toLocaleString()}.${fractionStr}`;
  };

  const cUSDTRaw = cUSDTHandle ? results[cUSDTHandle as string] as bigint : undefined;
  const cETHRaw = cETHHandle ? results[cETHHandle as string] as bigint : undefined;

  const cUSDTBalance = formatBalance(cUSDTRaw, 6);
  const cETHBalance = formatBalance(cETHRaw, 9);

  const refetch = useCallback(async () => {
    await Promise.all([refetchUSDT(), refetchETH()]);
  }, [refetchUSDT, refetchETH]);

  return {
    cUSDTBalance,
    cETHBalance,
    cUSDTRaw,
    cETHRaw,
    isDecrypting,
    canDecrypt,
    decrypt,
    decryptError,
    refetch,
    hasBalances: isConnected && !!address,
  };
}