"use client";

import { getContractEvents } from "viem/actions";

type ChunkedLogsParams = {
  publicClient: any;
  address: `0x${string}`;
  abi: any;
  eventName: string;
  fromBlock: bigint;
  toBlock: bigint;
  initialChunk?: bigint;
  minChunk?: bigint;
  maxRetries?: number;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry<T>(run: () => Promise<T>, retries: number): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await run();
    } catch (err) {
      lastErr = err;
      if (i < retries) {
        await sleep(250 * 2 ** i);
      }
    }
  }
  throw lastErr;
}

export async function fetchEventLogsChunked(params: ChunkedLogsParams): Promise<any[]> {
  const {
    publicClient,
    address,
    abi,
    eventName,
    fromBlock,
    toBlock,
    initialChunk = 2500n,
    minChunk = 250n,
    maxRetries = 2,
  } = params;

  const logs: any[] = [];
  let cursor = fromBlock;
  let chunk = initialChunk;

  while (cursor <= toBlock) {
    const upper = cursor + chunk - 1n <= toBlock ? cursor + chunk - 1n : toBlock;
    try {
      const chunkLogs = await fetchWithRetry(
        () =>
          getContractEvents(publicClient, {
            address,
            abi,
            eventName,
            fromBlock: cursor,
            toBlock: upper,
            strict: false,
          }),
        maxRetries,
      );
      logs.push(...(chunkLogs as any[]));
      cursor = upper + 1n;
      if (chunk < initialChunk) {
        chunk = chunk * 2n <= initialChunk ? chunk * 2n : initialChunk;
      }
    } catch {
      if (chunk > minChunk) {
        chunk = chunk / 2n < minChunk ? minChunk : chunk / 2n;
        continue;
      }
      // Skip an unstable range rather than failing the whole page.
      cursor = upper + 1n;
    }
  }

  return logs;
}

