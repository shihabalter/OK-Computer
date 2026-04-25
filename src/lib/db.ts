import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

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

type EventRow = {
  id: number;
  created_at: string;
  status: EventStatus;
  agent: string;
  resource_path: string;
  price_usdc: string;
  amount_units: number;
  payer: string | null;
  network: string | null;
  payment_tx: string | null;
  ledger_tx: string | null;
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

const require = createRequire(import.meta.url);

let database: DatabaseSyncType | null = null;

function getDatabasePath() {
  return process.env.OK_COMPUTER_DB_PATH ?? join(process.cwd(), ".data", "ok-computer.sqlite");
}

function getDb() {
  if (!database) {
    const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
    const dbPath = getDatabasePath();
    mkdirSync(dirname(dbPath), { recursive: true });
    database = new DatabaseSync(dbPath);
    database.exec(`
      create table if not exists access_events (
        id integer primary key autoincrement,
        created_at text not null,
        status text not null,
        agent text not null,
        resource_path text not null,
        price_usdc text not null,
        amount_units integer not null,
        payer text,
        network text,
        payment_tx text,
        ledger_tx text,
        message text
      );

      create index if not exists idx_access_events_status
        on access_events(status);

      create index if not exists idx_access_events_created_at
        on access_events(created_at);
    `);
  }

  return database;
}

function nowIso() {
  return new Date().toISOString();
}

function toAccessEvent(row: EventRow): AccessEvent {
  return {
    id: row.id,
    createdAt: row.created_at,
    status: row.status,
    agent: row.agent,
    resourcePath: row.resource_path,
    priceUsdc: row.price_usdc,
    amountUnits: row.amount_units,
    payer: row.payer,
    network: row.network,
    paymentTx: row.payment_tx,
    ledgerTx: row.ledger_tx,
    message: row.message,
  };
}

export function createPendingPayment(input: InsertPaymentInput) {
  const result = getDb()
    .prepare(
      `insert into access_events (
        created_at, status, agent, resource_path, price_usdc, amount_units,
        payer, network, payment_tx, ledger_tx, message
      ) values (?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, null, 'Payment settled; writing Arc ledger proof')`,
    )
    .run(
      nowIso(),
      input.agent,
      input.resourcePath,
      input.priceUsdc,
      input.amountUnits,
      input.payer,
      input.network,
      input.paymentTx,
    );

  return Number(result.lastInsertRowid);
}

export function markPaymentLedgered(id: number, ledgerTx: string) {
  getDb()
    .prepare(
      `update access_events
       set status = 'PAID', ledger_tx = ?, message = 'Unlocked after x402 payment and Arc proof'
       where id = ?`,
    )
    .run(ledgerTx, id);
}

export function markPaymentLedgerFailed(id: number, message: string) {
  getDb()
    .prepare(
      `update access_events
       set status = 'LEDGER_FAILED', message = ?
       where id = ?`,
    )
    .run(message, id);
}

export function recordBlockedAccess(input: BlockedInput) {
  getDb()
    .prepare(
      `insert into access_events (
        created_at, status, agent, resource_path, price_usdc, amount_units,
        payer, network, payment_tx, ledger_tx, message
      ) values (?, 'BLOCKED', ?, ?, ?, 0, null, null, null, null, ?)`,
    )
    .run(
      nowIso(),
      input.agent,
      input.resourcePath,
      input.priceUsdc,
      input.message,
    );
}

export function resetDemoEvents() {
  getDb().exec("delete from access_events;");
}

export function getDashboardSnapshot() {
  const db = getDb();
  const rows = db
    .prepare("select * from access_events order by id desc limit 200")
    .all() as EventRow[];
  const allPaidRows = db
    .prepare("select * from access_events where status = 'PAID' order by id desc")
    .all() as EventRow[];
  const allBlockedRows = db
    .prepare("select * from access_events where status = 'BLOCKED' order by id desc")
    .all() as EventRow[];

  const paidUnits = allPaidRows.reduce((total, row) => total + row.amount_units, 0);
  const paidCount = allPaidRows.length;
  const averageUnits = paidCount > 0 ? Math.round(paidUnits / paidCount) : 0;
  const lowestUnits =
    paidCount > 0 ? Math.min(...allPaidRows.map((row) => row.amount_units)) : 0;
  const highestUnits =
    paidCount > 0 ? Math.max(...allPaidRows.map((row) => row.amount_units)) : 0;

  return {
    generatedAt: nowIso(),
    resources: getResourceRows(),
    events: rows.map(toAccessEvent),
    proofs: allPaidRows
      .filter((row) => row.ledger_tx)
      .map((row) => ({
        id: row.id,
        agent: row.agent,
        resourcePath: row.resource_path,
        amountUnits: row.amount_units,
        priceUsdc: row.price_usdc,
        paymentTx: row.payment_tx,
        ledgerTx: row.ledger_tx,
        ledgerUrl: `${process.env.NEXT_PUBLIC_ARCSCAN_TX_BASE ?? "https://testnet.arcscan.app/tx/"}${row.ledger_tx}`,
        createdAt: row.created_at,
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
        allPaidRows.map((row) => row.resource_path),
      ).size,
      allPaymentsBelowOneCent: allPaidRows.every((row) => row.amount_units < 10_000),
      totalProtectedResources: PROTECTED_RESOURCES.length,
    },
  };
}
