"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useReadContract } from "wagmi";
import { useFHEDecrypt, useInMemoryStorage } from "@fhevm-sdk";
import TokenABI from "~~/contracts/ConfidentialToken.json";
import { CONTRACTS } from "./useCipherDEX";
import type { FhevmInstance } from "@fhevm-sdk";
import type { ethers } from "ethers";

const ZERO_HANDLE = `0x${"0".repeat(64)}`;

const isValidHandle = (handle: string | undefined): handle is `0x${string}` => !!handle && handle !== ZERO_HANDLE;

export function useBalances(
  address: `0x${string}` | undefined,
  isConnected: boolean,
  chainId: number | undefined,
  fhevmInstance: FhevmInstance | undefined,
  ethersSigner: ethers.JsonRpcSigner | undefined,
  decryptTarget?: 1 | 2 | null,
) {
  const { storage: fhevmDecryptionSignatureStorage } = useInMemoryStorage();
  const latestHandlesRef = useRef<{ usdt?: `0x${string}`; eth?: `0x${string}` }>({});

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
  const cUSDTHandleRaw = cUSDTRawHandle as `0x${string}` | undefined;
  const cUSDTHandle = isValidHandle(cUSDTHandleRaw) ? cUSDTHandleRaw : latestHandlesRef.current.usdt;

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
  const cETHHandleRaw = cETHRawHandle as `0x${string}` | undefined;
  const cETHHandle = isValidHandle(cETHHandleRaw) ? cETHHandleRaw : latestHandlesRef.current.eth;

  const requests = useMemo(() => {
    if (!cUSDTHandle && !cETHHandle) return undefined;
    const reqs = [];
    if ((decryptTarget === undefined || decryptTarget === null || decryptTarget === 1) && cUSDTHandle) {
      reqs.push({
        handle: cUSDTHandle as string,
        contractAddress: CONTRACTS.cUSDT,
      });
    }
    if ((decryptTarget === undefined || decryptTarget === null || decryptTarget === 2) && cETHHandle) {
      reqs.push({
        handle: cETHHandle as string,
        contractAddress: CONTRACTS.cETH,
      });
    }
    return reqs.length > 0 ? reqs : undefined;
  }, [cUSDTHandle, cETHHandle, decryptTarget]);

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

  const formatBalance = (
    raw: bigint | undefined,
    decimals: number,
    maxFractionDigits = 4,
    minFractionDigits = 2,
  ) => {
    if (raw === undefined) return null;
    const divisor = BigInt(10 ** decimals);
    const whole = raw / divisor;
    const fraction = raw % divisor;
    const boundedMaxDigits = Math.max(1, Math.min(maxFractionDigits, decimals));
    const boundedMinDigits = Math.max(0, Math.min(minFractionDigits, boundedMaxDigits));
    const fullFraction = fraction.toString().padStart(decimals, "0");
    let shownFraction = fullFraction.slice(0, boundedMaxDigits);
    shownFraction = shownFraction.replace(/0+$/, "");
    if (shownFraction.length < boundedMinDigits) {
      shownFraction = fullFraction.slice(0, boundedMinDigits);
    }
    return shownFraction.length > 0 ? `${whole.toLocaleString()}.${shownFraction}` : whole.toLocaleString();
  };

  const cUSDTRaw = cUSDTHandle ? results[cUSDTHandle as string] as bigint : undefined;
  const cETHRaw = cETHHandle ? results[cETHHandle as string] as bigint : undefined;

  const cUSDTBalance = formatBalance(cUSDTRaw, 6, 4, 2);
  const cETHBalance = formatBalance(cETHRaw, 9, 4, 4);

  const refetch = useCallback(async () => {
    const [usdt, eth] = await Promise.all([refetchUSDT(), refetchETH()]);
    const usdtHandle = usdt.data as `0x${string}` | undefined;
    const ethHandle = eth.data as `0x${string}` | undefined;
    const nextUSDT = isValidHandle(usdtHandle) ? usdtHandle : undefined;
    const nextETH = isValidHandle(ethHandle) ? ethHandle : undefined;
    latestHandlesRef.current = {
      usdt: nextUSDT ?? latestHandlesRef.current.usdt,
      eth: nextETH ?? latestHandlesRef.current.eth,
    };
    return {
      usdtReady: !!nextUSDT,
      ethReady: !!nextETH,
      usdtHandle: nextUSDT,
      ethHandle: nextETH,
    };
  }, [refetchUSDT, refetchETH]);

  useEffect(() => {
    const nextUSDT = isValidHandle(cUSDTHandleRaw) ? cUSDTHandleRaw : undefined;
    const nextETH = isValidHandle(cETHHandleRaw) ? cETHHandleRaw : undefined;
    if (!nextUSDT && !nextETH) return;
    latestHandlesRef.current = {
      usdt: nextUSDT ?? latestHandlesRef.current.usdt,
      eth: nextETH ?? latestHandlesRef.current.eth,
    };
  }, [cUSDTHandleRaw, cETHHandleRaw]);

  useEffect(() => {
    if (!isConnected || !address) {
      latestHandlesRef.current = {};
    }
  }, [isConnected, address]);

  return {
    cUSDTBalance,
    cETHBalance,
    cUSDTRaw,
    cETHRaw,
    isDecrypting,
    canDecrypt: canDecrypt && !!requests,
    decrypt,
    decryptError,
    refetch,
    cUSDTHandle,
    cETHHandle,
    hasUSDTHandle: !!cUSDTHandle,
    hasETHHandle: !!cETHHandle,
    hasBalances: isConnected && !!address,
  };
}