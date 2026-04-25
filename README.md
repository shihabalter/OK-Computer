# OK Computer

OK Computer is a standard Next.js demo for paid machine access. It protects
premium articles and API routes with HTTP 402 using Circle x402 batching, lets
AI agents pay USDC nanopayments on Arc Testnet through Circle Gateway, and can
optionally record successful unlocks to an Arc `AccessLedger` contract.

## What changed for deployment

- Standard Next.js commands: `next dev`, `next build`, `next start`
- No custom Express server
- No local SQLite database or mounted disk required
- Dashboard events are in memory and reset when the app instance restarts
- Arc ledger proof is optional

## Requirements

- Node.js 22+ and npm
- `SELLER_ADDRESS` for paid-resource challenges
- Arc Testnet USDC only when you run live payment demos

Optional:

- `AGENT_PRIVATE_KEYS` for the CLI crawler demo
- `ACCESS_LEDGER_ADDRESS` and `LEDGER_WRITER_PRIVATE_KEY` for on-chain proof

## Setup

```bash
npm install
cp .env.example .env
```

Minimum `.env`:

```bash
SELLER_ADDRESS=0xYourSellerWallet
```

Full demo `.env`:

```bash
SELLER_ADDRESS=0xYourSellerWallet
AGENT_PRIVATE_KEYS=0xYourFundedGatewayBuyerPrivateKey
ACCESS_LEDGER_ADDRESS=0xYourDeployedAccessLedger
LEDGER_WRITER_PRIVATE_KEY=0xYourFundedArcLedgerWriterPrivateKey
ARC_RPC_URL=https://rpc.testnet.arc.network
NEXT_PUBLIC_ARCSCAN_TX_BASE=https://testnet.arcscan.app/tx/
```

## Run locally

```bash
npm run dev
```

Open:

- Dashboard: http://localhost:3000
- Browser demo: http://localhost:3000/demo
- Health check: http://localhost:3000/health

## Deploy

This is now a normal Next.js app. Use any host that supports Next.js with the
Node.js runtime, such as Vercel, Railway, Render, Fly.io, or a VPS.

Typical settings:

```txt
Build command: npm ci && npm run build
Start command: npm run start
Node version: 22+
Health check: /health
```

Set the same environment variables in your host dashboard. For the smallest
deploy, only `SELLER_ADDRESS` is required.

The dashboard event feed is demo-only in-memory state. It is simplest on a
single running app instance; add a hosted database or KV later if you need
durable analytics across restarts or scaled serverless instances.

## Run the live crawler demo

First check the chain, env, and Gateway balance:

```bash
npm run demo:preflight
```

Reset the dashboard:

```bash
npm run demo:reset
```

Run the 60-payment crawler:

```bash
npm run demo:60
```

Against a deployed app:

```bash
DEMO_BASE_URL=https://your-app.example.com npm run demo:preflight
DEMO_BASE_URL=https://your-app.example.com npm run demo:reset
DEMO_BASE_URL=https://your-app.example.com npm run demo:60
```
