import { notFound } from "next/navigation";

import { formatPrice, getResourceByPath } from "@/lib/resources";

type PremiumPreviewPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function PremiumPreviewPage({
  params,
}: PremiumPreviewPageProps) {
  const { slug } = await params;
  const resource = getResourceByPath(`/premium/${slug}`);

  if (!resource) {
    notFound();
  }

  const localUrl = `http://localhost:3000${resource.path}`;
  const gatewayExample = `import "dotenv/config";
import { GatewayClient } from "@circle-fin/x402-batching/client";

const client = new GatewayClient({
  chain: "arcTestnet",
  privateKey: process.env.AGENT_PRIVATE_KEYS!.split(",")[0],
  rpcUrl: process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network",
});

const result = await client.pay(${JSON.stringify(localUrl)}, {
  headers: {
    accept: "application/json",
    "x-agent-name": "ResearchBot",
  },
});

console.log(result.data);`;

  const requestDetails = [
    ["Method", "GET"],
    ["URL", localUrl],
    ["Resource path", resource.path],
    ["Network", "Arc Testnet"],
    ["Chain", "arcTestnet"],
    ["EIP-155 network", "eip155:5042002"],
    ["Price", `${formatPrice(resource.priceUsdc)} USDC`],
    ["Amount units", `${resource.amountUnits} USDC base units`],
    ["Accept", "application/json"],
    ["Agent header", "x-agent-name: ResearchBot"],
  ];

  return (
    <main className="min-h-screen bg-[#f5f3ed] px-5 py-10 text-zinc-950 sm:px-8">
      <section className="mx-auto max-w-5xl border-y border-zinc-300 py-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <article>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-emerald-700">
              OK Computer protected publisher
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-normal sm:text-5xl">
              {resource.title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-700">
              {resource.preview}
            </p>
            <p className="mt-8 max-w-2xl border-l-2 border-emerald-600 pl-5 text-base leading-7 text-zinc-700">
              Humans can browse previews. Agents, crawlers, scripts, and API
              clients receive HTTP 402 and must pay the listed USDC price to
              unlock the full resource.
            </p>

            <section className="mt-10">
              <div className="relative overflow-hidden border border-zinc-300 bg-white">
                <div className="space-y-5 p-6 blur-[5px] select-none sm:p-8">
                  <p className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
                    Full article
                  </p>
                  <h2 className="text-2xl font-semibold tracking-normal">
                    {String(resource.unlocked.title ?? resource.title)}
                  </h2>
                  <p className="text-lg leading-8 text-zinc-700">
                    {String(resource.unlocked.body ?? resource.preview)}
                  </p>
                  {"margin" in resource.unlocked ? (
                    <p className="border-l-2 border-zinc-300 pl-5 text-base leading-7 text-zinc-600">
                      {String(resource.unlocked.margin)}
                    </p>
                  ) : null}
                  {"signal" in resource.unlocked ? (
                    <p className="font-mono text-sm text-emerald-700">
                      signal: {String(resource.unlocked.signal)}
                    </p>
                  ) : null}
                </div>
                <div className="absolute inset-0 grid place-items-center bg-[#f5f3ed]/82 px-5 text-center backdrop-blur-[2px]">
                  <div className="max-w-md border border-zinc-300 bg-white p-6 shadow-lg shadow-zinc-950/10">
                    <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-700">
                      Locked article
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold tracking-normal">
                      Agent payment required
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-zinc-600">
                      Automated clients unlock this article by paying{" "}
                      <span className="font-mono text-zinc-950">
                        {formatPrice(resource.priceUsdc)} USDC
                      </span>{" "}
                      through x402 on Arc Testnet.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </article>

          <aside className="self-start border border-zinc-300 bg-white p-5 shadow-sm">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">
              Locked for automated clients
            </p>
            <p className="mt-4 text-3xl font-semibold">
              {formatPrice(resource.priceUsdc)} USDC
            </p>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              x402 payment required. Arc Testnet proof emitted after the
              nanopayment settles.
            </p>
          </aside>
        </div>

        <section className="mt-10 border border-zinc-300 bg-white">
          <div className="grid gap-0 lg:grid-cols-[320px_1fr]">
            <div className="border-b border-zinc-300 p-5 lg:border-r lg:border-b-0">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-700">
                Valid API unlock request
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-normal">
                Exact values for this article
              </h2>
              <dl className="mt-5 space-y-3">
                {requestDetails.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs uppercase tracking-[0.12em] text-zinc-500">
                      {label}
                    </dt>
                    <dd className="mt-1 break-words font-mono text-sm text-zinc-900">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="min-w-0 p-5">
              <p className="mb-3 text-sm leading-6 text-zinc-600">
                Run from a Node script with `AGENT_PRIVATE_KEYS` set to a funded
                Circle Gateway buyer key. The private key stays in `.env`.
              </p>
              <pre className="overflow-x-auto bg-[#101314] p-4 text-sm leading-6 text-zinc-100">
                <code>{gatewayExample}</code>
              </pre>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
