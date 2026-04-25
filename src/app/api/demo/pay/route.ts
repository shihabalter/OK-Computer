import {
  DEMO_AGENT_NAME,
  arcTxUrl,
  createDemoGatewayClient,
  demoErrorResponse,
  getDemoResource,
  getRequestOrigin,
  parseDemoPrivateKey,
  readDemoBody,
} from "@/lib/demo-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PaidResourceResponse = {
  ok?: boolean;
  resource?: string;
  price?: string;
  paidBy?: string;
  paymentTx?: string;
  ledgerTx?: string;
  content?: Record<string, unknown>;
};

export async function POST(request: Request) {
  try {
    const privateKey = parseDemoPrivateKey(await readDemoBody(request));
    const resource = getDemoResource();
    const client = createDemoGatewayClient(privateKey);
    const result = await client.pay<PaidResourceResponse>(
      `${getRequestOrigin(request)}${resource.path}`,
      {
        headers: {
          accept: "application/json",
          "x-agent-name": DEMO_AGENT_NAME,
          "x-demo-run": "website",
          "x-demo-index": "research-paper",
        },
      },
    );

    const ledgerTx =
      typeof result.data.ledgerTx === "string" ? result.data.ledgerTx : null;

    return Response.json({
      ok: true,
      status: result.status,
      resource: {
        path: resource.path,
        title: resource.title,
        priceUsdc: resource.priceUsdc,
      },
      amount: result.formattedAmount,
      amountUnits: result.amount.toString(),
      payer: result.data.paidBy ?? client.address,
      paymentTx: result.transaction,
      paymentUrl: arcTxUrl(result.transaction),
      ledgerTx,
      ledgerUrl: arcTxUrl(ledgerTx),
      content: result.data.content ?? null,
    });
  } catch (error) {
    return demoErrorResponse(error);
  }
}
