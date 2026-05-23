import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://askcursor.app"),
  title: "AskCursor",
  description:
    "Ask questions about any repository in plain language with your own Cursor API key.",
  openGraph: {
    title: "AskCursor",
    description:
      "Ask questions about any repository in plain language with your own Cursor API key.",
    url: "https://askcursor.app",
    siteName: "AskCursor"
  },
  icons: {
    icon: "/favicon.svg"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fbfaf7"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
