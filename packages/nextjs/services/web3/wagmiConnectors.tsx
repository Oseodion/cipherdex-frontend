import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  metaMaskWallet,
  okxWallet,
  rabbyWallet,
  walletConnectWallet,
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
        wallets: [metaMaskWallet, rabbyWallet, coinbaseWallet, walletConnectWallet, okxWallet],
      },
    ],
    {
      appName: "CipherDEX",
      projectId: scaffoldConfig.walletConnectProjectId,
    },
  );
};