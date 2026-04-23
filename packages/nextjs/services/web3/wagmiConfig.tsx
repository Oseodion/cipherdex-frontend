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
    const alchemyHttpUrl = getAlchemyHttpUrl(chain.id);
    const extraSepoliaFallbacks =
      chain.id === 11155111
        ? [
            "https://ethereum-sepolia-rpc.publicnode.com",
            "https://rpc.sepolia.org",
            "https://sepolia.gateway.tenderly.co",
            "https://eth-sepolia.public.blastapi.io",
          ]
        : [];
    const primaryUrl = alchemyHttpUrl || rpcOverrideUrl;
    const rpcUrls = [primaryUrl, ...extraSepoliaFallbacks].filter((url): url is string => !!url);
    const rpcFallbacks = rpcUrls.length > 0 ? rpcUrls.map(url => http(url)) : [http()];
    return createClient({
      chain,
      transport: fallback(rpcFallbacks),
      ...(chain.id !== (hardhat as Chain).id ? { pollingInterval: scaffoldConfig.pollingInterval } : {}),
    });
  },
});
