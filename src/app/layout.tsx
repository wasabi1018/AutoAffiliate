import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Auto Affiliater", template: "%s | Auto Affiliater" },
  description: "Threadsと楽天アフィリエイトの投稿運用を管理するシステム",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
