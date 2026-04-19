"use client";

import dynamic from "next/dynamic";

const SwapPage = dynamic(() => import("./_components/SwapPage").then(mod => ({ default: mod.SwapPage })), {
  ssr: false,
});

export default function Home() {
  return <SwapPage />;
}
