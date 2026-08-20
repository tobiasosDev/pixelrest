"use client";

import { useEffect } from "react";

export function BoardLoader() {
  useEffect(() => {
    const src = `/app.js?v=${process.env.NEXT_PUBLIC_BUILD_ID ?? "4"}`;
    if (document.querySelector(`script[data-pixelrest-board]`)) {
      return;
    }
    const script = document.createElement("script");
    script.type = "module";
    script.src = src;
    script.dataset.pixelrestBoard = "1";
    document.body.appendChild(script);
  }, []);
  return null;
}
