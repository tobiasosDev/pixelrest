import { isVisitorId } from "../../../src/lib/hud";
import {
  heartbeatVisitor,
  loadHolders,
  readPresenceCounts,
} from "../../../src/lib/presence";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = {
  "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
  "cdn-cache-control": "no-store",
  "vercel-cdn-cache-control": "no-store",
};

async function body(live: number, today: number) {
  return {
    live,
    today,
    holders: await loadHolders(),
  };
}

export async function GET() {
  try {
    const counts = await readPresenceCounts();
    return Response.json(await body(counts.live, counts.today), {
      headers: NO_STORE,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "presence failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as { visitorId?: unknown };
    if (!isVisitorId(payload.visitorId)) {
      return Response.json(
        { error: "invalid visitor" },
        { status: 400, headers: NO_STORE },
      );
    }
    const counts = await heartbeatVisitor(payload.visitorId);
    return Response.json(await body(counts.live, counts.today), {
      headers: NO_STORE,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "presence failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
