"use client";

// @refresh reset
import { AddressInfoDropdown } from "./AddressInfoDropdown";
import { WrongNetworkDropdown } from "./WrongNetworkDropdown";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Address } from "viem";
import { useTargetNetwork } from "~~/hooks/helper/useTargetNetwork";
import { getBlockExplorerAddressLink } from "~~/utils/helper";

export const RainbowKitCustomConnectButton = () => {
  const { targetNetwork } = useTargetNetwork();

  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, mounted }) => {
        const connected = mounted && account && chain;
        const blockExplorerAddressLink = account
          ? getBlockExplorerAddressLink(targetNetwork, account.address)
          : undefined;

        return (
          <>
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    type="button"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "7px",
                      background: "#171714",
                      border: "1px solid rgba(255,255,245,0.09)",
                      borderRadius: "9px",
                      padding: "8px 16px",
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#f0ede6",
                      cursor: "pointer",
                      fontFamily: "'Cabinet Grotesk', sans-serif",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="1" y="3" width="11" height="8" rx="1.5" />
                      <path d="M9 7h1.5M4 1v2M9 1v2" />
                    </svg>
                    Connect Wallet
                  </button>
                );
              }

              if (chain.unsupported || chain.id !== targetNetwork.id) {
                return <WrongNetworkDropdown />;
              }

              return (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                  {/* Balance pill — chain name omitted (always Sepolia) to save space */}
                  <div
                    className="wallet-balance-pill"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      background: "#171714",
                      border: "1px solid rgba(255,255,245,0.09)",
                      borderRadius: "9px",
                      padding: "6px 10px",
                      whiteSpace: "nowrap",
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "#f0ede6",
                        fontFamily: "monospace",
                      }}
                    >
                      {account.displayBalance}
                    </span>
                  </div>

                  {/* Address dropdown */}
                  <AddressInfoDropdown
                    address={account.address as Address}
                    displayName={account.displayName}
                    ensAvatar={account.ensAvatar}
                    blockExplorerAddressLink={blockExplorerAddressLink}
                  />
                </div>
              );
            })()}
          </>
        );
      }}
    </ConnectButton.Custom>
  );
};
