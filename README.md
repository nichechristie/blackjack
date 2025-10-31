## Farcaster Backend (Neynar)

Backend starter for a Farcaster app using Neynar's Node.js SDK.

### Prerequisites
- Node.js 18+ and npm
- Neynar API key

### Setup
1. Copy environment template and fill values:
   ```bash
   cp env.example .env
   ```
2. Install dependencies (latest Neynar SDK):
   ```bash
   npm install
   ```

### Scripts
- `npm run dev`: Start Fastify in watch mode
- `npm run build`: Type-check and build to `dist/`
- `npm start`: Run built server

### Environment
- `NEYNAR_API_KEY`: Your Neynar API key
- `PORT` (optional): Default `3000`

### API
- `GET /health` → `{ ok: true }`
- `GET /users/:fid` → Returns Neynar user for the given FID, or 404
- `GET /casts/search?q=...&limit=...&cursor=...` → Search casts by keyword (Neynar REST)
- `GET /casts/by-user/:fid?limit=...&cursor=...` → Casts by user FID (Neynar REST)

#### Blackjack
- `POST /blackjack/start` body: `{ fid?: number, bet?: number }` → starts a game
- `POST /blackjack/hit` body: `{ gameId: string }` → draw a card
- `POST /blackjack/stand` body: `{ gameId: string }` → dealer plays to completion
- `GET /blackjack/state/:gameId` → current game state

Example usage:
```bash
curl -X POST http://localhost:3000/blackjack/start \
  -H 'content-type: application/json' \
  -d '{"fid":19960, "bet":10}'

curl -X POST http://localhost:3000/blackjack/hit \
  -H 'content-type: application/json' \
  -d '{"gameId":"<id from start>"}'

curl -X POST http://localhost:3000/blackjack/stand \
  -H 'content-type: application/json' \
  -d '{"gameId":"<id from start>"}'

curl http://localhost:3000/blackjack/state/<id from start>
```

### Token (NICHE, symbol NCH)
- Off-chain balances with on-chain withdrawals (mint on Base)
- Link wallet, grant rewards, faucet, withdraw

Env required for withdraw:
- `BASE_RPC_URL`, `PRIVATE_KEY`, `TOKEN_ADDRESS`

Endpoints:
- `POST /wallet/link` body: `{ fid: number, address: string }`
- `GET /balance/:fid` → `{ fid, balance }`
- `POST /rewards/grant` body: `{ fid: number, amount: number }`
- `POST /faucet/claim` body: `{ fid: number, amount: number }` (daily cap)
- `POST /withdraw` body: `{ fid: number, amount: number }` → mints on-chain to linked wallet

Example:
```bash
curl -X POST http://localhost:3000/wallet/link \
  -H 'content-type: application/json' \
  -d '{"fid":19960, "address":"0xabc..."}'

curl http://localhost:3000/balance/19960

curl -X POST http://localhost:3000/rewards/grant \
  -H 'content-type: application/json' \
  -d '{"fid":19960, "amount":50}'

curl -X POST http://localhost:3000/withdraw \
  -H 'content-type: application/json' \
  -d '{"fid":19960, "amount":25}'

### Links
- SDK: `@neynar/nodejs-sdk`
- Neynar OpenAPI: `https://github.com/neynarxyz/OAS`

### Assets (Token Logo)
- Place your coin image at `public/niche.png` (PNG recommended, ~512x512).
- It will be served at `http://localhost:3000/assets/niche.png` during dev.
- `GET /token/metadata` returns `{ name, symbol, logoURI }` for frontends/lists.
- Optional: upload to IPFS with Web3.Storage:
  - Set `WEB3_STORAGE_TOKEN` in env
  - `POST /token/upload-logo` (body optional: `{ "filename": "niche.png" }`)
  - Response includes `{ cid, gateway, suggestedLogoURI }`
  - Put `PUBLIC_LOGO_URI` in env with the `suggestedLogoURI` to serve in `/token/metadata`

