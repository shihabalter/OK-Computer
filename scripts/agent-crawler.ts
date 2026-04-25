import "dotenv/config";

import { GatewayClient } from "@circle-fin/x402-batching/client";
import type { Hex } from "viem";

import {
  BOT_NAMES,
  DEMO_PAID_SEQUENCE,
  getResourceByPath,
} from "../src/lib/resources";

const baseUrl = process.env.DEMO_BASE_URL ?? "http://localhost:3000";

function agentKeys() {
  const keys = (process.env.AGENT_PRIVATE_KEYS ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean) as Hex[];

  if (keys.length === 0) {
    throw new Error("AGENT_PRIVATE_KEYS must include at least one funded key");
  }

  return keys;
}

async function sendBlockedProbe(index: number) {
  const path = index % 2 === 0 ? "/premium/research-report" : "/api/dataset-row";
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      accept: "application/json",
      "x-agent-name": "UnknownBot",
      "x-demo-refusal": "true",
    },
  });

  if (response.status !== 402) {
    throw new Error(
      `Blocked probe expected 402 for ${path}, received ${response.status}`,
    );
  }

  console.log(`UnknownBot -> ${path} -> 402 -> refused payment -> blocked`);
}

async function payForResource(
  privateKey: Hex,
  botName: string,
  path: string,
  index: number,
) {
  const resource = getResourceByPath(path);
  if (!resource) throw new Error(`Unknown resource in demo sequence: ${path}`);

  const client = new GatewayClient({
    chain: "arcTestnet",
    privateKey,
    rpcUrl: process.env.ARC_RPC_URL,
  });

  const result = await client.pay<Record<string, unknown>>(`${baseUrl}${path}`, {
    headers: {
      accept: "application/json",
      "x-agent-name": botName,
      "x-demo-run": "60",
      "x-demo-index": String(index + 1),
    },
  });

  const ledgerTx =
    typeof result.data.ledgerTx === "string" ? result.data.ledgerTx : "pending";

  console.log(
    `${botName} -> ${path} -> 402 -> paid $${resource.priceUsdc} -> unlocked | payment ${result.transaction} | ledger ${ledgerTx}`,
  );
}

async function main() {
  const keys = agentKeys();
  let blockedSent = 0;

  console.log(`OK Computer live crawler targeting ${baseUrl}`);
  console.log("Run npm run demo:reset first if you need a clean dashboard.");

  for (let index = 0; index < DEMO_PAID_SEQUENCE.length; index += 1) {
    if (index % 5 === 0 && blockedSent < 12) {
      await sendBlockedProbe(blockedSent);
      blockedSent += 1;
    }

    const botName = BOT_NAMES[index % BOT_NAMES.length];
    const privateKey = keys[index % keys.length];
    await payForResource(privateKey, botName, DEMO_PAID_SEQUENCE[index], index);
  }

  while (blockedSent < 12) {
    await sendBlockedProbe(blockedSent);
    blockedSent += 1;
  }

  console.log("Demo complete: 60 paid unlocks and 12 blocked unpaid requests.");
}

main().catch((error) => {
  console.error("OK Computer live crawler failed:");
  console.error((error as Error).message);
  process.exit(1);
});
