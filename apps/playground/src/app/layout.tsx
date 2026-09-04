import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@sourced/react/kit.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "sourced playground",
  description: "A playground for the sourced packages.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
