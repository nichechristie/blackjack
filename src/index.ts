import fastify from "fastify";
import { config as loadEnv } from "dotenv";
import { z } from "zod";
import { neynarClient } from "./neynarClient";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import fs from "node:fs/promises";
import { blackjackStore } from "./blackjack/game";
import { offchainStore } from "./store";
import { mintTo, getTokenContract } from "./token/contract";

loadEnv();

const server = fastify({ logger: true });

// Static assets (for token logo, etc.)
await server.register(fastifyStatic, {
  root: path.join(process.cwd(), "public"),
  prefix: "/assets/",
  decorateReply: false,
});

server.get("/health", async () => {
  return { ok: true };
});

server.get("/users/:fid", async (request, reply) => {
  const paramsSchema = z.object({ fid: z.string().regex(/^\d+$/) });
  const parse = paramsSchema.safeParse(request.params as unknown);
  if (!parse.success) {
    reply.code(400);
    return { error: "Invalid fid" };
  }
  const fid = Number(parse.data.fid);
  try {
    const users = await neynarClient.fetchBulkUsers({ fids: [fid] });
    const user = users.users?.[0] ?? null;
    if (!user) {
      reply.code(404);
      return { error: "User not found" };
    }
    return user;
  } catch (err) {
    request.log.error({ err }, "Failed to fetch user from Neynar");
    reply.code(502);
    return { error: "Upstream error" };
  }
});

// Blackjack: start a new game
server.post("/blackjack/start", async (request, reply) => {
  const bodySchema = z.object({
    fid: z.number().int().positive().optional(),
    bet: z.number().int().min(0).optional(),
  });
  const parse = bodySchema.safeParse((request as any).body);
  if (!parse.success) {
    reply.code(400);
    return { error: "Invalid body" };
  }
  const { fid, bet } = parse.data;
  const game = blackjackStore.createGame(fid, bet);
  return game;
});

// Blackjack: hit
server.post("/blackjack/hit", async (request, reply) => {
  const bodySchema = z.object({ gameId: z.string().min(1) });
  const parse = bodySchema.safeParse((request as any).body);
  if (!parse.success) {
    reply.code(400);
    return { error: "Invalid body" };
  }
  const { gameId } = parse.data;
  const game = blackjackStore.hit(gameId);
  if (!game) {
    reply.code(404);
    return { error: "Game not found" };
  }
  return game;
});

// Token metadata (name, symbol, logo URL for frontends/token lists)
server.get("/token/metadata", async () => {
  const baseUrl = process.env.PUBLIC_BASE_URL ?? "http://localhost:" + (process.env.PORT ?? 3000);
  return {
    name: "NICHE",
    symbol: "NCH",
    logoURI: process.env.PUBLIC_LOGO_URI ?? `${baseUrl}/assets/niche.png`,
  };
});

// Upload token logo to IPFS via web3.storage
server.post("/token/upload-logo", async (request, reply) => {
  const bodySchema = z.object({ filename: z.string().optional() });
  const parse = bodySchema.safeParse((request as any).body ?? {});
  if (!parse.success) {
    reply.code(400);
    return { error: "Invalid body" };
  }
  const token = process.env.WEB3_STORAGE_TOKEN;
  if (!token) {
    reply.code(501);
    return { error: "WEB3_STORAGE_TOKEN not configured" };
  }
  const filename = parse.data.filename ?? "niche.png";
  const filePath = path.join(process.cwd(), "public", filename);
  try {
    const data = await fs.readFile(filePath);
    const res = await fetch("https://api.web3.storage/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "X-NAME": filename,
      },
      body: data,
    });
    if (!res.ok) {
      const text = await res.text();
      request.log.error({ status: res.status, text }, "web3.storage upload failed");
      reply.code(502);
      return { error: "Upload failed" };
    }
    const json = (await res.json()) as { cid: string };
    const cid = json.cid;
    const gateway = `https://w3s.link/ipfs/${cid}`;
    return { cid, gateway, suggestedLogoURI: `${gateway}` };
  } catch (err) {
    request.log.error({ err }, "Upload error");
    reply.code(500);
    return { error: "Upload error" };
  }
});

// Blackjack: stand
server.post("/blackjack/stand", async (request, reply) => {
  const bodySchema = z.object({ gameId: z.string().min(1) });
  const parse = bodySchema.safeParse((request as any).body);
  if (!parse.success) {
    reply.code(400);
    return { error: "Invalid body" };
  }
  const { gameId } = parse.data;
  const game = blackjackStore.stand(gameId);
  if (!game) {
    reply.code(404);
    return { error: "Game not found" };
  }
  return game;
});

// Blackjack: get current state
server.get("/blackjack/state/:gameId", async (request, reply) => {
  const paramsSchema = z.object({ gameId: z.string().min(1) });
  const parse = paramsSchema.safeParse(request.params as unknown);
  if (!parse.success) {
    reply.code(400);
    return { error: "Invalid params" };
  }
  const { gameId } = parse.data;
  const game = blackjackStore.getGame(gameId);
  if (!game) {
    reply.code(404);
    return { error: "Game not found" };
  }
  return game;
});

// Token: link wallet
server.post("/wallet/link", async (request, reply) => {
  const bodySchema = z.object({ fid: z.number().int().positive(), address: z.string().min(1) });
  const parse = bodySchema.safeParse((request as any).body);
  if (!parse.success) {
    reply.code(400);
    return { error: "Invalid body" };
  }
  const { fid, address } = parse.data;
  offchainStore.linkWallet(fid, address);
  return { ok: true };
});

// Token: get balance by fid
server.get("/balance/:fid", async (request, reply) => {
  const paramsSchema = z.object({ fid: z.string().regex(/^\d+$/) });
  const parse = paramsSchema.safeParse(request.params as unknown);
  if (!parse.success) {
    reply.code(400);
    return { error: "Invalid params" };
  }
  const fid = Number(parse.data.fid);
  const balance = offchainStore.getBalance(fid);
  return { fid, balance };
});

// Token: grant rewards (house action)
server.post("/rewards/grant", async (request, reply) => {
  const bodySchema = z.object({ fid: z.number().int().positive(), amount: z.number().positive() });
  const parse = bodySchema.safeParse((request as any).body);
  if (!parse.success) {
    reply.code(400);
    return { error: "Invalid body" };
  }
  const { fid, amount } = parse.data;
  const next = offchainStore.addBalance(fid, amount);
  return { fid, balance: next };
});

// Token: faucet claim (daily cap)
server.post("/faucet/claim", async (request, reply) => {
  const bodySchema = z.object({ fid: z.number().int().positive(), amount: z.number().positive().max(100) });
  const parse = bodySchema.safeParse((request as any).body);
  if (!parse.success) {
    reply.code(400);
    return { error: "Invalid body" };
  }
  const { fid, amount } = parse.data;
  const dailyCap = Number(process.env.FAUCET_DAILY_CAP ?? 25);
  if (!offchainStore.canClaimFaucet(fid, dailyCap, amount)) {
    reply.code(429);
    return { error: "Faucet daily cap reached" };
  }
  offchainStore.recordFaucet(fid, amount);
  const next = offchainStore.addBalance(fid, amount);
  return { fid, balance: next };
});

// Token: withdraw off-chain balance to on-chain by minting
server.post("/withdraw", async (request, reply) => {
  const bodySchema = z.object({ fid: z.number().int().positive(), amount: z.number().positive() });
  const parse = bodySchema.safeParse((request as any).body);
  if (!parse.success) {
    reply.code(400);
    return { error: "Invalid body" };
  }
  const { fid, amount } = parse.data;
  const address = offchainStore.getAddress(fid);
  if (!address) {
    reply.code(400);
    return { error: "FID not linked to a wallet" };
  }
  const configured = getTokenContract();
  if (!configured) {
    reply.code(501);
    return { error: "Token contract not configured" };
  }
  try {
    offchainStore.subtractBalance(fid, amount);
    const { hash } = await mintTo(address, amount);
    return { ok: true, txHash: hash };
  } catch (err) {
    request.log.error({ err }, "Withdraw/mint failed");
    reply.code(502);
    return { error: "Withdraw failed" };
  }
});

// Search casts by keyword
server.get("/casts/search", async (request, reply) => {
  const querySchema = z.object({
    q: z.string().min(1),
    limit: z.string().regex(/^\d+$/).transform(Number).optional(),
    cursor: z.string().optional(),
  });
  const parse = querySchema.safeParse(request.query as unknown);
  if (!parse.success) {
    reply.code(400);
    return { error: "Invalid query params" };
  }
  const { q, limit, cursor } = parse.data;
  try {
    const url = new URL("https://api.neynar.com/v1/search/casts");
    url.searchParams.set("q", q);
    if (limit) url.searchParams.set("limit", String(limit));
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.NEYNAR_API_KEY}` },
    });
    if (!res.ok) {
      const text = await res.text();
      request.log.error({ status: res.status, text }, "Neynar search error");
      reply.code(502);
      return { error: "Upstream error" };
    }
    const data = await res.json();
    return data;
  } catch (err) {
    request.log.error({ err }, "Failed to search casts");
    reply.code(502);
    return { error: "Upstream error" };
  }
});

// Fetch casts authored by a specific user (by FID)
server.get("/casts/by-user/:fid", async (request, reply) => {
  const paramsSchema = z.object({ fid: z.string().regex(/^\d+$/) });
  const querySchema = z.object({
    limit: z.string().regex(/^\d+$/).transform(Number).optional(),
    cursor: z.string().optional(),
  });
  const params = paramsSchema.safeParse(request.params as unknown);
  const query = querySchema.safeParse(request.query as unknown);
  if (!params.success || !query.success) {
    reply.code(400);
    return { error: "Invalid params" };
  }
  const fid = Number(params.data.fid);
  const { limit, cursor } = query.data;
  try {
    const url = new URL("https://api.neynar.com/v2/farcaster/user/casts");
    url.searchParams.set("fid", String(fid));
    if (limit) url.searchParams.set("limit", String(limit));
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.NEYNAR_API_KEY}` },
    });
    if (!res.ok) {
      const text = await res.text();
      request.log.error({ status: res.status, text }, "Neynar user casts error");
      reply.code(502);
      return { error: "Upstream error" };
    }
    const data = await res.json();
    return data;
  } catch (err) {
    request.log.error({ err }, "Failed to fetch user casts");
    reply.code(502);
    return { error: "Upstream error" };
  }
});

const port = Number(process.env.PORT ?? 3000);
const host = "0.0.0.0";

server
  .listen({ port, host })
  .then(() => {
    server.log.info({ port }, "Server started");
  })
  .catch((err) => {
    server.log.error(err, "Failed to start server");
    process.exit(1);
  });

