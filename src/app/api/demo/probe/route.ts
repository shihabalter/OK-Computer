import {
  DEMO_AGENT_NAME,
  demoErrorResponse,
  getDemoResource,
  getRequestOrigin,
} from "@/lib/demo-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const resource = getDemoResource();
    const response = await fetch(`${getRequestOrigin(request)}${resource.path}`, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        "x-agent-name": DEMO_AGENT_NAME,
        "x-demo-refusal": "true",
        "x-demo-run": "website",
      },
    });

    return Response.json({
      ok: response.status === 402,
      status: response.status,
      rejected: response.status === 402,
      paymentRequired: response.headers.has("payment-required"),
      resource: {
        path: resource.path,
        title: resource.title,
        priceUsdc: resource.priceUsdc,
      },
    });
  } catch (error) {
    return demoErrorResponse(error);
  }
}
