import { loadSnapshot } from "../../../src/lib/grid-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = {
  "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
  "cdn-cache-control": "no-store",
  "vercel-cdn-cache-control": "no-store",
};

export async function GET() {
  try {
    return Response.json(await loadSnapshot(), { headers: NO_STORE });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "grid failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
