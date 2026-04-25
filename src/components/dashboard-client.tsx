"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type ResourceRow = {
  path: string;
  title: string;
  kind: "article" | "api";
  priceUsdc: string;
  priceLabel: string;
  amountUnits: number;
  description: string;
};

type AccessEvent = {
  id: number;
  createdAt: string;
  status: "PENDING" | "PAID" | "BLOCKED" | "LEDGER_FAILED";
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

type ProofRow = {
  id: number;
  agent: string;
  resourcePath: string;
  priceUsdc: string;
  amountUnits: number;
  paymentTx: string | null;
  ledgerTx: string;
  ledgerUrl: string;
  createdAt: string;
};

type DashboardSnapshot = {
  generatedAt: string;
  resources: ResourceRow[];
  events: AccessEvent[];
  proofs: ProofRow[];
  stats: {
    paidRequests: number;
    nanopayments: number;
    blockedRequests: number;
    totalRevenueUnits: number;
    totalRevenueUsdc: string;
    totalRevenueCompact: string;
    averagePaymentUsdc: string;
    lowestPaymentUsdc: string;
    highestPaymentUsdc: string;
    protectedResourcesUnlocked: number;
    allPaymentsBelowOneCent: boolean;
    totalProtectedResources: number;
  };
};

const emptySnapshot: DashboardSnapshot = {
  generatedAt: new Date(0).toISOString(),
  resources: [],
  events: [],
  proofs: [],
  stats: {
    paidRequests: 0,
    nanopayments: 0,
    blockedRequests: 0,
    totalRevenueUnits: 0,
    totalRevenueUsdc: "0.0000",
    totalRevenueCompact: "0.000",
    averagePaymentUsdc: "0.0000",
    lowestPaymentUsdc: "0.0000",
    highestPaymentUsdc: "0.0000",
    protectedResourcesUnlocked: 0,
    allPaymentsBelowOneCent: true,
    totalProtectedResources: 6,
  },
};

const GAS_PER_REQUEST_USD = 0.2;

function shortHash(value: string | null, head = 10, tail = 8) {
  if (!value) return "awaiting proof";
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "waiting";

  return date.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function createdAtMs(value: string) {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
}

function newestFirst<T extends { createdAt: string; id: number }>(rows: T[]) {
  return [...rows].sort((left, right) => {
    const timeDelta = createdAtMs(right.createdAt) - createdAtMs(left.createdAt);
    return timeDelta || right.id - left.id;
  });
}

function statusNarrative(event: AccessEvent, resource?: ResourceRow) {
  const target = resource?.title ?? event.resourcePath;
  const price = `$${event.priceUsdc} USDC`;

  if (event.status === "BLOCKED") {
    return `Agent tried to access ${target} without payment. Resource stayed locked.`;
  }

  if (event.status === "PENDING") {
    return `Payment submitted for ${target}. Waiting for Arc confirmation.`;
  }

  if (event.status === "LEDGER_FAILED") {
    return `Agent paid ${price}, but the on-chain proof needs attention.`;
  }

  return `Agent paid ${price} and accessed ${target}.`;
}

function StatusBadge({ status }: { status: AccessEvent["status"] }) {
  const config = {
    PAID: {
      label: "Paid",
      className: "bg-[#0f766e] text-white",
    },
    BLOCKED: {
      label: "Blocked",
      className: "bg-[#b42318] text-white",
    },
    PENDING: {
      label: "Pending",
      className: "bg-[#0369a1] text-white",
    },
    LEDGER_FAILED: {
      label: "Proof failed",
      className: "bg-[#92400e] text-white",
    },
  } satisfies Record<
    AccessEvent["status"],
    { label: string; className: string }
  >;

  const current = config[status];

  return (
    <span
      className={`inline-flex h-8 items-center px-3 text-xs font-extrabold uppercase ${current.className}`}
    >
      {current.label}
    </span>
  );
}

function BatchBadge({ value }: { value: number }) {
  return (
    <span className="inline-flex h-8 min-w-8 shrink-0 items-center justify-center bg-[#111827] px-2 font-[var(--font-space-grotesk)] text-sm font-bold text-white">
      #{value}
    </span>
  );
}

export function DashboardClient() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(emptySnapshot);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSnapshot() {
      try {
        const response = await fetch("/api/dashboard", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Dashboard API returned ${response.status}`);
        }
        const data = (await response.json()) as DashboardSnapshot;
        if (!cancelled) {
          setSnapshot(data);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError((loadError as Error).message);
        }
      }
    }

    void loadSnapshot();
    const timer = window.setInterval(loadSnapshot, 1200);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const recentEvents = useMemo(
    () => newestFirst(snapshot.events),
    [snapshot.events],
  );
  const proofRows = useMemo(
    () => newestFirst(snapshot.proofs),
    [snapshot.proofs],
  );
  const resourcesByPath = useMemo(() => {
    return new Map(snapshot.resources.map((resource) => [resource.path, resource]));
  }, [snapshot.resources]);
  const paidCallsByResource = useMemo(() => {
    const calls = new Map<string, number>();
    for (const proof of snapshot.proofs) {
      calls.set(proof.resourcePath, (calls.get(proof.resourcePath) ?? 0) + 1);
    }
    return calls;
  }, [snapshot.proofs]);

  const protectedProgress = Math.min(
    100,
    Math.round(
      (snapshot.stats.protectedResourcesUnlocked /
        Math.max(1, snapshot.stats.totalProtectedResources)) *
        100,
    ),
  );

  const totalRequests =
    snapshot.stats.paidRequests + snapshot.stats.blockedRequests;
  const blockedRate =
    totalRequests > 0
      ? Math.round((snapshot.stats.blockedRequests / totalRequests) * 100)
      : 0;
  const comparisonPrice =
    Number(snapshot.stats.averagePaymentUsdc) > 0
      ? snapshot.stats.averagePaymentUsdc
      : snapshot.resources[0]?.priceUsdc ?? "0.0008";
  const gasMultiple = Math.max(
    1,
    Math.round(GAS_PER_REQUEST_USD / Math.max(Number(comparisonPrice), 0.0001)),
  );

  return (
    <main className="min-h-screen bg-[#f7f9fb] text-[#111827]">
      <header className="border-b border-[#cbd5df] bg-white">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between gap-4 px-5 sm:px-8">
          <Link
            href="/"
            className="whitespace-nowrap font-[var(--font-space-grotesk)] text-xl font-bold text-[#111827] sm:text-2xl"
          >
            OK Computer
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-[1500px] py-6">
        <div className="border border-[#cbd5df] bg-white px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-[900px]">
              <p className="text-sm font-extrabold uppercase text-[#315067]">
                Live payment firewall for AI traffic
              </p>
              <h1 className="mt-3 max-w-[980px] font-[var(--font-space-grotesk)] text-4xl font-bold leading-tight text-[#0f172a] sm:text-5xl">
                AI agents unlock paid resources with $0.001 USDC nanopayments
              </h1>
              <p className="mt-4 max-w-[840px] text-lg leading-8 text-[#46586b]">
                Agent requests a protected article or API, pays a nanopayment,
                receives the unlocked response, and you earn money on every
                successful machine action.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:min-w-[320px] xl:pt-8">
              <Link
                href="/demo"
                className="group inline-flex min-h-20 items-center justify-between gap-5 border border-[#0f766e] bg-[#0f766e] px-6 py-4 text-left text-white transition-colors hover:bg-[#115e59]"
              >
                <span>
                  <span className="block font-[var(--font-space-grotesk)] text-xl font-bold">
                    Run live agent demo
                  </span>
                  <span className="mt-1 block text-sm font-semibold text-[#d8fff7]">
                    Start paid requests
                  </span>
                </span>
                <span className="font-[var(--font-space-grotesk)] text-2xl font-bold transition-transform group-hover:translate-x-1">
                  -&gt;
                </span>
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <FlowStep
              step="1"
              title="Agent requests resource"
              body="Crawler, bot, or model asks for premium content."
            />
            <FlowStep
              step="2"
              title="Pays nanopayment"
              body="x402 sends a sub-cent USDC payment instead of a subscription."
            />
            <FlowStep
              step="3"
              title="Resource unlocks"
              body="The article, API response, or dataset row is released."
            />
            <FlowStep
              step="4"
              title="You earn money"
              body="Each paid machine action becomes recorded revenue."
            />
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-4">
          <MetricCard
            label="Total revenue"
            value={`$${snapshot.stats.totalRevenueUsdc} USDC`}
            detail={`${snapshot.stats.paidRequests} paid requests at $${snapshot.stats.averagePaymentUsdc} average`}
            tone="green"
          />
          <MetricCard
            label="Paid resources unlocked"
            value={`${snapshot.stats.protectedResourcesUnlocked} / ${snapshot.stats.totalProtectedResources}`}
            detail={`${protectedProgress}% of protected inventory has paid access`}
          />
          <MetricCard
            label="Blocked without payment"
            value={snapshot.stats.blockedRequests}
            detail={`${blockedRate}% of attempts were stopped before unlock`}
          />
          <MetricCard
            label="Sub-cent proof"
            value={
              snapshot.stats.allPaymentsBelowOneCent
                ? "All requests"
                : "Mixed prices"
            }
            detail="Traditional gas would make this impossible"
          />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(390px,0.85fr)_minmax(0,1.15fr)]">
          <section className="min-w-0 border border-[#cbd5df] bg-white">
            <PanelHeader title="On-chain Proof" meta="ArcScan links" />
            <div className="h-[70vh] divide-y divide-[#e6edf3] overflow-y-auto overscroll-contain [scrollbar-gutter:stable] xl:h-[640px]">
              {proofRows.length === 0 ? (
                <EmptyState text="Paid unlocks will append clickable Arc proof links here." />
              ) : (
                proofRows.map((proof, index) => {
                  const resource = resourcesByPath.get(proof.resourcePath);

                  return (
                    <article key={`${proof.id}-${proof.ledgerTx}`} className="p-4">
                      <div className="flex items-start gap-3">
                        <BatchBadge value={proofRows.length - index} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-[var(--font-space-grotesk)] text-base font-bold text-[#111827]">
                                {resource?.title ?? proof.resourcePath}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-[#526477]">
                                {proof.agent} paid ${proof.priceUsdc} USDC
                              </p>
                            </div>
                            <a
                              href={proof.ledgerUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 border border-[#0f766e] px-2.5 py-1.5 text-xs font-bold text-[#0f766e] transition-colors hover:bg-[#ecfdf5]"
                            >
                              View
                            </a>
                          </div>
                          <time className="mt-2 block font-mono text-xs font-semibold text-[#6b7d90]">
                            {formatTimestamp(proof.createdAt)}
                          </time>
                          <dl className="mt-3 grid gap-2">
                            <ProofField
                              label="Auth"
                              value={shortHash(proof.paymentTx, 10, 8)}
                            />
                            <ProofField
                              label="Ledger"
                              value={shortHash(proof.ledgerTx, 10, 8)}
                            />
                          </dl>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <section className="min-w-0 border border-[#cbd5df] bg-white">
            <PanelHeader
              title="Live Agent Requests"
              meta={`${recentEvents.length} latest events`}
            />
            <div className="h-[70vh] divide-y divide-[#e6edf3] overflow-y-auto overscroll-contain [scrollbar-gutter:stable] xl:h-[640px]">
              {recentEvents.length === 0 ? (
                <EmptyState text="Run the demo to stream paid and blocked agent requests." />
              ) : (
                recentEvents.map((event, index) => {
                  const resource = resourcesByPath.get(event.resourcePath);

                  return (
                    <article
                      key={event.id}
                      className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 px-4 py-3 md:grid-cols-[40px_104px_minmax(0,1fr)] md:items-start"
                    >
                      <BatchBadge value={recentEvents.length - index} />
                      <div className="flex items-center gap-3 md:block">
                        <StatusBadge status={event.status} />
                        <p className="font-mono text-xs font-semibold text-[#526477] md:mt-3">
                          ${event.priceUsdc}
                        </p>
                      </div>
                      <div className="col-span-2 min-w-0 md:col-span-1">
                        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                          <p className="min-w-0 font-[var(--font-space-grotesk)] text-base font-bold text-[#111827]">
                            {event.agent} requested{" "}
                            {resource?.title ?? event.resourcePath}
                          </p>
                          <time className="shrink-0 font-mono text-xs font-semibold text-[#526477]">
                            {formatTimestamp(event.createdAt)}
                          </time>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#46586b]">
                          {statusNarrative(event, resource)}
                        </p>
                        <div className="mt-2 flex min-w-0 flex-col gap-1 font-mono text-xs text-[#526477] sm:flex-row sm:items-center sm:gap-3">
                          <p className="min-w-0 break-all">{event.resourcePath}</p>
                          <p className="shrink-0">
                            proof {shortHash(event.ledgerTx, 8, 6)}
                          </p>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </div>

        <section className="mt-5 border border-[#cbd5df] bg-[#10202b] p-5 text-white">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center">
            <div>
              <p className="text-sm font-extrabold uppercase text-[#9bd6cd]">
                Why Arc matters
              </p>
              <p className="mt-4 max-w-3xl text-base leading-7 text-[#d5e3ea]">
                Normal gas costs can exceed the content price. Arc keeps
                nanopayments viable, so agents can pay you per read instead of
                being blocked by fees.
              </p>
            </div>
            <dl className="grid gap-3 md:grid-cols-3">
              <EconomicsRow
                label="Ethereum gas per request"
                value="~$0.20"
              />
              <EconomicsRow
                label="This request price"
                value={`$${comparisonPrice}`}
              />
              <EconomicsRow
                label="Result"
                value={`${gasMultiple}x gas overhead avoided`}
              />
            </dl>
          </div>
        </section>

        <section className="mt-5 border border-[#cbd5df] bg-white">
          <div className="flex flex-col gap-3 border-b border-[#cbd5df] px-5 py-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-[var(--font-space-grotesk)] text-2xl font-bold text-[#111827]">
                Protected Resources Earning Nanopayments
              </h2>
              <p className="mt-2 text-base text-[#526477]">
                These articles and APIs require payment before automated access.
              </p>
            </div>
            <div className="min-w-[220px]">
              <div className="h-2 bg-[#e6edf3]">
                <div
                  className="h-full bg-[#0f766e]"
                  style={{ width: `${protectedProgress}%` }}
                />
              </div>
              <p className="mt-2 text-sm font-bold text-[#315067]">
                Paid resources unlocked:{" "}
                {snapshot.stats.protectedResourcesUnlocked} /{" "}
                {snapshot.stats.totalProtectedResources}
              </p>
            </div>
          </div>
          <div className="grid divide-y divide-[#e6edf3] lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {snapshot.resources.map((resource) => (
              <article key={resource.path} className="min-w-0 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-[var(--font-space-grotesk)] text-lg font-bold text-[#111827]">
                      {resource.title}
                    </p>
                    <p className="mt-2 break-all font-mono text-sm text-[#526477]">
                      {resource.path}
                    </p>
                  </div>
                  <span className="shrink-0 border border-[#cbd5df] bg-[#f7f9fb] px-2.5 py-1 text-xs font-bold uppercase text-[#315067]">
                    {resource.kind}
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-[#e6edf3] py-3">
                  <InlineMetric label="Price" value={resource.priceLabel} />
                  <InlineMetric
                    label="Paid calls"
                    value={paidCallsByResource.get(resource.path) ?? 0}
                  />
                </dl>
                <p className="mt-4 text-base leading-7 text-[#46586b]">
                  {resource.description}
                </p>
              </article>
            ))}
          </div>
        </section>
      </section>

      {error ? (
        <div className="fixed bottom-4 left-4 right-4 border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 sm:left-auto sm:max-w-md">
          {error}
        </div>
      ) : null}
    </main>
  );
}

function FlowStep({
  step,
  title,
  body,
}: {
  step: string;
  title: string;
  body: string;
}) {
  return (
    <article className="min-h-[150px] border border-[#d8e1ea] bg-[#f7f9fb] p-4">
      <span className="inline-flex h-9 w-9 items-center justify-center bg-[#111827] font-[var(--font-space-grotesk)] text-base font-bold text-white">
        {step}
      </span>
      <h2 className="mt-4 font-[var(--font-space-grotesk)] text-lg font-bold text-[#111827]">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-6 text-[#526477]">{body}</p>
    </article>
  );
}

function PanelHeader({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border-b border-[#cbd5df] bg-[#eef4f7] px-5 py-4">
      <h2 className="min-w-0 font-[var(--font-space-grotesk)] text-lg font-bold uppercase text-[#111827]">
        {title}
      </h2>
      <span className="shrink-0 text-right text-sm font-bold uppercase text-[#526477]">
        {meta}
      </span>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone = "blue",
}: {
  label: string;
  value: ReactNode;
  detail: string;
  tone?: "blue" | "green";
}) {
  const color =
    tone === "green"
      ? "border-[#0f766e] bg-[#f0fdfa]"
      : "border-[#cbd5df] bg-white";

  return (
    <article className={`min-h-[142px] border p-5 ${color}`}>
      <p className="text-sm font-extrabold uppercase text-[#315067]">{label}</p>
      <p className="mt-3 break-words font-[var(--font-space-grotesk)] text-3xl font-bold text-[#111827]">
        {value}
      </p>
      <p className="mt-3 text-base leading-6 text-[#46586b]">{detail}</p>
    </article>
  );
}

function InlineMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <dt className="text-xs font-extrabold uppercase text-[#6b7d90]">
        {label}
      </dt>
      <dd className="mt-1 font-[var(--font-space-grotesk)] text-xl font-bold text-[#111827]">
        {value}
      </dd>
    </div>
  );
}

function ProofField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 border border-[#e6edf3] bg-[#f7f9fb] px-2.5 py-2">
      <dt className="shrink-0 text-[11px] font-extrabold uppercase text-[#6b7d90]">
        {label}
      </dt>
      <dd
        className="min-w-0 truncate font-mono text-xs font-semibold text-[#111827]"
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function EconomicsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border border-[#24414f] bg-[#183240] px-4 py-3">
      <dt className="text-sm font-bold text-[#c8dbe2]">{label}</dt>
      <dd className="text-right font-[var(--font-space-grotesk)] text-xl font-bold text-white">
        {value}
      </dd>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-5 py-10 text-base text-[#526477]">{text}</div>;
}
