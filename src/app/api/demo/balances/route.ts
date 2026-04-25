import {
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
    const balances = await client.getBalances();

    return Response.json({
      ok: true,
      address: client.address,
      balances: serializeBalances(balances),
    });
  } catch (error) {
    return demoErrorResponse(error);
  }
}
