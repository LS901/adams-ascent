import type { Metadata } from "next";
import { Baloo_2, Nunito, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const baloo2 = Baloo_2({
  variable: "--font-display",
  subsets: ["latin"],
});

const nunito = Nunito({
  variable: "--font-body",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Adam's Ascent",
  description: "A mountain climb toward becoming a personal trainer.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${baloo2.variable} ${nunito.variable} ${jetbrainsMono.variable} antialiased`}
    >
      <body className="min-h-full flex flex-col font-body">{children}</body>
    </html>
  );
}
