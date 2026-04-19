"use client";

import { useState, useCallback } from "react";
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
      const encAmountIn = await encryptWith(builder => builder.add64(amountIn));
      if (!encAmountIn) throw new Error("Encryption failed");
      const encMinAmountOut = await encryptWith(builder => builder.add64(minAmountOut));
      if (!encMinAmountOut) throw new Error("Encryption failed");
      setTxStep(2);
      if (!ethersProvider) throw new Error("Wallet provider unavailable");
      const tokenAddress = aToB ? CONTRACTS.cUSDT : CONTRACTS.cETH;

      // Skip setOperator if the pool is already approved as operator (saves one tx)
      const tokenContract = new (await import("ethers")).Contract(
        tokenAddress,
        TokenABI.abi,
        await ethersProvider.getSigner(),
      );
      const alreadyOperator: boolean = await tokenContract.isOperator(address, CONTRACTS.pool);
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
  }, [isConnected, address, canEncrypt, encryptWith, writeContractAsync, poolInitialized]);

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