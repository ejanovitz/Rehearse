import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Interview Simulator",
  description: "A live interview simulator to help coach your responses",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-gray-900 text-white">
        {children}
      </body>
    </html>
  );
}
