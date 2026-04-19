import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { getContractEvents } from 'viem/actions';
import { readFile } from 'fs/promises';

const client = createPublicClient({ transport: http('https://sepolia.drpc.org/'), chain: sepolia });
const address = '0x34ADB4dfc310dAF08982E10BA8162794A7521734';
const abiJson = JSON.parse(await readFile(new URL('./contracts/CipherDEXPool.json', import.meta.url), 'utf8'));
const abi = abiJson.abi;
const latest = await client.getBlockNumber();
console.log('latest', latest.toString());
const fromBlock = latest > 220000n ? latest - 220000n : 0n;
console.log('fromBlock', fromBlock.toString());
const maxRange = 10000n;
let scanFrom = fromBlock;
const logs = [];
while (scanFrom <= latest) {
  const scanTo = scanFrom + maxRange - 1n <= latest ? scanFrom + maxRange - 1n : latest;
  console.log('chunk', scanFrom.toString(), scanTo.toString());
  const chunkLogs = await getContractEvents(client, {
    address,
    abi,
    eventName: 'Swap',
    fromBlock: scanFrom,
    toBlock: scanTo,
    strict: false,
  });
  logs.push(...chunkLogs);
  scanFrom = scanTo + 1n;
}
console.log('count', logs.length);
if (logs.length) console.log(logs.slice(0,5).map(l => ({ blockNumber: l.blockNumber?.toString(), args: l.args })));
