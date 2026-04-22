import Script from "next/script";
import "@rainbow-me/rainbowkit/styles.css";
import { DappWrapperWithProviders } from "~~/components/DappWrapperWithProviders";
import { ThemeProvider } from "~~/components/ThemeProvider";
import "~~/styles/globals.css";
import { getMetadata } from "~~/utils/helper/getMetadata";

export const metadata = getMetadata({
  title: "CipherDEX",
  description: "Confidential AMM DEX - private swaps powered by FHE",
});

const DappWrapper = ({ children }: { children: React.ReactNode }) => {
  return (
    <html suppressHydrationWarning className={``} style={{ backgroundColor: "#0a0a08" }}>
      <head>
        <meta name="theme-color" content="#0a0a08" />
      </head>
      <body suppressHydrationWarning style={{ backgroundColor: "#0a0a08", color: "#f0ede6" }}>
        <Script src="https://cdn.zama.org/relayer-sdk-js/0.4.1/relayer-sdk-js.umd.cjs" strategy="afterInteractive" />
        <ThemeProvider enableSystem>
          <DappWrapperWithProviders>{children}</DappWrapperWithProviders>
        </ThemeProvider>
      </body>
    </html>
  );
};

export default DappWrapper;
