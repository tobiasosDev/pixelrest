import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";

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
        <link rel="stylesheet" href="/styles.css" />
        <link rel="icon" href="/logo.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/logo.png" />
      </head>
      <body>
        {children}
        <Script src="/app.js" type="module" strategy="afterInteractive" />
      </body>
    </html>
  );
}
