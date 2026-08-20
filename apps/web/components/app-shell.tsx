"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useNotifications } from "../lib/queries";
import { useAuthStore } from "../lib/auth-store";
import { logout } from "../lib/api";
import { useTheme } from "./theme-provider";
import { Logo } from "./logo";
import {
  Activity,
  Chart2,
  HambergerMenu,
  Moon,
  Notification,
  ProfileCircle,
  Setting2,
  SecuritySafe,
  Sun1,
  MenuBoard,
  LogoutCurve,
  Add,
} from "./icons";
import { LinkButton } from "./ui";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: Chart2 },
  { href: "/cases", label: "Cases", icon: MenuBoard },
  { href: "/notifications", label: "Notifications", icon: Notification },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const { status, user, clearSession } = useAuthStore();
  const unread = useNotifications(true);

  useEffect(() => {
    if (status === "unauthenticated")
      router.replace(`/auth/sign-in?next=${encodeURIComponent(pathname)}`);
  }, [pathname, router, status]);

  if (status === "unknown" || status === "loading")
    return (
      <div className="auth-loading">
        <Logo />
        <span className="spinner spinner-dark" />{" "}
        <span>Restoring your secure session…</span>
      </div>
    );
  if (status === "unauthenticated" || !user) return null;

  const signOut = async () => {
    try {
      await logout();
    } finally {
      clearSession();
      router.replace("/auth/sign-in");
    }
  };
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="flex items-center justify-between">
          <Link href="/dashboard" aria-label="Recourse dashboard">
            <Logo />
          </Link>
          <button
            className="icon-button mobile-nav-button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            ×
          </button>
        </div>
        <LinkButton href="/cases/new" className="mt-8 w-full">
          <Add size={18} /> New case
        </LinkButton>
        <nav className="mt-8 space-y-1" aria-label="Primary navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`nav-link ${active ? "nav-link-active" : ""}`}
              >
                <Icon size={20} variant={active ? "Bold" : "Linear"} />
                {item.label}
                {item.label === "Notifications" &&
                unread.data?.filter((item) => !item.readAt).length ? (
                  <span className="ml-auto rounded-full bg-red px-2 py-0.5 text-xs text-white">
                    {unread.data.filter((item) => !item.readAt).length}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-1 border-t border-line pt-5">
          <Link href="/settings/profile" className="nav-link">
            <ProfileCircle size={20} /> Profile
          </Link>
          <Link href="/settings/security" className="nav-link">
            <Setting2 size={20} /> Settings
          </Link>
          <Link href="/settings/data" className="nav-link">
            <SecuritySafe size={20} /> Data & privacy
          </Link>
          <button onClick={signOut} className="nav-link w-full">
            <LogoutCurve size={20} /> Sign out
          </button>
        </div>
      </aside>
      <div className={`shell-content ${open ? "shell-content-dim" : ""}`}>
        <header className="topbar">
          <button
            className="icon-button mobile-nav-button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <HambergerMenu size={22} />
          </button>
          <div className="flex items-center gap-2 text-sm text-pencil-muted">
            <Activity size={17} /> Secure case workspace
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-pencil-muted sm:inline">
              {user.email}
            </span>
            <button
              className="icon-button"
              onClick={toggle}
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              {theme === "light" ? <Moon size={19} /> : <Sun1 size={19} />}
            </button>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
