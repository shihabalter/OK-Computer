import {
  createGatewayMiddleware,
  type PaymentRequest,
  type PaymentResponse,
} from "@circle-fin/x402-batching/server";

import {
  createPendingPayment,
  markPaymentLedgerFailed,
  markPaymentLedgered,
  recordBlockedAccess,
} from "./db";
import { isLedgerConfigured, recordAccessOnLedger } from "./ledger";
import { formatPrice, type ProtectedResource } from "./resources";

type PaidRequest = {
  url?: string;
  headers: Record<string, string | undefined>;
  payment?: {
    verified: boolean;
    payer: string;
    amount: string;
    network: string;
    transaction?: string;
  };
};

class GatewayResponse {
  statusCode = 200;
  readonly headers = new Headers();
  private body = "";
  private didEnd = false;

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string | number | readonly string[]) {
    this.headers.set(name, Array.isArray(value) ? value.join(", ") : String(value));
  }

  end(body?: string | Buffer) {
    this.didEnd = true;
    this.body = Buffer.isBuffer(body) ? body.toString("utf8") : (body ?? "");
  }

  json(data: unknown) {
    this.setHeader("Content-Type", "application/json");
    this.end(JSON.stringify(data));
  }

  get ended() {
    return this.didEnd;
  }

  toResponse() {
    return new Response(this.body, {
      status: this.statusCode,
      headers: this.headers,
    });
  }
}

function requestHeaders(request: Request) {
  const headers: Record<string, string> = {};

  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  return headers;
}

function agentName(request: Request) {
  return request.headers.get("x-agent-name") ?? "UnknownBot";
}

function getResourceUrl(request: Request) {
  return request.headers.get("x-ok-original-path") ?? new URL(request.url).pathname;
}

function createGateway(resource: ProtectedResource) {
  const sellerAddress = process.env.SELLER_ADDRESS;

  if (!sellerAddress) {
    return null;
  }

  return createGatewayMiddleware({
    sellerAddress,
    networks: ["eip155:5042002"],
    facilitatorUrl:
      process.env.CIRCLE_GATEWAY_FACILITATOR_URL ??
      "https://gateway-api-testnet.circle.com",
    description: `OK Computer protected resource ${resource.path}`,
  });
}

async function requirePayment(request: Request, resource: ProtectedResource) {
  const gateway = createGateway(resource);

  if (!gateway) {
    return {
      response: Response.json(
        {
          error: "OK Computer payment middleware is not configured",
          resource: resource.path,
          missing: ["SELLER_ADDRESS"],
        },
        { status: 503 },
      ),
    };
  }

  const gatewayRequest: PaidRequest = {
    url: getResourceUrl(request),
    headers: requestHeaders(request),
  };
  const gatewayResponse = new GatewayResponse();
  let nextCalled = false;
  let nextError: unknown;

  await gateway.require(formatPrice(resource.priceUsdc))(
    gatewayRequest as unknown as PaymentRequest,
    gatewayResponse as unknown as PaymentResponse,
    (error?: unknown) => {
      nextCalled = true;
      nextError = error;
    },
  );

  if (nextError) {
    throw nextError;
  }

  if (!nextCalled || gatewayResponse.ended) {
    return { response: gatewayResponse.toResponse() };
  }

  return {
    payment: gatewayRequest.payment,
    headers: gatewayResponse.headers,
  };
}

export async function handleProtectedResource(
  request: Request,
  resource: ProtectedResource,
) {
  try {
    if (
      !request.headers.get("payment-signature") &&
      request.headers.get("x-demo-refusal") === "true"
    ) {
      recordBlockedAccess({
        agent: agentName(request),
        resourcePath: resource.path,
        priceUsdc: resource.priceUsdc,
        message: "Refused x402 payment after receiving 402 challenge",
      });
    }

    const paymentResult = await requirePayment(request, resource);
    if ("response" in paymentResult) {
      return paymentResult.response;
    }

    const payment = paymentResult.payment;
    if (!payment?.verified) {
      return Response.json(
        {
          error: "Payment middleware did not attach a verified payment",
          resource: resource.path,
        },
        { status: 500 },
      );
    }

    const eventId = createPendingPayment({
      agent: agentName(request),
      resourcePath: resource.path,
      priceUsdc: resource.priceUsdc,
      amountUnits: Number(payment.amount),
      payer: payment.payer,
      network: payment.network,
      paymentTx: payment.transaction ?? null,
    });

    let ledgerTx: string | null = null;
    if (isLedgerConfigured()) {
      try {
        ledgerTx = await recordAccessOnLedger(resource.path, payment.amount);
      } catch (ledgerError) {
        const message = (ledgerError as Error).message;
        markPaymentLedgerFailed(eventId, message);

        return Response.json(
          {
            error: "Payment settled, but Arc AccessLedger proof failed",
            resource: resource.path,
            message,
          },
          { status: 502, headers: paymentResult.headers },
        );
      }
    }

    markPaymentLedgered(eventId, ledgerTx);

    return Response.json(
      {
        ok: true,
        app: "OK Computer",
        resource: resource.path,
        price: `${formatPrice(resource.priceUsdc)} USDC`,
        paidBy: payment.payer,
        paymentTx: payment.transaction,
        ledgerTx,
        content: resource.unlocked,
      },
      { headers: paymentResult.headers },
    );
  } catch (error) {
    return Response.json(
      {
        error: "Payment processing error",
        message: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
