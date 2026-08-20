import { quoteRect } from "../../../src/lib/grid-db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  try {
    const result = await quoteRect({
      x: Number(body.x) || 0,
      y: Number(body.y) || 0,
      width: Number(body.width) || 0,
      height: Number(body.height) || 0,
    });
    if (!result.rect.width) {
      return Response.json(
        { error: "Select at least one square." },
        { status: 400 },
      );
    }
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "quote failed" },
      { status: 500 },
    );
  }
}
