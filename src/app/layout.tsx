import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "锦AI - Agent产品管理操作系统",
  description: "AI Agent驱动的产品管理与团队协作系统",
};

const NAV_LINKS = [
  { href: "/", label: "控制台", emoji: "📊" },
  { href: "/products", label: "产品管理", emoji: "📦" },
  { href: "/team-reports", label: "团队报告", emoji: "📋" },
  { href: "/execution-logs", label: "执行记录", emoji: "📝" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <aside className="sidebar">
          <div className="sidebar-brand">
            <h1>🤖 锦AI</h1>
            <p>Agent产品管理操作系统</p>
          </div>
          <nav className="sidebar-nav">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="sidebar-link">
                <span>{link.emoji}</span>
                <span>{link.label}</span>
              </a>
            ))}
          </nav>
          <div className="sidebar-footer">
            v2.0 · 6 AI Agents
          </div>
        </aside>
        <main className="main-content">{children}</main>
      </body>
    </html>
  );
}
