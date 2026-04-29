import { wagmiConnectors } from "./wagmiConnectors";
import { Chain, createClient, fallback, http } from "viem";
import { hardhat, mainnet } from "viem/chains";
import { createConfig } from "wagmi";
import scaffoldConfig, { ScaffoldConfig } from "~~/scaffold.config";
import { getAlchemyHttpUrl } from "~~/utils/helper";

const { targetNetworks } = scaffoldConfig;

// We always want to have mainnet enabled (ENS resolution, ETH price, etc). But only once.
export const enabledChains = targetNetworks.find((network: Chain) => network.id === 1)
  ? targetNetworks
  : ([...targetNetworks, mainnet] as const);

export const wagmiConfig = createConfig({
  chains: enabledChains,
  connectors: wagmiConnectors(),
  ssr: false,
  client: ({ chain }) => {
    const rpcOverrideUrl = (scaffoldConfig.rpcOverrides as ScaffoldConfig["rpcOverrides"])?.[chain.id];
    const preferAlchemyRpc = process.env.NEXT_PUBLIC_PREFER_ALCHEMY_RPC === "true";
    const alchemyHttpUrl = getAlchemyHttpUrl(chain.id);
    const overrideIsAlchemy = !!rpcOverrideUrl && rpcOverrideUrl.includes("alchemy.com");
    const effectiveOverrideUrl = !preferAlchemyRpc && overrideIsAlchemy ? undefined : rpcOverrideUrl;
    const chainSafeFallbacks =
      chain.id === 1
        ? ["https://ethereum-rpc.publicnode.com", "https://rpc.ankr.com/eth"]
        : chain.id === 11155111
          ? [
              "https://ethereum-sepolia-rpc.publicnode.com",
              "https://rpc.sepolia.org",
              "https://sepolia.gateway.tenderly.co",
              "https://eth-sepolia.public.blastapi.io",
            ]
          : [];
    const extraSepoliaFallbacks =
      chain.id === 11155111
        ? [
            "https://ethereum-sepolia-rpc.publicnode.com",
            "https://rpc.sepolia.org",
            "https://sepolia.gateway.tenderly.co",
            "https://eth-sepolia.public.blastapi.io",
          ]
        : [];
    const primaryUrl = preferAlchemyRpc
      ? alchemyHttpUrl || effectiveOverrideUrl
      : effectiveOverrideUrl || extraSepoliaFallbacks[0];
    const alchemyFallback = preferAlchemyRpc ? [alchemyHttpUrl] : [];
    const rpcUrls = Array.from(
      new Set(
        [primaryUrl, ...chainSafeFallbacks, ...alchemyFallback].filter((url): url is string => !!url),
      ),
    );
    const rpcFallbacks = rpcUrls.map(url => http(url));
    return createClient({
      chain,
      transport: fallback(rpcFallbacks),
      ...(chain.id !== (hardhat as Chain).id ? { pollingInterval: scaffoldConfig.pollingInterval } : {}),
    });
  },
});
