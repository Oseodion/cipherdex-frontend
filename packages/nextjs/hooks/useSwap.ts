"use client";

import { useState, useCallback, useMemo } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { CONTRACTS } from "./useCipherDEX";
import { useWagmiEthers } from "./wagmi/useWagmiEthers";
import { useAccount } from "wagmi";
import PoolABI from "~~/contracts/CipherDEXPool.json";
import TokenABI from "~~/contracts/ConfidentialToken.json";
import type { FhevmInstance } from "@fhevm-sdk";
import { useFHEEncryption, toHex } from "@fhevm-sdk";

// FHEVM swap operations are gas-intensive; auto-estimation often exceeds chain limits.
// 10M gas covers the FHE mul/div/select operations in CipherDEXPool.swap().
const SWAP_GAS_LIMIT = 10_000_000n;

export function useSwap(fhevmInstance: FhevmInstance | undefined) {
  const { address, isConnected } = useAccount();
  const { ethersSigner, ethersProvider } = useWagmiEthers();
  const [isSwapping, setIsSwapping] = useState(false);
  const [txStep, setTxStep] = useState(0);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapSuccess, setSwapSuccess] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  const { encryptWith, canEncrypt } = useFHEEncryption({
    instance: fhevmInstance,
    ethersSigner: ethersSigner ?? undefined,
    contractAddress: CONTRACTS.pool,
  });

  const { writeContractAsync } = useWriteContract();
  const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  const { data: poolInitialized } = useReadContract({
    address: CONTRACTS.pool,
    abi: PoolABI.abi,
    functionName: "initialized",
    query: { staleTime: 30_000 },
  });

  const { data: cUSDTOperatorApproved } = useReadContract({
    address: CONTRACTS.cUSDT,
    abi: TokenABI.abi,
    functionName: "isOperator",
    args: [address, CONTRACTS.pool],
    query: {
      enabled: !!address,
      staleTime: 30_000,
    },
  });

  const { data: cETHOperatorApproved } = useReadContract({
    address: CONTRACTS.cETH,
    abi: TokenABI.abi,
    functionName: "isOperator",
    args: [address, CONTRACTS.pool],
    query: {
      enabled: !!address,
      staleTime: 30_000,
    },
  });

  const operatorByDirection = useMemo(
    () => ({
      aToB: Boolean(cUSDTOperatorApproved),
      bToA: Boolean(cETHOperatorApproved),
    }),
    [cUSDTOperatorApproved, cETHOperatorApproved],
  );

  const swap = useCallback(async (
    amountIn: bigint,
    minAmountOut: bigint,
    aToB: boolean,
  ) => {
    if (!isConnected || !address) {
      setSwapError("Please connect your wallet first");
      return;
    }
    if (!canEncrypt) {
      setSwapError("FHE not ready yet - please wait");
      return;
    }
    if (poolInitialized === false) {
      setSwapError("Pool not initialized — liquidity must be seeded first");
      return;
    }
    setIsSwapping(true);
    setSwapError(null);
    setSwapSuccess(false);
    try {
      setTxStep(1);
      const [encAmountIn, encMinAmountOut] = await Promise.all([
        encryptWith(builder => builder.add64(amountIn)),
        encryptWith(builder => builder.add64(minAmountOut)),
      ]);
      if (!encAmountIn) throw new Error("Amount encryption failed");
      if (!encMinAmountOut) throw new Error("Encryption failed");
      setTxStep(2);
      if (!ethersProvider) throw new Error("Wallet provider unavailable");
      const tokenAddress = aToB ? CONTRACTS.cUSDT : CONTRACTS.cETH;

      // Use cached operator state to avoid extra RPC on every click.
      const alreadyOperator = aToB ? operatorByDirection.aToB : operatorByDirection.bToA;
      if (!alreadyOperator) {
        const futureTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);
        const approvalTx = await writeContractAsync({
          address: tokenAddress,
          abi: TokenABI.abi,
          functionName: "setOperator",
          args: [CONTRACTS.pool, futureTimestamp],
        });
        await ethersProvider.waitForTransaction(approvalTx as string);
      }

      setTxStep(3);
      const swapTx = await writeContractAsync({
        address: CONTRACTS.pool,
        abi: PoolABI.abi,
        functionName: "swap",
        gas: SWAP_GAS_LIMIT,
        args: [
          toHex(encAmountIn.handles[0]),
          toHex(encAmountIn.inputProof),
          toHex(encMinAmountOut.handles[0]),
          toHex(encMinAmountOut.inputProof),
          aToB,
        ],
      });
      setTxHash(swapTx as `0x${string}`);
      setTxStep(4);
      await ethersProvider.waitForTransaction(swapTx as string);
      setSwapSuccess(true);
    } catch (err: any) {
      setSwapError(err?.message || "Swap failed");
      setTxStep(0);
    } finally {
      setIsSwapping(false);
    }
  }, [isConnected, address, canEncrypt, encryptWith, writeContractAsync, poolInitialized, operatorByDirection, ethersProvider]);

  const reset = useCallback(() => {
    setTxStep(0);
    setSwapError(null);
    setSwapSuccess(false);
    setTxHash(undefined);
    setIsSwapping(false);
  }, []);

  return {
    swap,
    isSwapping,
    txStep,
    swapError,
    swapSuccess,
    txHash,
    isConfirmed,
    poolInitialized: poolInitialized as boolean | undefined,
    canSwap: isConnected && canEncrypt && !isSwapping,
    reset,
  };
}