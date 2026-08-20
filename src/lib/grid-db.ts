import {
  clipRect,
  createGrid,
  DEFAULT_CELL_SIZE,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  gridFromOccupied,
  listCellsInRect,
  VACANT_PRICE,
  type Quote,
  type Rect,
} from "./board";
import { snapshot, type GridSnapshot } from "./persist";
import { fetchWebsiteLogo } from "../fetch-logo";
import { supabaseAdmin } from "./supabase";

export function emptySnapshot(): GridSnapshot {
  return snapshot(createGrid());
}

export async function quoteRect(rect: Rect): Promise<{ rect: Rect; quote: Quote }> {
  const clipped = clipRect(rect, DEFAULT_COLS, DEFAULT_ROWS);
  if (!clipped) {
    return {
      rect: { x: 0, y: 0, width: 0, height: 0 },
      quote: {
        vacantCount: 0,
        occupiedCount: 0,
        cellCount: 0,
        total: 0,
        claimable: false,
      },
    };
  }
  const admin = supabaseAdmin();
  const { count, error } = await admin
    .from("occupancy")
    .select("*", { count: "exact", head: true })
    .gte("x", clipped.x)
    .lt("x", clipped.x + clipped.width)
    .gte("y", clipped.y)
    .lt("y", clipped.y + clipped.height);
  if (error) {
    throw error;
  }
  const occupiedCount = count ?? 0;
  const cellCount = clipped.width * clipped.height;
  const vacantCount = cellCount - occupiedCount;
  const claimable = occupiedCount === 0 && vacantCount > 0;
  return {
    rect: clipped,
    quote: {
      vacantCount,
      occupiedCount,
      cellCount,
      total: claimable ? vacantCount * VACANT_PRICE : 0,
      claimable,
    },
  };
}

export async function loadSnapshot(): Promise<GridSnapshot> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("occupancy")
    .select("x,y,claim_id,claims(id,url,description,logo_url)");
  if (error) {
    throw error;
  }
  const occupied = (data ?? []).flatMap((row) => {
    const claim = Array.isArray(row.claims) ? row.claims[0] : row.claims;
    if (!claim) {
      return [];
    }
    return [
      {
        x: row.x as number,
        y: row.y as number,
        claimId: (claim as { id: string }).id,
        url: (claim as { url: string }).url,
        description: (claim as { description: string }).description,
        logoUrl: (claim as { logo_url: string | null }).logo_url,
      },
    ];
  });
  return snapshot(
    gridFromOccupied({
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
      cellSize: DEFAULT_CELL_SIZE,
      occupied,
    }),
  );
}

async function uploadLogo(
  claimId: string,
  websiteUrl: string,
): Promise<string | null> {
  const fetched = await fetchWebsiteLogo(websiteUrl);
  if (!fetched) {
    return null;
  }
  const admin = supabaseAdmin();
  const path = `${claimId}.${fetched.extension}`;
  const { error } = await admin.storage.from("logos").upload(path, fetched.bytes, {
    contentType: fetched.contentType,
    upsert: true,
  });
  if (error) {
    return null;
  }
  const { data } = admin.storage.from("logos").getPublicUrl(path);
  return data.publicUrl ?? null;
}

export async function fulfillPaidClaim(options: {
  stripeSessionId: string;
  rect: Rect;
  url: string;
  description: string;
  ownerEmail: string | null;
}): Promise<{ ok: true } | { ok: false; reason: "taken" | "duplicate" }> {
  const admin = supabaseAdmin();
  const { data: existing } = await admin
    .from("claims")
    .select("id")
    .eq("stripe_session_id", options.stripeSessionId)
    .maybeSingle();
  if (existing) {
    return { ok: true };
  }
  const { quote, rect } = await quoteRect(options.rect);
  if (!quote.claimable) {
    return { ok: false, reason: "taken" };
  }
  const claimId = crypto.randomUUID();
  const logoUrl = await uploadLogo(claimId, options.url);
  const { error: claimError } = await admin.from("claims").insert({
    id: claimId,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    url: options.url,
    description: options.description,
    logo_url: logoUrl,
    owner_email: options.ownerEmail,
    stripe_session_id: options.stripeSessionId,
  });
  if (claimError) {
    if (claimError.code === "23505") {
      return { ok: true };
    }
    throw claimError;
  }
  const rows = listCellsInRect(rect).map((cell) => ({
    x: cell.x,
    y: cell.y,
    claim_id: claimId,
  }));
  const { error: occError } = await admin.from("occupancy").insert(rows);
  if (occError) {
    await admin.from("claims").delete().eq("id", claimId);
    return { ok: false, reason: "taken" };
  }
  await admin
    .from("pending_checkouts")
    .delete()
    .eq("stripe_session_id", options.stripeSessionId);
  return { ok: true };
}
