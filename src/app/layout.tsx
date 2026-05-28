import type { Metadata } from "next";
import { Noto_Serif_KR, Nanum_Myeongjo, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const notoSerifKr = Noto_Serif_KR({
  variable: "--font-serif-kr",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const nanumMyeongjo = Nanum_Myeongjo({
  variable: "--font-myeongjo",
  subsets: ["latin"],
  weight: ["400", "700", "800"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "엄마만의 서재",
  description: "엄마가 읽고 본 책과 영화의 인물 관계도 서재",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${notoSerifKr.variable} ${nanumMyeongjo.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
