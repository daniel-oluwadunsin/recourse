import type { Metadata } from "next";
import { Kalam, Patrick_Hand } from "next/font/google";
import "./globals.css";
import { Providers } from "../components/providers";
import { ThemeProvider } from "../components/theme-provider";

const kalam = Kalam({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-kalam",
});
const patrickHand = Patrick_Hand({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-patrick-hand",
});

export const metadata: Metadata = {
  title: "Recourse",
  description:
    "Evidence-grounded case management for consequential platform decisions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${kalam.variable} ${patrickHand.variable} antialiased`}>
        <ThemeProvider>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
