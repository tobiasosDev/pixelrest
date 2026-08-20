import { startXConnect } from "../../../../src/lib/x-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = new URL(req.url).searchParams.get("secret");
  if (!secret || provided !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const url = await startXConnect();
    return Response.redirect(url, 302);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "connect failed" },
      { status: 500 },
    );
  }
}
