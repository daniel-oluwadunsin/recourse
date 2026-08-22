'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!loading && !user)
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, pathname, router, user]);
  if (loading || !user)
    return (
      <main className="grid min-h-[70vh] place-items-center" aria-busy="true">
        <div className="flex items-center gap-4">
          <span className="spinner-scribble" />
          <span className="font-display text-xl">Opening your casebook…</span>
        </div>
      </main>
    );
  return children;
}
