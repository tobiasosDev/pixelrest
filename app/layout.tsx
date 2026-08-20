import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { appJsHref, cssHref } from "./asset-urls";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Pixelrest - buy squares, promote an app",
  description:
    "A square board of 102,400 squares at $10 each. Over a million dollars if it fills.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href={cssHref} />
        <link rel="modulepreload" href={appJsHref} />
        <link rel="icon" href="/logo.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/logo.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
