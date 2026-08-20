import { quoteRect } from "../../../src/lib/grid-db";
import { supabaseAdmin } from "../../../src/lib/supabase";
import { siteUrl, stripeClient } from "../../../src/lib/stripe";
import { normalizeWebsiteUrl } from "../../../src/lib/url";
import { VACANT_PRICE } from "../../../src/lib/board";

export const dynamic = "force-dynamic";

function integrationId(): string {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `pixelrest_${suffix}`;
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    url?: unknown;
    description?: unknown;
    file?: unknown;
    logo?: unknown;
  };
  if (body.file !== undefined || body.logo !== undefined) {
    return Response.json(
      { error: "Do not upload an image. Paste a website URL." },
      { status: 400 },
    );
  }
  if (typeof body.url !== "string") {
    return Response.json({ error: "Paste a website URL." }, { status: 400 });
  }
  if (typeof body.description !== "string" || !body.description.trim()) {
    return Response.json(
      { error: "Add a short description." },
      { status: 400 },
    );
  }
  let websiteUrl: string;
  try {
    websiteUrl = normalizeWebsiteUrl(body.url);
  } catch {
    return Response.json({ error: "That URL is not valid." }, { status: 400 });
  }
  const description = body.description.trim().slice(0, 280);
  try {
    const { rect, quote } = await quoteRect({
      x: Number(body.x) || 0,
      y: Number(body.y) || 0,
      width: Number(body.width) || 0,
      height: Number(body.height) || 0,
    });
    if (!quote.claimable) {
      return Response.json(
        { error: "Those squares are taken. Pick empty ones." },
        { status: 400 },
      );
    }
    const origin = siteUrl();
    const session = await stripeClient().checkout.sessions.create({
      mode: "payment",
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cancel`,
      line_items: [
        {
          quantity: quote.vacantCount,
          price_data: {
            currency: "usd",
            unit_amount: VACANT_PRICE * 100,
            product_data: {
              name: "Pixelrest square",
              description: `${quote.vacantCount} squares on the board`,
            },
          },
        },
      ],
      metadata: {
        x: String(rect.x),
        y: String(rect.y),
        width: String(rect.width),
        height: String(rect.height),
        url: websiteUrl,
        description,
      },
      integration_identifier: integrationId(),
    });
    if (!session.id || !session.url) {
      return Response.json({ error: "Checkout did not start." }, { status: 500 });
    }
    const admin = supabaseAdmin();
    await admin.from("pending_checkouts").insert({
      stripe_session_id: session.id,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      url: websiteUrl,
      description,
      square_count: quote.vacantCount,
      amount_cents: quote.total * 100,
    });
    return Response.json({ checkoutUrl: session.url });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "checkout failed" },
      { status: 500 },
    );
  }
}
