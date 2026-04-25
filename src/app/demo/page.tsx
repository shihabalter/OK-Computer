import { DemoChatClient } from "@/components/demo-chat-client";
import { DEMO_RESOURCE_PATH } from "@/lib/demo-api";
import { getResourceByPath } from "@/lib/resources";

export const dynamic = "force-dynamic";

export default function DemoPage() {
  const resource = getResourceByPath(DEMO_RESOURCE_PATH);

  if (!resource) {
    throw new Error(`Demo resource is missing: ${DEMO_RESOURCE_PATH}`);
  }

  return (
    <DemoChatClient
      faucetUrl="https://faucet.circle.com"
      resource={{
        path: resource.path,
        title: resource.title,
        priceUsdc: resource.priceUsdc,
      }}
    />
  );
}
