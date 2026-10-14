import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/* The Bhutan NDI UI spec names Inter as its standard face. Loaded here but
   applied only inside the NDI components, so the Drukair theme keeps Geist. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Drukair — Passenger Onboarding",
  description:
    "A Drukair concept site demonstrating Bhutan NDI: a ticket VC issued at check-in, then a boarding pass VC issued at the gate.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="bg-haze-50 text-ink-700 flex min-h-full flex-col">
        {children}
      </body>
    </html>
  );
}
