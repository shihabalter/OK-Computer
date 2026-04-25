import "dotenv/config";

const baseUrl = process.env.DEMO_BASE_URL ?? "http://localhost:3000";

async function main() {
  const response = await fetch(`${baseUrl}/api/dashboard/reset`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      `Reset failed with status ${response.status}: ${await response.text()}`,
    );
  }

  console.log("OK Computer dashboard events cleared. Chain state was not changed.");
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
