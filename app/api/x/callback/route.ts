import {
  finishXConnect,
  finishXConnectOAuth2,
  xCallbackUrl,
} from "../../../../src/lib/x-auth";

export const dynamic = "force-dynamic";

function page(title: string, body: string): Response {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { margin: 0; min-height: 100dvh; background: #0a0a0a; color: #eaeaea; font-family: ui-monospace, monospace; display: grid; place-items: center; padding: 24px; }
      main { max-width: 42rem; }
      p { line-height: 1.5; }
      code { color: #8a8a8a; }
    </style>
  </head>
  <body>
    <main>
      <p>PIXELREST</p>
      ${body}
    </main>
  </body>
</html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const oauthToken = url.searchParams.get("oauth_token");
  const oauthVerifier = url.searchParams.get("oauth_verifier");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const denied = url.searchParams.get("denied");
  if (denied || error === "access_denied") {
    return page("Pixelrest X", "<p>X authorization was cancelled.</p>");
  }
  if (code && state) {
    try {
      const result = await finishXConnectOAuth2({ code, state });
      const who = result.screenName ? `@${result.screenName}` : "X";
      return page(
        "Pixelrest connected",
        `<p>Connected to ${who}. Daily board posts will go to this account.</p>`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "connect failed";
      const safe = message
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
      return page("Pixelrest X", `<p>${safe}</p>`);
    }
  }
  if (!oauthToken && !oauthVerifier) {
    return page(
      "Pixelrest X callback",
      `<p>Redirect URL for the Pixelrest X app:</p><p><code>${xCallbackUrl()}</code></p>`,
    );
  }
  if (!oauthToken || !oauthVerifier) {
    return page("Pixelrest X", "<p>Missing OAuth verifier.</p>");
  }
  try {
    const result = await finishXConnect({ oauthToken, oauthVerifier });
    const who = result.screenName ? `@${result.screenName}` : "X";
    return page(
      "Pixelrest connected",
      `<p>Connected to ${who}. Daily board posts will go to this account.</p>`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "connect failed";
    const safe = message
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    return page("Pixelrest X", `<p>${safe}</p>`);
  }
}
