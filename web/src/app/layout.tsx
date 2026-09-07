import type { Metadata } from "next";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
      title: "玄学Agent · 八字MVP",
      description: "排盘要准，解盘要稳，娱乐参考",
};

export default function RootLayout({
      children,
}: {
      children: React.ReactNode;
}) {
      return (
            <html lang="zh-CN" className="h-full">
                  <body className="min-h-full flex flex-col bg-[#f5f1e8] text-[#2b2620]">
                        <a
                              href="#content"
                              className="visually-hidden rounded bg-[#5a6c5e] px-4 py-2 text-white"
                        >
                              跳到正文
                        </a>
                        <header className="sticky top-0 z-10 border-b border-[#e2d9c6] bg-[#f5f1e8]/95 backdrop-blur">
                              <Nav />
                        </header>
                        <main
                              id="content"
                              tabIndex={-1}
                              className="mx-auto w-full max-w-3xl flex-1 px-4 py-6"
                        >
                              {children}
                        </main>
                        <footer className="border-t border-[#e2d9c6] py-4 text-center text-xs text-[#6f6350]">
                              传统文化视角 · 娱乐参考，不做确定性断言
                        </footer>
                  </body>
            </html>
      );
}
