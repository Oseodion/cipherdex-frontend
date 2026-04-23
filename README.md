# CipherDEX

**Confidential AMM on [Zama FHEVM](https://www.zama.ai/)** - swap amounts are encrypted in the browser before anything hits the chain. Mempool observers see ciphertext, not trade size

Built for the **Zama Developer Program Mainnet Season 2 - Builder Track**

### Quick links

| | |
|:---|:---|
| **Live app** | [https://cipherdex.vercel.app](https://cipherdex.vercel.app/) |
| **Frontend (this repo)** | [Oseodion/cipherdex-frontend](https://github.com/Oseodion/cipherdex-frontend) |
| **Smart contracts** | [Oseodion/cipherdex-contracts](https://github.com/Oseodion/cipherdex-contracts) |

This repository is the **Next.js frontend**. Solidity (**CipherDEXPool**, **ConfidentialToken**, **faucet**) lives in [cipherdex-contracts](https://github.com/Oseodion/cipherdex-contracts) and uses `@fhevm/solidity`. Together: FHE on-chain (encrypted reserves, swaps, liquidity) and in the browser (encrypt inputs, decrypt balances via ACL).

---

## Contents

1. [Problem and approach](#problem-and-approach)
2. [Architecture](#architecture)
3. [Features](#features)
4. [Deployed contracts (Sepolia)](#deployed-contracts-sepolia)
5. [Tech stack](#tech-stack)
6. [Run locally](#run-locally)
7. [Environment variables](#environment-variables)
8. [Known limitations](#known-limitations)

---

## Problem and approach

**Problem.** On typical DEXs, swaps sit in the public mempool before confirmation. Searchers read amounts and can front-run; users get worse prices.

**Approach.** CipherDEX encrypts the swap amount client-side with Zama’s FHE stack, then submits ciphertext and proofs. The pool runs constant-product math on encrypted values. The cleartext size is not exposed in calldata or public logs in the same way as a normal swap.

**Flow:** Encrypt → submit → settle. The amount is not plaintext on-chain in the usual sense.

---

## Architecture

```
User enters amount
       ↓
FHE SDK encrypts in browser (Zama relayer issues input proof)
       ↓
Encrypted handle + proof → CipherDEXPool.swap()
       ↓
Pool: AMM math on ciphertext (FHE ops)
       ↓
Output amount available to recipient via ACL-gated decryption
       ↓
Balances updated — no public plaintext amount in logs
```

The pool uses confidential ERC-20s (**cUSDT**, **cETH**). Balances and LP shares are FHE ciphertexts (opaque handles). Observers do not learn trade size or direction from those handles alone.

---

## Features

| Area | What you get |
|:---|:---|
| **Swaps** | Encrypted amounts; MEV-resistant by design vs plaintext mempool amounts |
| **Liquidity** | Add / remove with encrypted inputs, on-chain |
| **Faucet** | Claim test **cUSDT** / **cETH** on Sepolia (cooldown) |
| **Portfolio** | Reveal encrypted balances via in-browser FHE decrypt |
| **Transactions** | **Swap**, **LiquidityAdded**, **LiquidityRemoved** events; amounts shown as encrypted / obscured |
| **Performance** | 28-day activity heatmap from on-chain events |
| **Audit view** | Privacy model + encrypted activity framing |
| **Mobile policy** | Mobile is view-only by design for demo reliability; wallet actions are desktop-first |

---

## Deployed contracts (Sepolia)

| Contract | Address |
|:---|:---|
| cUSDT | `0x401924f4bd976A0168eCa95253eAE61590e89115` |
| cETH | `0x51aA0DA9A1100deb3f2B2B75dD4cc1b67A5590F4` |
| CipherDEXPool | `0x34ADB4dfc310dAF08982E10BA8162794A7521734` |
| CipherDEXFaucet | `0x53063D910e9Ebe4B112ceFCEB1a08A62A7cD2A9f` |

[Etherscan (Sepolia)](https://sepolia.etherscan.io/) — paste an address to verify and interact.

---

## Tech stack

| Layer | Stack |
|:---|:---|
| Contracts | Solidity, Hardhat, Zama FHEVM / fhevmjs |
| App | Next.js 15, TypeScript, wagmi v2, viem, RainbowKit, ethers.js |
| FHE | Zama relayer SDK, fhevmjs |
| UI | Tailwind CSS, Cabinet Grotesk |

---

## Run locally

```bash
git clone https://github.com/Oseodion/cipherdex-frontend.git
cd cipherdex-frontend
pnpm install
cp packages/nextjs/.env.example packages/nextjs/.env.local   # then edit
pnpm start
```

Open [http://localhost:3000](http://localhost:3000), connect a wallet on **Sepolia**, use the faucet, then swap.
For the full wallet flow, use a desktop browser (mobile is intentionally view-only).

**Contracts:** clone [cipherdex-contracts](https://github.com/Oseodion/cipherdex-contracts) separately (Hardhat; deploy scripts align with the addresses above).

---

## Environment variables

**Required** (in `packages/nextjs/.env.local`):

```env
NEXT_PUBLIC_ALCHEMY_API_KEY=
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=
NEXT_PUBLIC_CUSDT_ADDRESS=0x401924f4bd976A0168eCa95253eAE61590e89115
NEXT_PUBLIC_CETH_ADDRESS=0x51aA0DA9A1100deb3f2B2B75dD4cc1b67A5590F4
NEXT_PUBLIC_POOL_ADDRESS=0x34ADB4dfc310dAF08982E10BA8162794A7521734
NEXT_PUBLIC_FAUCET_ADDRESS=0x53063D910e9Ebe4B112ceFCEB1a08A62A7cD2A9f
```

**Optional**

| Variable | Purpose |
|:---|:---|
| `NEXT_PUBLIC_RELAYER_URL` | Override default Zama testnet relayer URL |
| `NEXT_PUBLIC_USE_RELAYER_PROXY=true` | Send relayer traffic via this app’s `/api/relayer` when the browser cannot call Zama directly (e.g. strict COEP). Omit for direct relayer (common for decrypt) |
| `NEXT_PUBLIC_SEPOLIA_RPC_URL` | Optional explicit Sepolia RPC override (if omitted, app uses Alchemy + public fallback RPCs) |

---

## Known limitations

### Reserve snapshots vs encrypted liquidity

`reserveSnapshotA` / `reserveSnapshotB` are plaintext **uint64** divisors for AMM math. They are updated in `initializePool`, owner-only `addLiquidityPlaintext`, and inside `swap()`. Encrypted **`addLiquidity`** / **`removeLiquidity`** update ciphertext reserves and shares but **do not** update these snapshots, so UI “reserve” figures can lag until a later `swap()` (or owner plaintext add). Not a frontend bug — contract tradeoff. Confidential tokens also lack a plaintext pool TVL `balanceOf`; the UI uses snapshots as a rough signal.

### LP shares

Per-user shares are FHE ciphertexts. `getShares(address)` returns an **euint64** handle (`bytes32`). Remove-liquidity works on-chain; showing a numeric share in the UI would need a decryption path for that handle.

### Browser: COOP / COEP / SharedArrayBuffer

The app sets **Cross-Origin-Opener-Policy** and **Cross-Origin-Embedder-Policy** (see `next.config.ts`) so **SharedArrayBuffer** works for the FHE runtime. If FHE fails to init, the swap flow surfaces an error.

### Wallets & extensions

CipherDEX can work even with multiple wallet extensions installed, but provider injection order can vary between sessions and browsers.

**Recommended for deterministic demos:**

- Prefer one wallet extension per browser profile (for example, only MetaMask in that profile).
- If you need multiple wallets, separate profiles reduce provider conflicts.
- For the most reliable FHE init and signing prompts, run CipherDEX in a clean desktop profile.

### Mobile support policy

Mobile is intentionally run in **view-only mode** in this frontend build. Users can browse pages and visuals, but wallet-connected actions (connect/decrypt/swap/faucet/liquidity) are desktop-first for reliability in judging/demo conditions.

### WalletConnect on localhost

WalletConnect relay WebSocket logs can appear in some local/browser environments. If you are using injected desktop wallets, these logs are often non-blocking.

### Zama relayer

Encrypt/decrypt paths need reachability to the Zama testnet relayer (default `relayer.testnet.zama.org`). DNS issues → try [chrome://net-internals/#dns](chrome://net-internals/#dns) cache clear, or set `NEXT_PUBLIC_RELAYER_URL`.
