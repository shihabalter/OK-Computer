export type ResourceKind = "article" | "api";

export type ProtectedResource = {
  path: string;
  title: string;
  kind: ResourceKind;
  priceUsdc: string;
  amountUnits: number;
  description: string;
  preview: string;
  unlocked: Record<string, unknown>;
};

export const BOT_NAMES = [
  "ResearchBot",
  "SummaryAgent",
  "PriceMonitorAI",
  "DatasetCollector",
  "TrainingCrawler",
] as const;

export const PROTECTED_RESOURCES: ProtectedResource[] = [
  {
    path: "/premium/article-1",
    title: "Autonomous Checkout Signals",
    kind: "article",
    priceUsdc: "0.0008",
    amountUnits: 800,
    description: "Premium publisher article priced for machine readers.",
    preview:
      "This content is protected by OK Computer. AI agents and automated clients must pay $0.0008 USDC to unlock.",
    unlocked: {
      title: "Autonomous Checkout Signals",
      body: "Agentic commerce volume is clustering around APIs that can price each read below a cent and settle without per-action gas overhead.",
      signal: "machine-traffic-monetization",
    },
  },
  {
    path: "/premium/article-2",
    title: "Crawler Budget Markets",
    kind: "article",
    priceUsdc: "0.0008",
    amountUnits: 800,
    description: "Second premium article using the same default read price.",
    preview:
      "This content is protected by OK Computer. AI agents and automated clients must pay $0.0008 USDC to unlock.",
    unlocked: {
      title: "Crawler Budget Markets",
      body: "Publishers can expose clear price discovery to agents while keeping human previews free and readable.",
      signal: "priced-access",
    },
  },
  {
    path: "/premium/research-report",
    title: "Agentic Web Revenue Report",
    kind: "article",
    priceUsdc: "0.0020",
    amountUnits: 2000,
    description: "High-value report section unlocked by x402 payment.",
    preview:
      "Locked for automated clients. Price: $0.0020 USDC. Human visitors can read this preview before an agent pays.",
    unlocked: {
      title: "Agentic Web Revenue Report",
      body: "Sub-cent access control creates a payment firewall for AI traffic: every API call, report section, and dataset row can become a revenue event.",
      margin:
        "Traditional gas-per-read economics fail here because the fee can exceed the content price. Batched nanopayments preserve margin.",
    },
  },
  {
    path: "/api/market-signal",
    title: "Market Signal API",
    kind: "api",
    priceUsdc: "0.0012",
    amountUnits: 1200,
    description: "Real-time signal endpoint for price-monitor agents.",
    preview:
      "This API is protected by OK Computer. Automated clients must pay $0.0012 USDC to unlock.",
    unlocked: {
      symbol: "AGENTWEB",
      confidence: 0.91,
      direction: "up",
      window: "15m",
    },
  },
  {
    path: "/api/dataset-row",
    title: "Dataset Row API",
    kind: "api",
    priceUsdc: "0.0003",
    amountUnits: 300,
    description: "One priced row from a premium machine-learning dataset.",
    preview:
      "This dataset row is protected by OK Computer. Automated clients must pay $0.0003 USDC to unlock.",
    unlocked: {
      rowId: "arc-nano-042",
      label: "paid-machine-read",
      value: 0.8731,
      source: "ok-computer-demo",
    },
  },
  {
    path: "/api/article-summary-feed",
    title: "Article Summary Feed",
    kind: "api",
    priceUsdc: "0.0005",
    amountUnits: 500,
    description: "Compact premium feed consumed by summary agents.",
    preview:
      "This feed is protected by OK Computer. Automated clients must pay $0.0005 USDC to unlock.",
    unlocked: {
      items: [
        "Agents receive HTTP 402 for paid resources.",
        "Gateway signs gasless EIP-3009 authorizations.",
        "Arc records a proof event for each unlock.",
      ],
    },
  },
];

const resourcesByPath = new Map(
  PROTECTED_RESOURCES.map((resource) => [resource.path, resource]),
);

export const DEMO_PAID_SEQUENCE = [
  ...Array.from({ length: 53 }, () => "/premium/article-1"),
  "/premium/article-2",
  "/premium/research-report",
  "/api/market-signal",
  "/api/dataset-row",
  "/api/dataset-row",
  "/api/article-summary-feed",
  "/api/article-summary-feed",
] as const;

export const REQUIRED_DEMO_PAYMENT_UNITS = DEMO_PAID_SEQUENCE.reduce(
  (total, path) => total + (resourcesByPath.get(path)?.amountUnits ?? 0),
  0,
);

export function normalizeResourcePath(pathname: string) {
  const parsedPath = pathname.startsWith("http")
    ? new URL(pathname).pathname
    : pathname.split("?")[0];

  if (parsedPath.length > 1 && parsedPath.endsWith("/")) {
    return parsedPath.slice(0, -1);
  }

  return parsedPath;
}

export function getResourceByPath(pathname: string) {
  return resourcesByPath.get(normalizeResourcePath(pathname));
}

export function formatUsdcUnits(units: number | bigint, precision = 4) {
  const numericUnits = typeof units === "bigint" ? Number(units) : units;
  const value = numericUnits / 1_000_000;
  return value.toFixed(precision);
}

export function formatPrice(priceUsdc: string) {
  return `$${priceUsdc}`;
}

export function getResourceRows() {
  return PROTECTED_RESOURCES.map((resource) => ({
    path: resource.path,
    title: resource.title,
    kind: resource.kind,
    priceUsdc: resource.priceUsdc,
    priceLabel: formatPrice(resource.priceUsdc),
    amountUnits: resource.amountUnits,
    description: resource.description,
  }));
}
