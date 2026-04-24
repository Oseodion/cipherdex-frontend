# CipherDEX

Confidential AMM built with [Zama FHEVM](https://www.zama.ai/). CipherDEX encrypts swap inputs in the browser, executes AMM logic with FHE-enabled contracts, and keeps trade amounts private through the flow.

Built for the Zama developer competition.

## Links

- Live app: [https://cipherdex.vercel.app](https://cipherdex.vercel.app/)
- Frontend (this repo): [Oseodion/cipherdex-frontend](https://github.com/Oseodion/cipherdex-frontend)
- Smart contracts: [Oseodion/cipherdex-contracts](https://github.com/Oseodion/cipherdex-contracts)

## What CipherDEX demonstrates

- Confidential swaps on Sepolia using Zama FHE tooling
- Encrypted liquidity add/remove flows
- In-app reveal flow for encrypted balances
- On-chain activity views (transactions, performance, audit framing)
- Desktop-optimized demo UX with stable loading and event refresh behavior

## Architecture at a glance

```text
User input amount
  -> FHE encrypt in browser
  -> encrypted handle + proof submitted to pool
  -> pool executes AMM logic on encrypted values
  -> balances/handles update on-chain
  -> user can decrypt permitted results in app
```

## Deployed contracts (Sepolia)

- cUSDT: `0x401924f4bd976A0168eCa95253eAE61590e89115`
- cETH: `0x51aA0DA9A1100deb3f2B2B75dD4cc1b67A5590F4`
- CipherDEXPool: `0x34ADB4dfc310dAF08982E10BA8162794A7521734`
- CipherDEXFaucet: `0x53063D910e9Ebe4B112ceFCEB1a08A62A7cD2A9f`

Sepolia explorer: [https://sepolia.etherscan.io](https://sepolia.etherscan.io)

## Tech stack

- Contracts: Solidity, Hardhat, Zama FHEVM
- Frontend: Next.js, TypeScript, wagmi, viem, RainbowKit, ethers
- FHE integration: Zama relayer SDK and fhevm tooling

## Run locally

```bash
git clone https://github.com/Oseodion/cipherdex-frontend.git
cd cipherdex-frontend
pnpm install
cp packages/nextjs/.env.example packages/nextjs/.env.local
pnpm start
```

Open `http://localhost:3000`, connect a Sepolia wallet, claim faucet tokens, and execute swap/liquidity flows.

## Environment variables

Set in `packages/nextjs/.env.local`:

```env
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=
NEXT_PUBLIC_ALCHEMY_API_KEY=
NEXT_PUBLIC_SEPOLIA_RPC_URL=
NEXT_PUBLIC_CUSDT_ADDRESS=0x401924f4bd976A0168eCa95253eAE61590e89115
NEXT_PUBLIC_CETH_ADDRESS=0x51aA0DA9A1100deb3f2B2B75dD4cc1b67A5590F4
NEXT_PUBLIC_POOL_ADDRESS=0x34ADB4dfc310dAF08982E10BA8162794A7521734
NEXT_PUBLIC_FAUCET_ADDRESS=0x53063D910e9Ebe4B112ceFCEB1a08A62A7cD2A9f
```

Optional:

- `NEXT_PUBLIC_RELAYER_URL` for custom relayer endpoint
- `NEXT_PUBLIC_USE_RELAYER_PROXY=true` to route relayer calls through `/api/relayer`
- `NEXT_PUBLIC_PREFER_ALCHEMY_RPC=true` only if you intentionally want Alchemy as primary RPC

## Demo checklist (desktop)

1. Connect wallet on Sepolia
2. Reveal balances after stats load
3. Execute a swap and confirm in wallet
4. Verify update in Recent Trades and Transactions
5. Open Performance/Audit views to verify stats rendering

## Operational notes

- CipherDEX includes RPC fallback handling for smoother Sepolia demos.
- For deterministic testing, use a dedicated Sepolia RPC in `NEXT_PUBLIC_SEPOLIA_RPC_URL`.
- If multiple wallet extensions are installed, provider injection order can vary by session.

## Security note

- Do not commit `.env.local`.
- Use test-only keys for local development.
- Rotate any key that has been exposed in screenshots or shared files.
