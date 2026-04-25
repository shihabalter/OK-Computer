import { GatewayClient } from "@circle-fin/x402-batching/client";
import { parseUnits, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { getResourceByPath } from "./resources";

export const DEMO_AGENT_NAME = "PersonalAgent";
export const DEMO_RESOURCE_PATH = "/premium/research-report";
export const DEMO_GATEWAY_DEPOSIT_USDC = "10";
export const DEMO_GATEWAY_DEPOSIT_UNITS = parseUnits(
  DEMO_GATEWAY_DEPOSIT_USDC,
  6,
);

type RawDemoBody = {
  privateKey?: unknown;
};

export function parseDemoPrivateKey(body: RawDemoBody) {
  if (
    typeof body.privateKey !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(body.privateKey)
  ) {
    throw new Error("A valid 0x-prefixed demo private key is required");
  }

  const privateKey = body.privateKey as Hex;
  privateKeyToAccount(privateKey);
  return privateKey;
}

export async function readDemoBody(request: Request) {
  try {
    return (await request.json()) as RawDemoBody;
  } catch {
    return {};
  }
}

export function getDemoResource() {
  const resource = getResourceByPath(DEMO_RESOURCE_PATH);
  if (!resource) {
    throw new Error(`Demo resource is missing: ${DEMO_RESOURCE_PATH}`);
  }

  return resource;
}

export function createDemoGatewayClient(privateKey: Hex) {
  return new GatewayClient({
    chain: "arcTestnet",
    privateKey,
    rpcUrl: process.env.ARC_RPC_URL,
  });
}

export function getRequestOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "http";

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

export function arcTxUrl(hash: string | null | undefined) {
  if (!hash) return null;

  const base =
    process.env.NEXT_PUBLIC_ARCSCAN_TX_BASE ??
    "https://testnet.arcscan.app/tx/";
  return `${base.replace(/\/?$/, "/")}${hash}`;
}

type GatewayBalances = Awaited<ReturnType<GatewayClient["getBalances"]>>;

export function serializeBalances(balances: GatewayBalances) {
  return {
    wallet: {
      units: balances.wallet.balance.toString(),
      formatted: balances.wallet.formatted,
    },
    gateway: {
      totalUnits: balances.gateway.total.toString(),
      availableUnits: balances.gateway.available.toString(),
      withdrawingUnits: balances.gateway.withdrawing.toString(),
      withdrawableUnits: balances.gateway.withdrawable.toString(),
      formattedTotal: balances.gateway.formattedTotal,
      formattedAvailable: balances.gateway.formattedAvailable,
      formattedWithdrawing: balances.gateway.formattedWithdrawing,
      formattedWithdrawable: balances.gateway.formattedWithdrawable,
    },
  };
}

export function demoErrorResponse(error: unknown, status = 500) {
  return Response.json(
    {
      ok: false,
      error: (error as Error).message,
    },
    { status },
  );
}
