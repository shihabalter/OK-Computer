import {
  DEMO_GATEWAY_DEPOSIT_UNITS,
  DEMO_GATEWAY_DEPOSIT_USDC,
  arcTxUrl,
  createDemoGatewayClient,
  demoErrorResponse,
  parseDemoPrivateKey,
  readDemoBody,
  serializeBalances,
} from "@/lib/demo-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const privateKey = parseDemoPrivateKey(await readDemoBody(request));
    const client = createDemoGatewayClient(privateKey);
    const before = await client.getBalances();

    if (before.gateway.available >= DEMO_GATEWAY_DEPOSIT_UNITS) {
      return Response.json({
        ok: true,
        skipped: true,
        address: client.address,
        amount: DEMO_GATEWAY_DEPOSIT_USDC,
        balances: serializeBalances(before),
      });
    }

    if (before.wallet.balance < DEMO_GATEWAY_DEPOSIT_UNITS) {
      return Response.json(
        {
          ok: false,
          code: "INSUFFICIENT_WALLET_USDC",
          error: `Wallet needs at least ${DEMO_GATEWAY_DEPOSIT_USDC} USDC from the Circle faucet before Gateway deposit.`,
          address: client.address,
          balances: serializeBalances(before),
        },
        { status: 409 },
      );
    }

    const deposit = await client.deposit(DEMO_GATEWAY_DEPOSIT_USDC);
    const after = await client.getBalances();

    return Response.json({
      ok: true,
      skipped: false,
      address: client.address,
      amount: deposit.formattedAmount,
      amountUnits: deposit.amount.toString(),
      depositor: deposit.depositor,
      approvalTxHash: deposit.approvalTxHash ?? null,
      approvalUrl: arcTxUrl(deposit.approvalTxHash),
      depositTxHash: deposit.depositTxHash,
      depositUrl: arcTxUrl(deposit.depositTxHash),
      balances: serializeBalances(after),
    });
  } catch (error) {
    return demoErrorResponse(error);
  }
}
