const buildId = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

export const appJsHref = `/app.js?v=${buildId}`;
export const cssHref = `/styles.css?v=${buildId}`;
