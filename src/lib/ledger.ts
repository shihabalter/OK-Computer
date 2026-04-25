import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const arcTestnet = defineChain({
  id: 5_042_002,
  name: "Arc Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "USDC",
    symbol: "USDC",
  },
  rpcUrls: {
    default: {
      http: [process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network"],
    },
  },
  blockExplorers: {
    default: {
      name: "ArcScan",
      url: "https://testnet.arcscan.app",
    },
  },
  testnet: true,
});

export const accessLedgerAbi = [
  {
    type: "function",
    name: "recordAccess",
    stateMutability: "nonpayable",
    inputs: [
      { name: "resourceId", type: "string" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "AccessPaid",
    inputs: [
      { name: "payer", type: "address", indexed: true },
      { name: "resourceId", type: "string", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
] as const;

function getRpcUrl() {
  return process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network";
}

export function getArcPublicClient() {
  return createPublicClient({
    chain: {
      ...arcTestnet,
      rpcUrls: {
        default: {
          http: [getRpcUrl()],
        },
      },
    },
    transport: http(getRpcUrl()),
  });
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export function isLedgerConfigured() {
  return Boolean(
    process.env.ACCESS_LEDGER_ADDRESS && process.env.LEDGER_WRITER_PRIVATE_KEY,
  );
}

export function getLedgerAddress() {
  return getAddress(requireEnv("ACCESS_LEDGER_ADDRESS")) as Address;
}

export function getLedgerWriterAccount() {
  return privateKeyToAccount(requireEnv("LEDGER_WRITER_PRIVATE_KEY") as Hex);
}

export async function getArcChainId() {
  return getArcPublicClient().getChainId();
}

export async function getLedgerBytecode() {
  return getArcPublicClient().getCode({ address: getLedgerAddress() });
}

export async function recordAccessOnLedger(
  resourcePath: string,
  amountUnits: number | string | bigint,
) {
  const account = getLedgerWriterAccount();
  const publicClient = getArcPublicClient();
  const walletClient = createWalletClient({
    account,
    chain: publicClient.chain,
    transport: http(getRpcUrl()),
  });

  const { request } = await publicClient.simulateContract({
    account,
    address: getLedgerAddress(),
    abi: accessLedgerAbi,
    functionName: "recordAccess",
    args: [resourcePath, BigInt(amountUnits)],
  });
  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });

  return hash;
}
