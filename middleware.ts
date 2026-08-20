import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Only dynamic content stays no-store. app.js and styles.css use ?v=BUILD_ID
// versioned URLs and get long-lived caching from next.config / vercel.json.
const NO_STORE_PATHS = new Set(["/", "/api/grid", "/api/presence"]);

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  if (!NO_STORE_PATHS.has(request.nextUrl.pathname)) {
    return response;
  }
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, max-age=0",
  );
  response.headers.set("CDN-Cache-Control", "no-store");
  response.headers.set("Vercel-CDN-Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export const config = {
  matcher: ["/", "/api/grid", "/api/presence"],
};
