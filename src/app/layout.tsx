import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TRAINTRCKR — Cardiff · Kotara Corridor",
  description:
    "Live train timetable and movement tracking for the Cardiff–Kotara corridor on the Newcastle line, NSW Australia.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
