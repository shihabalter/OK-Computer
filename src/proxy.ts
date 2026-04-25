import { NextResponse, type NextRequest } from "next/server";

function isAutomatedRequest(request: NextRequest) {
  if (request.headers.get("payment-signature")) return true;
  if (request.headers.get("x-agent-name")) return true;

  const accept = request.headers.get("accept") ?? "";
  const userAgent = request.headers.get("user-agent") ?? "";
  const botLike =
    /bot|crawler|curl|node|undici|axios|fetch|python|httpie|postman/i.test(
      userAgent,
    );

  return botLike || !accept.includes("text/html");
}

export function proxy(request: NextRequest) {
  if (!isAutomatedRequest(request)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `/api/protected${request.nextUrl.pathname}`;

  const headers = new Headers(request.headers);
  headers.set("x-ok-original-path", request.nextUrl.pathname);

  return NextResponse.rewrite(url, {
    request: {
      headers,
    },
  });
}

export const config = {
  matcher: ["/premium/:path*"],
};
