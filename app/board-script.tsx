"use client";

import { useEffect } from "react";
import { appJsHref } from "./asset-urls";

// The board script mutates the DOM (HUD counters, canvas size, classes), so it
// must not run before React hydration finishes or React re-renders the tree
// and replaces the painted canvas. The layout modulepreloads app.js so the
// download happens in parallel; this only defers execution until after mount.
export function BoardScript() {
  useEffect(() => {
    if (document.querySelector("script[data-pixelrest-board]")) {
      return;
    }
    const script = document.createElement("script");
    script.type = "module";
    script.src = appJsHref;
    script.dataset.pixelrestBoard = "1";
    document.body.appendChild(script);
  }, []);
  return null;
}
