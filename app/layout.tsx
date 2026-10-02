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
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.png"
  },
  appleWebApp: {
    capable: true,
    title: "AskCursor",
    statusBarStyle: "default"
  },
  formatDetection: {
    telephone: false
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Draw under the notch / home indicator; the UI pads itself with env(safe-area-*).
  viewportFit: "cover",
  // Chromium: shrink the layout (not just the visual) viewport for the keyboard.
  interactiveWidget: "resizes-content",
  themeColor: "#ffffff"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="font-sans">
      <body>{children}</body>
    </html>
  );
}
