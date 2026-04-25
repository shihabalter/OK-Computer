"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type DemoResource = {
  path: string;
  title: string;
  priceUsdc: string;
};

type DemoChatClientProps = {
  resource: DemoResource;
  faucetUrl: string;
};

type WalletSession = {
  address: string;
  privateKey: string;
};

type SerializedBalances = {
  wallet: {
    units: string;
    formatted: string;
  };
  gateway: {
    totalUnits: string;
    availableUnits: string;
    withdrawingUnits: string;
    withdrawableUnits: string;
    formattedTotal: string;
    formattedAvailable: string;
    formattedWithdrawing: string;
    formattedWithdrawable: string;
  };
};

type ApiError = Error & {
  status?: number;
  code?: string;
  data?: unknown;
};

type MessageLink = {
  label: string;
  href: string;
};

type ChatMessage = {
  id: string;
  role: "agent" | "user" | "system";
  text: string;
  links?: MessageLink[];
  bullets?: string[];
};

type SetupStatus =
  | "creating"
  | "needs_faucet"
  | "funded"
  | "depositing"
  | "ready"
  | "error";

type BalanceResponse = {
  ok: true;
  address: string;
  balances: SerializedBalances;
};

type DepositResponse = {
  ok: true;
  skipped: boolean;
  address: string;
  amount: string;
  approvalTxHash?: string | null;
  approvalUrl?: string | null;
  depositTxHash?: string | null;
  depositUrl?: string | null;
  balances: SerializedBalances;
};

type ProbeResponse = {
  ok: boolean;
  status: number;
  rejected: boolean;
  paymentRequired: boolean;
  resource: DemoResource;
};

type PayResponse = {
  ok: true;
  status: number;
  amount: string;
  amountUnits: string;
  payer: string;
  paymentTx: string;
  paymentUrl: string | null;
  ledgerTx: string | null;
  ledgerUrl: string | null;
  content: Record<string, unknown> | null;
};

const STORAGE_KEY = "ok-computer.demo.wallet.v1";
const BALANCE_POLL_MS = 5_000;
const REQUIRED_GATEWAY_UNITS = 10_000_000n;

const mockBullets = [
  "The paper frames paid access as an HTTP-level workflow: the agent discovers the price through a 402 challenge, then retries with an x402 payment.",
  "Circle Gateway makes the sub-cent unlock practical because the agent pays from a prepaid Gateway balance instead of sending gas for each read.",
  "The protected publisher can keep human previews public while charging autonomous clients for the full article or dataset payload.",
  "The Arc ledger proof gives the publisher an auditable trail for each nanopayment-backed unlock.",
];

const buttonBaseClass =
  "inline-flex min-h-11 items-center justify-center border px-4 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:border-[#cbd5df] disabled:bg-[#eef4f7] disabled:text-[#8a9aaa]";

const primaryButtonClass = `${buttonBaseClass} border-[#0f766e] bg-[#0f766e] text-white hover:bg-[#115e59]`;

const secondaryButtonClass = `${buttonBaseClass} border-[#cbd5df] bg-[#f7f9fb] text-[#315067] hover:border-[#0f766e] hover:bg-[#ecfdf5] hover:text-[#0f766e]`;

const quietButtonClass = `${buttonBaseClass} border-[#d8e1ea] bg-white text-[#526477] hover:border-[#b42318] hover:bg-[#fff1f2] hover:text-[#b42318]`;

function createMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function validPrivateKey(privateKey: string | null) {
  return Boolean(privateKey && /^0x[0-9a-fA-F]{64}$/.test(privateKey));
}

function shortAddress(value: string | null | undefined) {
  if (!value) return "pending";
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function gatewayReady(balances: SerializedBalances | null) {
  return Boolean(
    balances && BigInt(balances.gateway.availableUnits) >= REQUIRED_GATEWAY_UNITS,
  );
}

function walletFunded(balances: SerializedBalances | null) {
  return Boolean(
    balances && BigInt(balances.wallet.units) >= REQUIRED_GATEWAY_UNITS,
  );
}

async function postJson<T>(url: string, body?: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });

  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    code?: string;
  };

  if (!response.ok || data.ok === false) {
    const error = new Error(
      data.error ?? `Demo request failed with HTTP ${response.status}`,
    ) as ApiError;
    error.status = response.status;
    error.code = data.code;
    error.data = data;
    throw error;
  }

  return data as T;
}

export function DemoChatClient({ resource, faucetUrl }: DemoChatClientProps) {
  const [wallet, setWallet] = useState<WalletSession | null>(null);
  const [walletVersion, setWalletVersion] = useState(0);
  const [balances, setBalances] = useState<SerializedBalances | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatus>("creating");
  const [setupError, setSetupError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [depositLoading, setDepositLoading] = useState(false);
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoComplete, setDemoComplete] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const depositAttemptedRef = useRef(false);

  const articleUrl = resource.path;

  const addMessage = useCallback((message: Omit<ChatMessage, "id">) => {
    setMessages((current) => [
      ...current,
      {
        id: createMessageId(),
        ...message,
      },
    ]);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function createOrLoadWallet() {
      try {
        setSetupStatus("creating");
        const { generatePrivateKey, privateKeyToAccount } = await import(
          "viem/accounts"
        );
        let privateKey = window.localStorage.getItem(STORAGE_KEY);

        if (!validPrivateKey(privateKey)) {
          privateKey = generatePrivateKey();
          window.localStorage.setItem(STORAGE_KEY, privateKey);
        }

        const sessionPrivateKey = privateKey as `0x${string}`;
        const account = privateKeyToAccount(sessionPrivateKey);
        if (cancelled) return;

        setWallet({
          address: account.address,
          privateKey: sessionPrivateKey,
        });
        setMessages([
          {
            id: createMessageId(),
            role: "agent",
            text: "I created a local Arc Testnet wallet for this session.",
          },
          {
            id: createMessageId(),
            role: "agent",
            text: "Fund it with 10 USDC from the Circle faucet. Once the wallet receives funds, I will move 10 USDC into Gateway for nanopayments.",
          },
        ]);
      } catch (error) {
        if (!cancelled) {
          setSetupStatus("error");
          setSetupError((error as Error).message);
        }
      }
    }

    void createOrLoadWallet();

    return () => {
      cancelled = true;
    };
  }, [walletVersion]);

  const refreshBalances = useCallback(async () => {
    if (!wallet) return null;

    setBalanceLoading(true);
    try {
      const data = await postJson<BalanceResponse>("/api/demo/balances", {
        privateKey: wallet.privateKey,
      });
      setBalances(data.balances);
      setSetupError(null);
      setSetupStatus((current) => {
        if (current === "depositing") return current;
        if (gatewayReady(data.balances)) return "ready";
        if (walletFunded(data.balances)) return "funded";
        return "needs_faucet";
      });
      return data.balances;
    } catch (error) {
      setSetupStatus("error");
      setSetupError((error as Error).message);
      return null;
    } finally {
      setBalanceLoading(false);
    }
  }, [wallet]);

  const depositToGateway = useCallback(
    async (source: "auto" | "manual") => {
      if (!wallet || depositLoading) return;

      setDepositLoading(true);
      setSetupStatus("depositing");
      setSetupError(null);

      if (source === "auto") {
        addMessage({
          role: "agent",
          text: "I found the faucet funds. Depositing 10 USDC into Circle Gateway now.",
        });
      }

      try {
        const data = await postJson<DepositResponse>("/api/demo/deposit", {
          privateKey: wallet.privateKey,
        });
        setBalances(data.balances);
        setSetupStatus("ready");
        addMessage({
          role: "agent",
          text: data.skipped
            ? "Gateway already has 10 USDC available for nanopayments."
            : "10 USDC is now available in Gateway for nanopayments.",
          links: data.depositUrl
            ? [{ label: "Deposit transaction", href: data.depositUrl }]
            : undefined,
        });
      } catch (error) {
        const apiError = error as ApiError;
        const data = apiError.data as { balances?: SerializedBalances } | undefined;
        if (data?.balances) setBalances(data.balances);
        setSetupStatus(apiError.status === 409 ? "needs_faucet" : "error");
        setSetupError(apiError.message);
        depositAttemptedRef.current = false;
        addMessage({
          role: "agent",
          text: `I could not deposit to Gateway yet: ${apiError.message}`,
        });
      } finally {
        setDepositLoading(false);
      }
    },
    [addMessage, depositLoading, wallet],
  );

  useEffect(() => {
    if (!wallet) return;

    function pollBalances() {
      if (!document.hidden) {
        void refreshBalances();
      }
    }

    function handleVisibilityChange() {
      if (!document.hidden) {
        void refreshBalances();
      }
    }

    const initialRefresh = window.setTimeout(() => {
      pollBalances();
    }, 0);
    window.addEventListener("visibilitychange", handleVisibilityChange);
    const timer = window.setInterval(pollBalances, BALANCE_POLL_MS);

    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(timer);
      window.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshBalances, wallet]);

  useEffect(() => {
    if (
      !wallet ||
      !balances ||
      setupStatus !== "funded" ||
      depositAttemptedRef.current ||
      depositLoading
    ) {
      return;
    }

    depositAttemptedRef.current = true;
    void depositToGateway("auto");
  }, [balances, depositLoading, depositToGateway, setupStatus, wallet]);

  const resetWallet = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    depositAttemptedRef.current = false;
    setWallet(null);
    setBalances(null);
    setSetupError(null);
    setCopied(false);
    setDemoRunning(false);
    setDemoComplete(false);
    setMessages([]);
    setWalletVersion((current) => current + 1);
  }, []);

  const copyAddress = useCallback(async () => {
    if (!wallet) return;
    await navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }, [wallet]);

  const runDemo = useCallback(async () => {
    if (!wallet || demoRunning || !gatewayReady(balances)) return;

    setDemoRunning(true);
    setDemoComplete(false);
    addMessage({
      role: "user",
      text: "Analyze this research paper for me and give me the bullet points.",
    });
    await pause(450);
    addMessage({
      role: "agent",
      text: `Trying to analyze ${resource.title}.`,
      links: [{ label: articleUrl, href: articleUrl }],
    });

    try {
      await pause(650);
      const probe = await postJson<ProbeResponse>("/api/demo/probe");
      if (!probe.rejected) {
        throw new Error(
          `Expected HTTP 402 from ${probe.resource.path}, received ${probe.status}`,
        );
      }

      addMessage({
        role: "agent",
        text: `The article rejected my unpaid request with HTTP ${probe.status}. I will pay ${resource.priceUsdc} USDC to unlock it.`,
      });

      await pause(700);
      const paid = await postJson<PayResponse>("/api/demo/pay", {
        privateKey: wallet.privateKey,
      });

      addMessage({
        role: "agent",
        text: `Paid ${paid.amount} USDC and unlocked the article.`,
        links: [
          ...(paid.ledgerUrl
            ? [{ label: "Arc ledger proof", href: paid.ledgerUrl }]
            : []),
          ...(paid.paymentUrl
            ? [{ label: "Payment settlement", href: paid.paymentUrl }]
            : []),
        ],
      });

      await pause(650);
      addMessage({
        role: "agent",
        text: "Here are the bullet points.",
        bullets: mockBullets,
      });
      setDemoComplete(true);
      void refreshBalances();
    } catch (error) {
      addMessage({
        role: "agent",
        text: `I could not finish the unlock flow: ${(error as Error).message}`,
      });
    } finally {
      setDemoRunning(false);
    }
  }, [
    addMessage,
    articleUrl,
    balances,
    demoRunning,
    refreshBalances,
    resource.priceUsdc,
    resource.title,
    wallet,
  ]);

  const setupLabel = useMemo(() => {
    if (setupStatus === "creating") return "Creating wallet";
    if (setupStatus === "needs_faucet") return "Waiting for faucet";
    if (setupStatus === "funded") return "Funding Gateway";
    if (setupStatus === "depositing") return "Depositing 10 USDC";
    if (setupStatus === "ready") return "Ready";
    return "Needs attention";
  }, [setupStatus]);

  const gatewayAvailable = gatewayReady(balances);
  const canStartDemo = Boolean(wallet && gatewayAvailable && !demoRunning);
  const gatewayFunded = Boolean(wallet && gatewayAvailable) || demoComplete;
  const demoCtaLabel = demoRunning
    ? "Running"
    : demoComplete
      ? "Run Again"
      : "Start Demo";

  return (
    <main className="min-h-screen bg-[#f7f9fb] text-[#111827]">
      <header className="border-b border-[#cbd5df] bg-white">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between gap-4 px-5 sm:px-8">
          <Link
            href="/"
            className="whitespace-nowrap font-[var(--font-space-grotesk)] text-xl font-bold text-[#111827] transition-colors hover:text-[#0f766e] sm:text-2xl"
          >
            OK Computer
          </Link>
          <Link href="/dashboard" className={secondaryButtonClass}>
            View Dashboard
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-[1500px] px-5 py-6 sm:px-8">
        <div className="border border-[#cbd5df] bg-white px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-[820px]">
              <p className="text-sm font-extrabold uppercase text-[#315067]">
                Personal research agent
              </p>
              <h1 className="mt-3 font-[var(--font-space-grotesk)] text-4xl font-bold leading-tight text-[#0f172a] sm:text-5xl">
                Personal Agent Demo
              </h1>
              <p className="mt-4 max-w-[760px] text-lg leading-8 text-[#46586b]">
                Fund a session wallet, move USDC into Gateway, and run a paid
                article unlock from the same flow the dashboard tracks.
              </p>
            </div>

            <div className="grid w-full gap-3 sm:w-auto sm:min-w-[420px]">
              {gatewayFunded ? (
                <button
                  type="button"
                  onClick={() => void runDemo()}
                  disabled={!canStartDemo}
                  className={`${primaryButtonClass} min-h-14 justify-between px-5 text-left`}
                >
                  <span>{demoCtaLabel}</span>
                  <span className="font-[var(--font-space-grotesk)] text-xl">
                    -&gt;
                  </span>
                </button>
              ) : (
                <a
                  href={faucetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`${primaryButtonClass} min-h-14 justify-between px-5 text-left`}
                >
                  <span>Open Circle Faucet</span>
                  <span className="font-[var(--font-space-grotesk)] text-xl">
                    -&gt;
                  </span>
                </a>
              )}
              <button
                type="button"
                onClick={() => void refreshBalances()}
                disabled={!wallet || balanceLoading}
                className={secondaryButtonClass}
              >
                {balanceLoading ? "Checking Balance" : "Check Balance"}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Metric label="Wallet" value={wallet ? "Local" : "New"} />
            <Metric
              label="Gateway USDC"
              value={balances?.gateway.formattedAvailable ?? "0.00"}
            />
            <Metric label="Status" value={setupLabel} compact />
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[360px_1fr]">
          <aside className="space-y-5">
          <Panel title="Session Wallet">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-extrabold uppercase text-[#6b7d90]">
                  Arc Testnet address
                </p>
                <div className="mt-2 flex min-w-0 items-center gap-2 border border-[#e6edf3] bg-[#f7f9fb] p-3">
                  <p className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-[#111827]">
                    {wallet?.address ?? "creating..."}
                  </p>
                  <button
                    type="button"
                    onClick={copyAddress}
                    disabled={!wallet}
                    className="inline-flex h-8 shrink-0 items-center justify-center border border-[#cbd5df] bg-white px-3 text-xs font-bold text-[#315067] transition-colors hover:border-[#0f766e] hover:bg-[#ecfdf5] hover:text-[#0f766e] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <BalanceTile
                  label="Wallet USDC"
                  value={balances?.wallet.formatted ?? "0.00"}
                  active={walletFunded(balances)}
                />
                <BalanceTile
                  label="Gateway USDC"
                  value={balances?.gateway.formattedAvailable ?? "0.00"}
                  active={gatewayReady(balances)}
                />
              </div>

              <div className="space-y-2">
                <a
                  href={faucetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`${primaryButtonClass} w-full`}
                >
                  Open Circle Faucet
                </a>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void refreshBalances()}
                    disabled={!wallet || balanceLoading}
                    className={secondaryButtonClass}
                  >
                    {balanceLoading ? "Checking" : "Check"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void depositToGateway("manual")}
                    disabled={!wallet || depositLoading || gatewayReady(balances)}
                    className={secondaryButtonClass}
                  >
                    {depositLoading ? "Depositing" : "Deposit 10"}
                  </button>
                </div>
              </div>

              <div className="border border-dashed border-[#cbd5df] bg-[#f7f9fb] p-3 text-sm leading-6 text-[#526477]">
                Use Arc Testnet in the Circle faucet and send at least 10 USDC
                to this address. The private key is kept in localStorage under{" "}
                <span className="font-mono font-semibold text-[#111827]">
                  {STORAGE_KEY}
                </span>
                .
              </div>

              {setupError ? (
                <div className="border border-rose-300 bg-rose-50 p-3 text-sm font-semibold leading-6 text-rose-900">
                  {setupError}
                </div>
              ) : null}

              <button
                type="button"
                onClick={resetWallet}
                className={`${quietButtonClass} w-full`}
              >
                Reset session wallet
              </button>
            </div>
          </Panel>

          <Panel title="Locked Paper">
            <div className="space-y-4 text-sm leading-6 text-[#526477]">
              <p className="font-[var(--font-space-grotesk)] text-lg font-bold text-[#111827]">
                {resource.title}
              </p>
              <p className="inline-flex border border-[#0f766e] bg-[#f0fdfa] px-2.5 py-1 font-mono text-xs font-bold uppercase text-[#0f766e]">
                {resource.priceUsdc} USDC
              </p>
              <p className="truncate font-mono text-xs text-[#526477]">
                {articleUrl}
              </p>
              <a
                href={articleUrl}
                target="_blank"
                rel="noreferrer"
                className={`${secondaryButtonClass} w-full`}
              >
                Open Article
              </a>
            </div>
          </Panel>
        </aside>

        <section className="min-h-[680px] border border-[#cbd5df] bg-white">
          <div className="flex min-h-[680px] flex-col">
            <div className="border-b border-[#cbd5df] bg-[#eef4f7] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-mono text-xs font-bold uppercase text-[#315067]">
                    Personal research agent
                  </p>
                  <h2 className="mt-1 font-[var(--font-space-grotesk)] text-xl font-bold text-[#111827]">
                    Chat
                  </h2>
                </div>
                <span
                  className={`inline-flex h-8 items-center border px-3 font-mono text-xs font-bold ${
                    gatewayFunded
                      ? "border-[#0f766e] bg-[#f0fdfa] text-[#0f766e]"
                      : "border-[#f59e0b] bg-[#fffbeb] text-[#92400e]"
                  }`}
                >
                  {gatewayFunded ? "Gateway funded" : "Setup required"}
                </span>
              </div>
            </div>

            <div
              role="log"
              aria-live="polite"
              className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6"
            >
              {messages.map((message) => (
                <ChatBubble key={message.id} message={message} />
              ))}
            </div>

            <div className="border-t border-[#cbd5df] bg-[#f7f9fb] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-[#526477]">
                  {gatewayReady(balances)
                    ? "Gateway balance is ready for the paid article unlock."
                    : "Fund the wallet and Gateway before starting the chat demo."}
                </p>
                <button
                  type="button"
                  onClick={() => void runDemo()}
                  disabled={!canStartDemo}
                  className={`${primaryButtonClass} min-w-[150px]`}
                >
                  {demoCtaLabel}
                </button>
              </div>
            </div>
          </div>
        </section>
        </div>
      </section>
    </main>
  );
}

function pause(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function Metric({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className="min-h-[104px] border border-[#cbd5df] bg-[#f7f9fb] px-4 py-4">
      <div
        className={`truncate font-[var(--font-space-grotesk)] font-bold text-[#111827] ${
          compact ? "text-lg" : "text-3xl"
        }`}
        title={value}
      >
        {value}
      </div>
      <div className="mt-2 text-xs font-extrabold uppercase text-[#6b7d90]">
        {label}
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-[#cbd5df] bg-white p-4">
      <h2 className="mb-4 font-[var(--font-space-grotesk)] text-lg font-bold text-[#111827]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function BalanceTile({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div
      className={`border p-3 ${
        active
          ? "border-[#0f766e] bg-[#f0fdfa]"
          : "border-[#e6edf3] bg-[#f7f9fb]"
      }`}
    >
      <dt className="text-xs font-extrabold uppercase text-[#6b7d90]">
        {label}
      </dt>
      <dd
        className="mt-2 truncate font-mono text-lg font-semibold text-[#111827]"
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="mx-auto max-w-lg border border-[#e6edf3] bg-[#f7f9fb] px-4 py-3 text-center text-sm text-[#526477]">
        {message.text}
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[760px] border p-4 text-sm leading-6 ${
          isUser
            ? "border-[#0369a1] bg-[#eff6ff] text-[#0f172a]"
            : "border-[#e6edf3] bg-[#f7f9fb] text-[#111827]"
        }`}
      >
        <div className="mb-2 font-mono text-[11px] font-bold uppercase text-[#6b7d90]">
          {isUser ? "You" : "Agent"}
        </div>
        <p>{message.text}</p>
        {message.links?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.links.map((link) => (
              <a
                key={`${message.id}-${link.href}-${link.label}`}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="max-w-full truncate border border-[#cbd5df] bg-white px-3 py-1.5 font-mono text-xs font-semibold text-[#0f766e] transition-colors hover:border-[#0f766e] hover:bg-[#ecfdf5]"
                title={link.href}
              >
                {link.label || shortAddress(link.href)}
              </a>
            ))}
          </div>
        ) : null}
        {message.bullets?.length ? (
          <ul className="mt-4 space-y-3">
            {message.bullets.map((bullet) => (
              <li key={bullet} className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 bg-[#0f766e]" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
