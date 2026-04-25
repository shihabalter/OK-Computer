# OK Computer

OK Computer is a Next.js demo for paid machine access. It protects articles and API routes with HTTP 402 using Circle x402 batching, lets AI agents pay USDC nanopayments on Arc Testnet through Circle Gateway, and records successful unlocks to an Arc `AccessLedger` contract.

The app includes:

- A live dashboard at `/`
- A browser demo at `/demo`
- Protected premium article and API routes
- Sub-cent USDC nanopayments for automated access
- CLI scripts for a 60-payment agent crawler demo

## Requirements

- Node.js 22+ and npm
- Arc Testnet USDC for the demo wallets
- A deployed `contracts/AccessLedger.sol` contract on Arc Testnet
- Circle Gateway funded buyer keys for the CLI demo

## Setup

Install dependencies:

```bash
npm install
```

Create your env file:

```bash
cp .env.example .env
```

Fill in:

```bash
SELLER_ADDRESS=0xYourSellerWallet
AGENT_PRIVATE_KEYS=0xYourFundedGatewayBuyerPrivateKey
LEDGER_WRITER_PRIVATE_KEY=0xYourFundedArcLedgerWriterPrivateKey
ACCESS_LEDGER_ADDRESS=0xYourDeployedAccessLedger
ARC_RPC_URL=https://rpc.testnet.arc.network
NEXT_PUBLIC_ARCSCAN_TX_BASE=https://testnet.arcscan.app/tx/
```

Optional env vars:

```bash
PORT=3000
DEMO_BASE_URL=http://localhost:3000
OK_COMPUTER_DB_PATH=.data/ok-computer.sqlite
```

## Run Locally

Start the custom Next.js + Express server:

```bash
npm run dev
```

Open:

- Dashboard: http://localhost:3000
- Browser demo: http://localhost:3000/demo
- Health check: http://localhost:3000/health

## Run The Demo

First check the chain, env, ledger contract, writer wallet, and Gateway balance:

```bash
npm run demo:preflight
```

Reset the local dashboard events:

```bash
npm run demo:reset
```

Run the scripted crawler demo:

```bash
npm run demo:60
```

This sends 60 paid nanopayment unlocks and 12 unpaid blocked requests. Watch the dashboard update while it runs.

You can also use `/demo` in the browser. It creates a session wallet, asks you to fund it from the Circle faucet, deposits USDC into Gateway, then performs one paid nanopayment article unlock.

## Build

```bash
npm run build
npm run start
```

## Deploy

Deploy this as a Node web service because it uses a custom Express server in `server.ts`.

Use a host such as Railway, Render, Fly.io, or a VPS with these settings:

- Build command: `npm ci && npm run build`
- Start command: `npm run start`
- Node version: 22+
- Environment variables: copy the same values from `.env`

If you want dashboard history to survive restarts, mount persistent storage and set `OK_COMPUTER_DB_PATH` to a path on that disk.

After deployment, set `DEMO_BASE_URL` to your deployed URL before running the CLI demo against production:

```bash
DEMO_BASE_URL=https://your-app.example.com npm run demo:preflight
DEMO_BASE_URL=https://your-app.example.com npm run demo:60
```
