import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { STORE } from "@/config/store";
import { getCurrentOutlet, getSiteOrigin } from "@/lib/outlet";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const [{ outlet }, origin] = await Promise.all([getCurrentOutlet(), getSiteOrigin()]);
  const name = outlet?.name ?? STORE.name;
  return {
    metadataBase: new URL(origin),
    title: { default: name, template: `%s · ${name}` },
    description: STORE.description,
    openGraph: { siteName: name, type: "website" },
  };
}

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
