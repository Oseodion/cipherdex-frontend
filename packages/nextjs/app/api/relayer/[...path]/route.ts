import { NextRequest, NextResponse } from "next/server";

/**
 * Same-origin proxy for the Zama relayer. Required when the app uses
 * Cross-Origin-Embedder-Policy: require-corp (SharedArrayBuffer / FHE):
 * direct browser fetches to relayer.testnet.zama.org often fail with "Failed to fetch"
 * unless the relayer sends Cross-Origin-Resource-Policy. Proxying avoids that.
 *
 * Upstream can be overridden for tests or if Zama changes the host.
 */
const UPSTREAM_BASE =
  (process.env.RELAYER_UPSTREAM_URL || "https://relayer.testnet.zama.org").replace(/\/$/, "");

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAllowedPath(path: string): boolean {
  return path.startsWith("v2/");
}

async function forward(req: NextRequest, pathSegments: string[]): Promise<Response> {
  const path = pathSegments.join("/");
  if (!path || !isAllowedPath(path)) {
    return NextResponse.json({ error: "Only /v2/* relayer paths are allowed." }, { status: 403 });
  }

  const target = `${UPSTREAM_BASE}/${path}${req.nextUrl.search}`;
  const method = req.method.toUpperCase();
  const contentType = req.headers.get("content-type");

  const headers = new Headers();
  if (contentType) {
    headers.set("content-type", contentType);
  }

  let body: ArrayBuffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await req.arrayBuffer();
  }

  const upstream = await fetch(target, {
    method,
    headers,
    body: body && body.byteLength > 0 ? body : undefined,
  });

  const out = new Headers(upstream.headers);
  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return forward(request, path ?? []);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return forward(req, path ?? []);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
