import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useWagmiEthers } from "~~/hooks/wagmi/useWagmiEthers";

export const CONTRACTS = {
  cUSDT: process.env.NEXT_PUBLIC_CUSDT_ADDRESS as `0x${string}`,
  cETH: process.env.NEXT_PUBLIC_CETH_ADDRESS as `0x${string}`,
  pool: process.env.NEXT_PUBLIC_POOL_ADDRESS as `0x${string}`,
  faucet: process.env.NEXT_PUBLIC_FAUCET_ADDRESS as `0x${string}`,
};

export function useCipherDEX() {
  const { address, status, chainId: connectedChainId } = useAccount();
  // Treat reconnecting sessions with a known address as connected so
  // refresh does not temporarily disable reveal/faucet actions.
  const isConnected = status !== "disconnected" && !!address;
  const { data: walletClient } = useWalletClient();
  const { ethersSigner, ethersProvider } = useWagmiEthers();
  const publicClient = usePublicClient();

  return {
    address,
    isConnected,
    chainId: walletClient?.chain?.id ?? connectedChainId,
    ethersSigner,
    ethersProvider,
    publicClient,
    contracts: CONTRACTS,
  };
}