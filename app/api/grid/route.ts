import { loadSnapshot } from "../../../src/lib/grid-db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await loadSnapshot());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "grid failed" },
      { status: 500 },
    );
  }
}
