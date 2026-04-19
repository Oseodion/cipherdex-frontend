/**
 * One-time pool initialization script.
 *
 * Run ONCE after deployment:
 *   npx ts-node scripts/initializePool.ts
 *
 * Requires .env (or .env.local) in the repo root with:
 *   DEPLOYER_PRIVATE_KEY=0x...
 *   ALCHEMY_API_KEY=...   (or set RPC_URL directly)
 *
 * Contract addresses are read from packages/nextjs/.env.local
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load env from repo root first, then nextjs package (nextjs takes precedence)
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../packages/nextjs/.env.local") });

// ── Config ──────────────────────────────────────────────────────────────────
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY not set in env");

const RPC_URL =
  process.env.RPC_URL ??
  `https://eth-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY ?? process.env.ALCHEMY_API_KEY}`;

const CONTRACTS = {
  cUSDT:  process.env.NEXT_PUBLIC_CUSDT_ADDRESS  ?? "0x401924f4bd976A0168eCa95253eAE61590e89115",
  cETH:   process.env.NEXT_PUBLIC_CETH_ADDRESS   ?? "0x51aA0DA9A1100deb3f2B2B75dD4cc1b67A5590F4",
  pool:   process.env.NEXT_PUBLIC_POOL_ADDRESS   ?? "0x34ADB4dfc310dAF08982E10BA8162794A7521734",
  faucet: process.env.NEXT_PUBLIC_FAUCET_ADDRESS ?? "0x53063D910e9Ebe4B112ceFCEB1a08A62A7cD2A9f",
};

// Initial reserves: 10,000 cUSDT (6 dec) and 5 cETH (9 dec) → 2,000 cUSDT/cETH
const INIT_USDT = 10_000n * 10n ** 6n;  // 10,000 cUSDT
const INIT_ETH  =      5n * 10n ** 9n;  // 5 cETH

// ── Load ABIs ────────────────────────────────────────────────────────────────
const abiPath = (name: string) =>
  path.resolve(__dirname, `../packages/nextjs/contracts/${name}.json`);

const poolAbi    = JSON.parse(fs.readFileSync(abiPath("CipherDEXPool"), "utf8")).abi;
const tokenAbi   = JSON.parse(fs.readFileSync(abiPath("ConfidentialToken"), "utf8")).abi;
const faucetAbi  = JSON.parse(fs.readFileSync(abiPath("CipherDEXFaucet"), "utf8")).abi;

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const deployer = new ethers.Wallet(PRIVATE_KEY!, provider);

  console.log(`\nDeployer: ${deployer.address}`);
  const balance = await provider.getBalance(deployer.address);
  console.log(`ETH balance: ${ethers.formatEther(balance)} ETH`);
  if (balance < ethers.parseEther("0.01"))
    console.warn("⚠  Low ETH balance — may not cover gas");

  const pool   = new ethers.Contract(CONTRACTS.pool,   poolAbi,   deployer);
  const cUSDT  = new ethers.Contract(CONTRACTS.cUSDT,  tokenAbi,  deployer);
  const cETH   = new ethers.Contract(CONTRACTS.cETH,   tokenAbi,  deployer);
  const faucet = new ethers.Contract(CONTRACTS.faucet, faucetAbi, deployer);

  // 1. Check if already initialized
  const alreadyInit: boolean = await pool.initialized();
  if (alreadyInit) {
    console.log("\n✅ Pool is already initialized — nothing to do.");
    return;
  }

  // 2. Claim tokens from faucet (deployer needs cUSDT + cETH)
  console.log("\n[1/4] Claiming test tokens from faucet…");
  try {
    const claimTx = await faucet.claim({ gasLimit: 500_000n });
    await claimTx.wait();
    console.log(`     ✓ Claimed  (tx: ${claimTx.hash})`);
  } catch (err: any) {
    // Cooldown error is fine — deployer already has tokens
    if (err?.message?.includes("CooldownNotExpired") || err?.message?.includes("cooldown")) {
      console.log("     ⚠  Faucet cooldown active — using existing balance");
    } else {
      throw err;
    }
  }

  const futureTs = BigInt(Math.floor(Date.now() / 1000) + 3600);

  // 3. Approve pool as operator on cUSDT
  console.log("\n[2/4] Setting cUSDT operator…");
  const opA = await cUSDT.setOperator(CONTRACTS.pool, futureTs, { gasLimit: 200_000n });
  await opA.wait();
  console.log(`     ✓ cUSDT operator set  (tx: ${opA.hash})`);

  // 4. Approve pool as operator on cETH
  console.log("\n[3/4] Setting cETH operator…");
  const opB = await cETH.setOperator(CONTRACTS.pool, futureTs, { gasLimit: 200_000n });
  await opB.wait();
  console.log(`     ✓ cETH operator set   (tx: ${opB.hash})`);

  // 5. Initialize pool — plaintext amounts (no FHE needed for initializePool)
  console.log("\n[4/4] Calling initializePool…");
  console.log(`     Seeding ${ethers.formatUnits(INIT_USDT, 6)} cUSDT + ${ethers.formatUnits(INIT_ETH, 9)} cETH`);
  console.log(`     Starting rate: 1 cETH = ${Number(INIT_USDT) / Number(INIT_ETH) * 1e3} cUSDT`);
  const initTx = await pool.initializePool(INIT_USDT, INIT_ETH, { gasLimit: 10_000_000n });
  await initTx.wait();
  console.log(`     ✓ Pool initialized!   (tx: ${initTx.hash})`);
  console.log(`\n     Etherscan: https://sepolia.etherscan.io/tx/${initTx.hash}`);

  console.log("\n🎉 Done — CipherDEX pool is live. Users can now swap.\n");
}

main().catch(err => {
  console.error("\n❌ Error:", err.message ?? err);
  process.exit(1);
});
