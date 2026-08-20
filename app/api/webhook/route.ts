import { fulfillPaidClaim } from "../../../src/lib/grid-db";
import { stripeClient } from "../../../src/lib/stripe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ error: "webhook secret missing" }, { status: 500 });
  }
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return Response.json({ error: "missing signature" }, { status: 400 });
  }
  let event;
  try {
    event = stripeClient().webhooks.constructEvent(raw, sig, secret);
  } catch {
    return Response.json({ error: "invalid signature" }, { status: 400 });
  }
  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return Response.json({ received: true });
  }
  const session = event.data.object as {
    id: string;
    payment_status?: string;
    customer_details?: { email?: string | null };
    metadata?: Record<string, string>;
    payment_intent?: string | null;
  };
  if (session.payment_status === "unpaid") {
    return Response.json({ received: true });
  }
  const meta = session.metadata ?? {};
  const rect = {
    x: Number(meta.x) || 0,
    y: Number(meta.y) || 0,
    width: Number(meta.width) || 0,
    height: Number(meta.height) || 0,
  };
  const result = await fulfillPaidClaim({
    stripeSessionId: session.id,
    rect,
    url: meta.url ?? "",
    description: meta.description ?? "",
    ownerEmail: session.customer_details?.email ?? null,
  });
  if (!result.ok && result.reason === "taken" && session.payment_intent) {
    await stripeClient().refunds.create({
      payment_intent: session.payment_intent,
    });
  }
  return Response.json({ received: true, result });
}
