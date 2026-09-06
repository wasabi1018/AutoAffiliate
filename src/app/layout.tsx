import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Auto Affiliater",
  description: "Threads × 楽天アフィリエイト自動運用システム",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
