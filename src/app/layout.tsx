import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI公司模拟器 - 多团队产品管理",
  description: "AI驱动的多团队产品管理系统",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const navLinks = [
    { href: "/", label: "📊 控制台" },
    { href: "/products", label: "📦 产品管理" },
    { href: "/team-reports", label: "� 团队报告" },
    { href: "/daily-reports", label: "�📋 工作日报" },
  ];

  return (
    <html lang="zh-CN">
      <body>
        <aside className="sidebar">
          <div className="sidebar-logo">🤖 AI公司模拟器</div>
          <nav className="sidebar-nav">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="sidebar-link">
                {link.label}
              </a>
            ))}
          </nav>
        </aside>
        <main className="main-content">{children}</main>
      </body>
    </html>
  );
}
