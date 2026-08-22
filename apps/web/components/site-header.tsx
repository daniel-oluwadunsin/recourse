'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  return (
    <header
      className="page-shell flex min-h-[82px] items-center justify-between gap-4 py-4"
      aria-label="Main navigation"
    >
      <Link
        href={user ? '/cases' : '/'}
        className="font-display text-[1.7rem] font-bold leading-none tracking-[-.04em]"
      >
        Re<span className="text-[var(--red)]">course</span>
        <span aria-hidden="true">↗</span>
      </Link>
      <nav className="flex items-center gap-2 sm:gap-4">
        {!compact && !user && (
          <a
            href="#how-it-works"
            className="hidden min-h-12 items-center sm:flex"
          >
            How it works
          </a>
        )}
        {user ? (
          <>
            <Link
              className="paper-button quiet !hidden sm:!inline-flex"
              href="/cases"
            >
              Your cases
            </Link>
            <button
              className="paper-button quiet"
              type="button"
              aria-label="Sign out"
              onClick={async () => {
                await logout();
                router.push('/');
              }}
            >
              <LogOut size={18} aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </>
        ) : (
          <>
            <Link
              className="paper-button quiet !hidden sm:!inline-flex"
              href="/login"
            >
              Sign in
            </Link>
            <Link className="paper-button primary" href="/signup">
              Start a case <ArrowUpRight size={18} />
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
