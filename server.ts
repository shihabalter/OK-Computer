import "dotenv/config";

import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import next from "next";

import {
  createPendingPayment,
  markPaymentLedgerFailed,
  markPaymentLedgered,
  recordBlockedAccess,
} from "./src/lib/db";
import { recordAccessOnLedger } from "./src/lib/ledger";
import {
  PROTECTED_RESOURCES,
  formatPrice,
  getResourceByPath,
  type ProtectedResource,
} from "./src/lib/resources";

type PaidRequest = Request & {
  payment?: {
    verified: boolean;
    payer: string;
    amount: string;
    network: string;
    transaction?: string;
  };
};

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME ?? "localhost";
const dev = process.env.NODE_ENV !== "production";

const nextApp = next({
  dev,
  hostname,
  port,
  webpack: true,
});
const handle = nextApp.getRequestHandler();

function isAutomatedRequest(req: Request) {
  if (req.header("payment-signature")) return true;
  if (req.header("x-agent-name")) return true;

  const accept = req.header("accept") ?? "";
  const userAgent = req.header("user-agent") ?? "";
  const botLike =
    /bot|crawler|curl|node|undici|axios|fetch|python|httpie|postman/i.test(
      userAgent,
    );

  return botLike || !accept.includes("text/html");
}

function humanPreviewBypass(req: Request, _res: Response, nextFn: NextFunction) {
  if (!isAutomatedRequest(req)) {
    nextFn("route");
    return;
  }

  nextFn();
}

function agentName(req: Request) {
  return req.header("x-agent-name") ?? "UnknownBot";
}

function logIntentionalRefusal(resource: ProtectedResource): RequestHandler {
  return (req, _res, nextFn) => {
    if (
      !req.header("payment-signature") &&
      req.header("x-demo-refusal") === "true"
    ) {
      recordBlockedAccess({
        agent: agentName(req),
        resourcePath: resource.path,
        priceUsdc: resource.priceUsdc,
        message: "Refused x402 payment after receiving 402 challenge",
      });
    }

    nextFn();
  };
}

function missingPaymentConfig(resource: ProtectedResource): RequestHandler {
  return (_req, res) => {
    res.status(503).json({
      error: "OK Computer payment middleware is not configured",
      resource: resource.path,
      missing: ["SELLER_ADDRESS"],
    });
  };
}

function createPaymentMiddleware(resource: ProtectedResource): RequestHandler {
  const sellerAddress = process.env.SELLER_ADDRESS;

  if (!sellerAddress) {
    return missingPaymentConfig(resource);
  }

  const gateway = createGatewayMiddleware({
    sellerAddress,
    networks: ["eip155:5042002"],
    facilitatorUrl:
      process.env.CIRCLE_GATEWAY_FACILITATOR_URL ??
      "https://gateway-api-testnet.circle.com",
    description: `OK Computer protected resource ${resource.path}`,
  });

  return gateway.require(formatPrice(resource.priceUsdc)) as unknown as RequestHandler;
}

function servePaidResource(resource: ProtectedResource): RequestHandler {
  return async (req: PaidRequest, res, nextFn) => {
    try {
      const payment = req.payment;

      if (!payment?.verified) {
        res.status(500).json({
          error: "Payment middleware did not attach a verified payment",
          resource: resource.path,
        });
        return;
      }

      const eventId = createPendingPayment({
        agent: agentName(req),
        resourcePath: resource.path,
        priceUsdc: resource.priceUsdc,
        amountUnits: Number(payment.amount),
        payer: payment.payer,
        network: payment.network,
        paymentTx: payment.transaction ?? null,
      });

      try {
        const ledgerTx = await recordAccessOnLedger(resource.path, payment.amount);
        markPaymentLedgered(eventId, ledgerTx);

        res.json({
          ok: true,
          app: "OK Computer",
          resource: resource.path,
          price: `${formatPrice(resource.priceUsdc)} USDC`,
          paidBy: payment.payer,
          paymentTx: payment.transaction,
          ledgerTx,
          content: resource.unlocked,
        });
      } catch (ledgerError) {
        const message = (ledgerError as Error).message;
        markPaymentLedgerFailed(eventId, message);
        res.status(502).json({
          error: "Payment settled, but Arc AccessLedger proof failed",
          resource: resource.path,
          message,
        });
      }
    } catch (error) {
      nextFn(error);
    }
  };
}

function registerProtectedRoutes(server: express.Express) {
  for (const resource of PROTECTED_RESOURCES) {
    const routeHandlers: RequestHandler[] = [
      logIntentionalRefusal(resource),
      createPaymentMiddleware(resource),
      servePaidResource(resource),
    ];

    if (resource.path.startsWith("/premium/")) {
      server.get(resource.path, humanPreviewBypass, ...routeHandlers);
    } else {
      server.get(resource.path, ...routeHandlers);
    }
  }
}

async function main() {
  await nextApp.prepare();

  const server = express();
  server.disable("x-powered-by");

  registerProtectedRoutes(server);

  server.get("/health", (_req, res) => {
    res.json({
      ok: true,
      app: "OK Computer",
      protectedResources: PROTECTED_RESOURCES.length,
    });
  });

  server.use((req, res) => {
    const knownResource = getResourceByPath(req.path);
    if (knownResource && isAutomatedRequest(req)) {
      res.status(404).json({
        error: "Protected resource exists but no handler matched",
        resource: knownResource.path,
      });
      return;
    }

    void handle(req, res);
  });

  server.listen(port, () => {
    console.log(`OK Computer listening at http://${hostname}:${port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
