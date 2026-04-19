# CipherDEX — Confidential AMM on Zama FHEVM

A decentralized exchange where swap amounts are encrypted with Fully Homomorphic Encryption before the transaction leaves the browser. MEV bots watching the mempool see only encrypted ciphertext — the actual trade size is never revealed on-chain.

Built for the **Zama Developer Program Mainnet Season 2 — Builder Track**.

---

## The Problem

On standard DEXes like Uniswap, every swap sits in the public mempool for roughly 12 seconds before it confirms. MEV bots read the swap amount in real time, calculate the price impact, and insert their own trades first. The user gets a worse execution price. This is front-running, and it costs DeFi users hundreds of millions of dollars per year.

## How CipherDEX Fixes It

CipherDEX encrypts the swap amount client-side using Zama's FHE SDK before the transaction is submitted. The pool contract executes AMM math on ciphertext — it never sees the raw input amount. Even the sequencer and validators cannot read what was swapped.

**Encrypt → Submit → Settle. In that order. The amount is never plaintext on-chain.**

---

## Architecture

```
User enters amount
       ↓
FHE SDK encrypts amount in browser (Zama relayer issues input proof)
       ↓
Encrypted handle + proof submitted to CipherDEXPool.swap()
       ↓
Pool performs constant-product AMM math on encrypted values (FHE operations)
       ↓
Output token amount revealed only to recipient via ACL-gated decryption
       ↓
Balance updated — plaintext amount never appears in calldata or logs
```

The pool uses confidential ERC20 tokens (cUSDT and cETH). All token balances and LP shares are stored as FHE ciphertexts. Encrypted handles are 32-byte opaque pointers — a mempool observer learns nothing about trade size or direction.

---

## Features

- **Confidential swaps** — FHE-encrypted amounts, MEV-resistant by construction
- **Add / remove liquidity** — encrypted inputs, fully on-chain
- **Faucet** — claim 10,000 cUSDT and 5 cETH every 24 hours
- **Portfolio page** — reveal your encrypted balances with an in-browser FHE decryption
- **Transaction history** — on-chain Swap events with encrypted amounts shown as `░░░░`
- **Performance dashboard** — 28-day activity heatmap from live event data
- **Audit view** — explains the FHE privacy model and shows the encrypted trade log

---

## Deployed Contracts — Sepolia

| Contract | Address |
|---|---|
| cUSDT | `0x401924f4bd976A0168eCa95253eAE61590e89115` |
| cETH | `0x51aA0DA9A1100deb3f2B2B75dD4cc1b67A5590F4` |
| CipherDEXPool | `0x34ADB4dfc310dAF08982E10BA8162794A7521734` |
| CipherDEXFaucet | `0x53063D910e9Ebe4B112ceFCEB1a08A62A7cD2A9f` |

---

## Tech Stack

| Layer | Tools |
|---|---|
| Smart contracts | Solidity, Hardhat, Zama FHEVM / fhevmjs |
| Frontend | Next.js 15, TypeScript, wagmi v2, viem, RainbowKit, ethers.js |
| FHE | Zama relayer SDK, fhevmjs |
| Styling | Tailwind CSS, Cabinet Grotesk |

---

## Running Locally

```bash
git clone <repo>
cd packages/nextjs
cp .env.example .env.local   # fill in values
pnpm install
pnpm dev
```

Open `http://localhost:3000`. Connect MetaMask on Sepolia, claim from the faucet, swap.

### Required environment variables

```
NEXT_PUBLIC_ALCHEMY_API_KEY=
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=
NEXT_PUBLIC_CUSDT_ADDRESS=0x401924f4bd976A0168eCa95253eAE61590e89115
NEXT_PUBLIC_CETH_ADDRESS=0x51aA0DA9A1100deb3f2B2B75dD4cc1b67A5590F4
NEXT_PUBLIC_POOL_ADDRESS=0x34ADB4dfc310dAF08982E10BA8162794A7521734
NEXT_PUBLIC_FAUCET_ADDRESS=0x53063D910e9Ebe4B112ceFCEB1a08A62A7cD2A9f
```

---

## Known Limitations

**Reserve stats don't update after addLiquidity.**
`reserveSnapshotA` and `reserveSnapshotB` are plaintext `uint64` values written only during `swap()`. The confidential token standard provides no plaintext `balanceOf` — all balance reads return encrypted `bytes32` handles. Reserve figures on the Liquidity Pools page reflect the state as of the last swap, not the last liquidity addition. This is a consequence of Zama FHEVM's confidential token design, not a frontend bug.

**LP share balances are encrypted.**
Each user's share is stored as an FHE ciphertext. The pool exposes `getShares(address) → bytes32` (an encrypted handle). Remove liquidity works on-chain, but the UI cannot display individual share amounts without the pool contract exposing a decryption path for the caller.

**FHE requires specific browser headers.**
The app sets `Cross-Origin-Opener-Policy: same-origin-allow-popups` and `Cross-Origin-Embedder-Policy: require-corp`. These are required for the SharedArrayBuffer support that FHE depends on. If FHE fails to initialize, the swap button will show an error message.

**Multiple wallet extensions can cause FHE init failure.**
Browser extensions that inject wallet providers fight over `window.ethereum` before the page loads. This can break the COOP/COEP environment the FHE SDK requires. Recommended: use a dedicated browser profile with one wallet extension. MetaMask on a clean profile works reliably.

**WalletConnect WebSocket errors on localhost.**
These appear in the console but are cosmetic — WalletConnect's relay attempts a live connection even in dev. Functionality is unaffected.

**Network: Zama relayer dependency.**
FHE balance decryption and swap encryption require a live connection to the Zama relayer at `relayer.testnet.zama.org`. If you see `ERR_NAME_NOT_RESOLVED` in the console, clear your browser DNS cache at `chrome://net-internals/#dns` and reload. The relayer URL can be overridden via the `NEXT_PUBLIC_RELAYER_URL` environment variable.
