import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vitrina Monitor",
  description: "Админ-панель мониторинга сайтов",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full">
      <body className="h-full overflow-hidden antialiased">{children}</body>
    </html>
  );
}
