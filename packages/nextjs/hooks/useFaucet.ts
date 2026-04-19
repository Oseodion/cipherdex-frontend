"use client";

import { useState, useEffect, useCallback } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { useAccount } from "wagmi";
import { CONTRACTS } from "./useCipherDEX";
import FaucetABI from "~~/contracts/CipherDEXFaucet.json";

export function useFaucet(onSuccess?: () => void) {
  const { address, status } = useAccount();
  const isConnected = status === "connected";
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [localCooldown, setLocalCooldown] = useState(0);

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Read cooldown from contract
  const { data: contractCooldown, refetch: refetchCooldown } = useReadContract({
    address: CONTRACTS.faucet,
    abi: FaucetABI.abi,
    functionName: "cooldownRemaining",
    args: [address],
    query: { enabled: isConnected && !!address },
  });

  // Sync contract cooldown to local state
  useEffect(() => {
    if (contractCooldown !== undefined) {
      setLocalCooldown(Number(contractCooldown));
    }
  }, [contractCooldown]);

  // Count down locally every second
  useEffect(() => {
  if (localCooldown <= 0) return;
  const timer = setInterval(() => {
    setLocalCooldown(prev => {
      if (prev <= 1) {
        clearInterval(timer);
        return 0;
      }
      return prev - 1;
    });
  }, 1000);
  return () => clearInterval(timer);
}, [localCooldown]);

  const claim = useCallback(async () => {
    if (!isConnected || !address) {
      setClaimError("Please connect your wallet first");
      return;
    }
    setClaimError(null);
    setClaimSuccess(false);
    try {
      writeContract({
        address: CONTRACTS.faucet,
        abi: FaucetABI.abi,
        functionName: "claim",
      });
    } catch (err: any) {
      setClaimError(err?.message || "Failed to claim");
    }
  }, [isConnected, address, writeContract]);

  useEffect(() => {
    if (isConfirmed) {
      setClaimSuccess(true);
      setIsClaiming(false);
      refetchCooldown();
      onSuccess?.();
    }
  }, [isConfirmed, refetchCooldown, onSuccess]);

  useEffect(() => {
    if (isPending || isConfirming) setIsClaiming(true);
  }, [isPending, isConfirming]);

  useEffect(() => {
    if (writeError) {
      setClaimError(writeError.message);
      setIsClaiming(false);
    }
  }, [writeError]);

  const formatCooldown = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const canClaim = isConnected && !!address && !isClaiming && localCooldown === 0;

  return {
    claim,
    isClaiming,
    claimSuccess,
    claimError,
    canClaim,
    cooldownRemaining: localCooldown,
    cooldownFormatted: formatCooldown(localCooldown),
    txHash,
  };
}