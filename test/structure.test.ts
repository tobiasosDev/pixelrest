import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

async function read(path: string): Promise<string> {
  return Bun.file(resolve(root, path)).text();
}

describe("page structure", () => {
  test("the grid page exists with a square 3200px drawing surface", async () => {
    const html = await read("public/index.html");
    expect(html).toContain('id="board"');
    expect(html).toContain('width="3200"');
    expect(html).toContain('height="3200"');
    expect(html).toContain('id="grid-surface"');
    expect(html).toContain('data-canvas-size="3200"');
  });

  test("claim form takes a URL and description, not a logo file, and has no Stripe", async () => {
    const html = await read("public/index.html");
    expect(html).toMatch(/id="url"/);
    expect(html).toMatch(/type="url"/);
    expect(html).toMatch(/id="description"/);
    expect(html).not.toMatch(/type=["']file["']/);
    expect(html.toLowerCase()).not.toContain("stripe");
    expect(html.toLowerCase()).not.toContain("payment");
    expect(html).toContain("No image upload");
  });

  test("chrome uses Claim, inspects with Open link, and does not pin prices in the header", async () => {
    const html = await read("public/index.html");
    expect(html).toContain('id="tool-claim"');
    expect(html).toContain(">Claim<");
    expect(html).toContain("Open link");
    expect(html).toContain('id="tip-open"');
    expect(html).not.toContain('class="rates"');
    expect(html).not.toMatch(/<dt>Vacant<\/dt>/);
    expect(html).not.toContain('id="tool-select"');
    expect(html).toContain('class="dock"');
    const css = await read("public/styles.css");
    expect(css).toMatch(/input[\s\S]*font:[^;]*16px/);
    expect(css.includes("position: fixed")).toBe(true);
    expect(css).toMatch(/\.dock\s*\{[\s\S]*bottom:\s*0/);
    expect(css).toMatch(/#ticket\s*\{[\s\S]*pointer-events:\s*none/);
    expect(css).toMatch(/#ticket\.open\s*\{[\s\S]*pointer-events:\s*auto/);
    expect(html).not.toContain('class="lede"');
    expect(html).not.toContain("Tap a square");
    const src = await read("src/client.ts");
    expect(src).not.toContain("dragIsTouch");
    expect(src).toContain("tapCellSelection");
    expect(src).toContain("pinInspect");
    expect(src).toContain("cameraInsets");
    expect(src).toContain("fitCamera");
    expect(src).toContain("keepSelectionOnScreen");
    expect(src).toContain("fitToScreen");
    expect(src).toContain("claimRectFromAnchor");
  });

  test("Next.js loads the board script once after hydration", async () => {
    const page = await read("app/page.tsx");
    const layout = await read("app/layout.tsx");
    expect(page).toContain("__PIXELREST_GRID__");
    expect(page).toContain("next/script");
    expect(page).toContain('src="/app.js"');
    expect(page).toContain('strategy="afterInteractive"');
    expect(layout).not.toContain('src="/app.js"');
  });

  test("file: protocol explains how to serve instead of failing silently", async () => {
    const html = await read("public/index.html");
    expect(html).toContain('location.protocol === "file:"');
    expect(html).toContain("bun start");
    expect(html).toContain("http://localhost:3477");
  });
});

describe("same functions as the unit tests", () => {
  test("client wires pricing, claim, description, pan, zoom, and logo resolution", async () => {
    const src = await read("src/client.ts");
    expect(src).toContain("quoteRegion");
    expect(src).toContain("applyClaim");
    expect(src).toContain("lookupDescription");
    expect(src).toContain("panCamera");
    expect(src).toContain("zoomCamera");
    expect(src).toContain("resolveLogoFromHtml");
    expect(src).toContain("LONG_PRESS_MS");
    expect(src).not.toContain("module.exports");
    expect(src).not.toMatch(/\brequire\s*\(/);
  });

  test("bundled browser script has no module.exports or require", async () => {
    const result = await Bun.build({
      entrypoints: [resolve(root, "src/client.ts")],
      target: "browser",
      format: "esm",
      minify: false,
    });
    expect(result.success).toBe(true);
    const js = await result.outputs[0].text();
    expect(js.includes("module.exports")).toBe(false);
    expect(js.includes("require(")).toBe(false);
    expect(js).toContain("quoteRegion");
    expect(js).toContain("lookupDescription");
    expect(js).toContain("panCamera");
    expect(js).toContain("zoomCamera");
    expect(js).toContain("resolveLogoFromHtml");
  });

  test("file-protocol inline script runs with a window global and no module", async () => {
    const html = await read("public/index.html");
    const match = html.match(/<script>\s*([\s\S]*?)<\/script>/);
    expect(match).toBeTruthy();
    const banner = { hidden: true };
    const classList: string[] = [];
    const document = {
      getElementById: () => banner,
      documentElement: {
        classList: { add: (name: string) => classList.push(name) },
      },
    };
    const fn = new Function("location", "document", match![1]);
    fn({ protocol: "file:" }, document);
    expect(banner.hidden).toBe(false);
    expect(classList).toContain("file-protocol");
  });

  test("daily X cron is authorized and posts a square board image", async () => {
    const cron = await read("app/api/cron/daily/route.ts");
    const vercel = await read("vercel.json");
    expect(cron).toContain("CRON_SECRET");
    expect(cron).toContain("postImageTweet");
    expect(cron).toContain("renderBoardImage");
    expect(cron).toContain("buildDailyReport");
    expect(vercel).toContain("/api/cron/daily");
    expect(vercel).toContain("0 21 * * *");
  });

  test("checkout accepts a promotion code and fulfills zero-total sessions", async () => {
    const checkout = await read("app/api/checkout/route.ts");
    const webhook = await read("app/api/webhook/route.ts");
    expect(checkout).toContain("allow_promotion_codes: true");
    expect(webhook).toContain("no_payment_required");
    expect(webhook).toContain('payment_status !== "paid"');
  });

  test("server claim path uses applyClaim, quoteRegion, and logo fetch from the website URL", async () => {
    const src = await read("src/server.ts");
    expect(src).toContain("applyClaim");
    expect(src).toContain("quoteRegion");
    expect(src).toContain("fetchWebsiteLogo");
    expect(src.toLowerCase()).not.toContain("stripe");
    const fetchSrc = await read("src/fetch-logo.ts");
    expect(fetchSrc).toContain("resolveLogoFromHtml");
  });
});
