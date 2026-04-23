import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  okxWallet,
  rabbyWallet,
} from "@rainbow-me/rainbowkit/wallets";
import scaffoldConfig from "~~/scaffold.config";

export const wagmiConnectors = () => {
  if (typeof window === "undefined") {
    return [];
  }

  return connectorsForWallets(
    [
      {
        groupName: "Supported Wallets",
        // Keep connector surface minimal for reliability during demos.
        wallets: [metaMaskWallet, rabbyWallet, okxWallet],
      },
    ],
    {
      appName: "CipherDEX",
      projectId: scaffoldConfig.walletConnectProjectId,
    },
  );
};