import { PROTECTED_RESOURCES } from "@/lib/resources";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    app: "OK Computer",
    protectedResources: PROTECTED_RESOURCES.length,
  });
}
