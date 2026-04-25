import {
  PROTECTED_RESOURCES,
  formatUsdcUnits,
  getResourceRows,
} from "./resources";

export type EventStatus = "PENDING" | "PAID" | "BLOCKED" | "LEDGER_FAILED";

export type AccessEvent = {
  id: number;
  createdAt: string;
  status: EventStatus;
  agent: string;
  resourcePath: string;
  priceUsdc: string;
  amountUnits: number;
  payer: string | null;
  network: string | null;
  paymentTx: string | null;
  ledgerTx: string | null;
  message: string | null;
};

type InsertPaymentInput = {
  agent: string;
  resourcePath: string;
  priceUsdc: string;
  amountUnits: number;
  payer: string;
  network: string;
  paymentTx: string | null;
};

type BlockedInput = {
  agent: string;
  resourcePath: string;
  priceUsdc: string;
  message: string;
};

type EventStore = {
  events: AccessEvent[];
  nextId: number;
};

const MAX_EVENTS = 500;

const globalForEvents = globalThis as typeof globalThis & {
  __okComputerEventStore?: EventStore;
};

function getStore() {
  globalForEvents.__okComputerEventStore ??= {
    events: [],
    nextId: 1,
  };

  return globalForEvents.__okComputerEventStore;
}

function nowIso() {
  return new Date().toISOString();
}

function addEvent(event: AccessEvent) {
  const store = getStore();
  store.events.push(event);

  if (store.events.length > MAX_EVENTS) {
    store.events.splice(0, store.events.length - MAX_EVENTS);
  }
}

function sortedEvents(events: AccessEvent[]) {
  return [...events].sort((left, right) => right.id - left.id);
}

export function createPendingPayment(input: InsertPaymentInput) {
  const store = getStore();
  const id = store.nextId;
  store.nextId += 1;

  addEvent({
    id,
    createdAt: nowIso(),
    status: "PENDING",
    agent: input.agent,
    resourcePath: input.resourcePath,
    priceUsdc: input.priceUsdc,
    amountUnits: input.amountUnits,
    payer: input.payer,
    network: input.network,
    paymentTx: input.paymentTx,
    ledgerTx: null,
    message: "Payment settled; writing Arc ledger proof",
  });

  return id;
}

export function markPaymentLedgered(id: number, ledgerTx: string | null) {
  const event = getStore().events.find((row) => row.id === id);
  if (!event) return;

  event.status = "PAID";
  event.ledgerTx = ledgerTx;
  event.message = ledgerTx
    ? "Unlocked after x402 payment and Arc proof"
    : "Unlocked after x402 payment; Arc ledger proof disabled";
}

export function markPaymentLedgerFailed(id: number, message: string) {
  const event = getStore().events.find((row) => row.id === id);
  if (!event) return;

  event.status = "LEDGER_FAILED";
  event.message = message;
}

export function recordBlockedAccess(input: BlockedInput) {
  const store = getStore();
  const id = store.nextId;
  store.nextId += 1;

  addEvent({
    id,
    createdAt: nowIso(),
    status: "BLOCKED",
    agent: input.agent,
    resourcePath: input.resourcePath,
    priceUsdc: input.priceUsdc,
    amountUnits: 0,
    payer: null,
    network: null,
    paymentTx: null,
    ledgerTx: null,
    message: input.message,
  });
}

export function resetDemoEvents() {
  const store = getStore();
  store.events = [];
  store.nextId = 1;
}

export function getDashboardSnapshot() {
  const events = getStore().events;
  const rows = sortedEvents(events).slice(0, 200);
  const allPaidRows = sortedEvents(
    events.filter((event) => event.status === "PAID"),
  );
  const allBlockedRows = sortedEvents(
    events.filter((event) => event.status === "BLOCKED"),
  );

  const paidUnits = allPaidRows.reduce(
    (total, row) => total + row.amountUnits,
    0,
  );
  const paidCount = allPaidRows.length;
  const averageUnits = paidCount > 0 ? Math.round(paidUnits / paidCount) : 0;
  const lowestUnits =
    paidCount > 0 ? Math.min(...allPaidRows.map((row) => row.amountUnits)) : 0;
  const highestUnits =
    paidCount > 0 ? Math.max(...allPaidRows.map((row) => row.amountUnits)) : 0;

  return {
    generatedAt: nowIso(),
    resources: getResourceRows(),
    events: rows,
    proofs: allPaidRows
      .filter((row) => row.ledgerTx)
      .map((row) => ({
        id: row.id,
        agent: row.agent,
        resourcePath: row.resourcePath,
        amountUnits: row.amountUnits,
        priceUsdc: row.priceUsdc,
        paymentTx: row.paymentTx,
        ledgerTx: row.ledgerTx,
        ledgerUrl: `${process.env.NEXT_PUBLIC_ARCSCAN_TX_BASE ?? "https://testnet.arcscan.app/tx/"}${row.ledgerTx}`,
        createdAt: row.createdAt,
      })),
    stats: {
      paidRequests: paidCount,
      nanopayments: paidCount,
      blockedRequests: allBlockedRows.length,
      totalRevenueUnits: paidUnits,
      totalRevenueUsdc: formatUsdcUnits(paidUnits, 4),
      totalRevenueCompact: formatUsdcUnits(paidUnits, 3),
      averagePaymentUsdc: formatUsdcUnits(averageUnits, 4),
      lowestPaymentUsdc: formatUsdcUnits(lowestUnits, 4),
      highestPaymentUsdc: formatUsdcUnits(highestUnits, 4),
      protectedResourcesUnlocked: new Set(
        allPaidRows.map((row) => row.resourcePath),
      ).size,
      allPaymentsBelowOneCent: allPaidRows.every(
        (row) => row.amountUnits < 10_000,
      ),
      totalProtectedResources: PROTECTED_RESOURCES.length,
    },
  };
}
