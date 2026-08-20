import { gridFromOccupied } from "../../../../src/lib/board";
import { renderBoardImage } from "../../../../src/lib/board-image";
import { buildDailyReport } from "../../../../src/lib/daily-report";
import {
  listClaims,
  loadDailyPost,
  loadSnapshot,
  occupancyCount,
  saveDailyPost,
} from "../../../../src/lib/grid-db";
import { resolveXCredentials } from "../../../../src/lib/x-auth";
import { postImageTweet } from "../../../../src/lib/x-post";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}

async function run(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const preview = url.searchParams.get("preview") === "1";
  const force = url.searchParams.get("force") === "1";
  const now = new Date();
  const claims = await listClaims();
  const occupiedSquares = await occupancyCount();
  const report = buildDailyReport({ claims, occupiedSquares, now });
  const existing = await loadDailyPost(report.dayKey);
  if (existing?.tweetId && !force && !preview) {
    return Response.json({
      skipped: true,
      reason: "already posted",
      dayKey: report.dayKey,
      tweetId: existing.tweetId,
    });
  }
  const snapshot = await loadSnapshot();
  const grid = gridFromOccupied(snapshot);
  const image = await renderBoardImage({
    grid,
    newClaimIds: report.newClaims.map((claim) => claim.id),
    title: "PIXELREST",
    dateLabel: report.dateLabel,
    footer:
      report.newClaims.length === 0
        ? `${report.openSquares.toLocaleString("en-US")} open`
        : `${report.newClaims.length} new · ${report.occupiedSquares.toLocaleString("en-US")} occupied`,
  });
  if (preview) {
    return new Response(new Uint8Array(image), {
      headers: {
        "content-type": "image/png",
        "cache-control": "no-store",
      },
    });
  }
  const credentials = await resolveXCredentials();
  if (!credentials) {
    return Response.json(
      { error: "X API credentials are missing", dayKey: report.dayKey },
      { status: 503 },
    );
  }
  const posted = await postImageTweet({
    text: report.tweet,
    image,
    credentials,
  });
  await saveDailyPost({
    dayKey: report.dayKey,
    tweetId: posted.id,
    body: report.tweet,
    newClaimIds: report.newClaims.map((claim) => claim.id),
    occupiedCount: report.occupiedSquares,
  });
  return Response.json({
    ok: true,
    dayKey: report.dayKey,
    tweetId: posted.id,
    newApps: report.newClaims.length,
  });
}
