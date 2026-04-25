import { getDashboardSnapshot, resetDemoEvents } from "@/lib/db";
import { handleProtectedResource } from "@/lib/protected-resource";
import { getResourceByPath } from "@/lib/resources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ApiRouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

function apiPath(path: string[]) {
  return `/api/${path.join("/")}`;
}

function premiumResourcePath(request: Request, path: string[]) {
  return (
    request.headers.get("x-ok-original-path") ??
    `/premium/${path.slice(2).join("/")}`
  );
}

export async function GET(request: Request, { params }: ApiRouteContext) {
  const { path } = await params;
  const pathname = apiPath(path);

  if (pathname === "/api/dashboard") {
    return Response.json(getDashboardSnapshot());
  }

  if (path[0] === "protected" && path[1] === "premium") {
    const resource = getResourceByPath(premiumResourcePath(request, path));

    if (!resource) {
      return Response.json({ error: "Resource not found" }, { status: 404 });
    }

    return handleProtectedResource(request, resource);
  }

  const resource = getResourceByPath(pathname);
  if (resource) {
    return handleProtectedResource(request, resource);
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}

export async function POST(_request: Request, { params }: ApiRouteContext) {
  const { path } = await params;

  if (apiPath(path) === "/api/dashboard/reset") {
    resetDemoEvents();

    return Response.json({
      ok: true,
      message: "Dashboard events cleared. Chain state was not changed.",
    });
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
