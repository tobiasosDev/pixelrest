"use client";

import { useEffect } from "react";

export function BoardLoader() {
  useEffect(() => {
    if (document.querySelector("script[data-pixelrest-board]")) {
      return;
    }

    let cancelled = false;

    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        window.location.reload();
      }
    }

    async function loadBoard() {
      const buildId = process.env.NEXT_PUBLIC_BUILD_ID ?? "4";
      const url = `/app.js?v=${encodeURIComponent(buildId)}&t=${Date.now()}`;
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok || cancelled) {
        return;
      }
      const code = await response.text();
      if (cancelled || document.querySelector("script[data-pixelrest-board]")) {
        return;
      }
      const objectUrl = URL.createObjectURL(
        new Blob([code], { type: "text/javascript" }),
      );
      const script = document.createElement("script");
      script.type = "module";
      script.src = objectUrl;
      script.dataset.pixelrestBoard = "1";
      document.body.appendChild(script);
    }

    window.addEventListener("pageshow", onPageShow);
    void loadBoard();

    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);
  return null;
}
