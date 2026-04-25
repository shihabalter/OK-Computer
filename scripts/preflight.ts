import "dotenv/config";

import { GatewayClient } from "@circle-fin/x402-batching/client";
import { formatUnits, getAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  getArcChainId,
  getArcPublicClient,
  getLedgerAddress,
  getLedgerBytecode,
  isLedgerConfigured,
} from "../src/lib/ledger";
import {
  REQUIRED_DEMO_PAYMENT_UNITS,
  formatUsdcUnits,
} from "../src/lib/resources";

const REQUIRED_ENV = ["SELLER_ADDRESS", "AGENT_PRIVATE_KEYS"] as const;

function fail(message: string): never {
  throw new Error(message);
}

function requireEnv(name: (typeof REQUIRED_ENV)[number]) {
  const value = process.env[name];
  if (!value) fail(`${name} is required`);
  return value;
}

function parseAgentKeys() {
  return requireEnv("AGENT_PRIVATE_KEYS")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean) as Hex[];
}

async function main() {
  const issues: string[] = [];

  for (const name of REQUIRED_ENV) {
    if (!process.env[name]) issues.push(`${name} is missing`);
  }

  let agentKeys: Hex[] = [];
  if (process.env.SELLER_ADDRESS) {
    try {
      getAddress(process.env.SELLER_ADDRESS);
    } catch (error) {
      issues.push(`SELLER_ADDRESS is invalid: ${(error as Error).message}`);
    }
  }

  const hasLedgerAddress = Boolean(process.env.ACCESS_LEDGER_ADDRESS);
  const hasLedgerWriter = Boolean(process.env.LEDGER_WRITER_PRIVATE_KEY);
  if (hasLedgerAddress !== hasLedgerWriter) {
    issues.push(
      "Set both ACCESS_LEDGER_ADDRESS and LEDGER_WRITER_PRIVATE_KEY to enable ledger proofs, or omit both",
    );
  }

  if (hasLedgerAddress) {
    try {
      getLedgerAddress();
    } catch (error) {
      issues.push(
        `ACCESS_LEDGER_ADDRESS is invalid: ${(error as Error).message}`,
      );
    }
  }

  if (hasLedgerWriter) {
    try {
      privateKeyToAccount(process.env.LEDGER_WRITER_PRIVATE_KEY as Hex);
    } catch (error) {
      issues.push(
        `LEDGER_WRITER_PRIVATE_KEY is invalid: ${(error as Error).message}`,
      );
    }
  }

  if (process.env.AGENT_PRIVATE_KEYS) {
    try {
      agentKeys = parseAgentKeys();
      if (agentKeys.length === 0) {
        issues.push("AGENT_PRIVATE_KEYS must include at least one private key");
      }
      for (const key of agentKeys) privateKeyToAccount(key);
    } catch (error) {
      issues.push(`AGENT_PRIVATE_KEYS is invalid: ${(error as Error).message}`);
    }
  }

  if (issues.length === 0) {
    const chainId = await getArcChainId();
    if (chainId !== 5_042_002) {
      issues.push(`ARC_RPC_URL returned chain id ${chainId}, expected 5042002`);
    } else {
      console.log("Arc RPC chain id: 5042002");
    }

    if (isLedgerConfigured()) {
      const bytecode = await getLedgerBytecode();
      if (!bytecode || bytecode === "0x") {
        issues.push("ACCESS_LEDGER_ADDRESS has no deployed bytecode on Arc Testnet");
      } else {
        console.log(`AccessLedger deployed at ${getLedgerAddress()}`);
      }

      const publicClient = getArcPublicClient();
      const writer = privateKeyToAccount(
        process.env.LEDGER_WRITER_PRIVATE_KEY as Hex,
      );
      const writerBalance = await publicClient.getBalance({
        address: writer.address,
      });
      if (writerBalance === 0n) {
        issues.push(
          "LEDGER_WRITER_PRIVATE_KEY wallet has no Arc native USDC for gas",
        );
      } else {
        console.log(
          `Ledger writer gas balance: ${formatUnits(writerBalance, 18)} USDC`,
        );
      }
    } else {
      console.log("Arc AccessLedger proof disabled; skipping ledger checks.");
    }

    const buyer = new GatewayClient({
      chain: "arcTestnet",
      privateKey: agentKeys[0],
      rpcUrl: process.env.ARC_RPC_URL,
    });
    const balances = await buyer.getBalances();
    if (balances.gateway.available < BigInt(REQUIRED_DEMO_PAYMENT_UNITS)) {
      issues.push(
        `First agent Gateway balance is ${balances.gateway.formattedAvailable} USDC, needs at least ${formatUsdcUnits(REQUIRED_DEMO_PAYMENT_UNITS)} USDC`,
      );
    } else {
      console.log(
        `First agent Gateway balance: ${balances.gateway.formattedAvailable} USDC`,
      );
    }
  }

  if (issues.length > 0) {
    console.error("OK Computer preflight failed:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exit(1);
  }

  console.log("OK Computer preflight passed.");
}

main().catch((error) => {
  console.error("OK Computer preflight failed:");
  console.error((error as Error).message);
  process.exit(1);
});
