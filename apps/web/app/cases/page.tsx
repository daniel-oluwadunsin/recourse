'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FilePlus2, Inbox } from 'lucide-react';
import Link from 'next/link';
import { statusLabels } from '@recourse/shared';
import { useAuth } from '@/lib/auth';
import type { CaseItem } from '@/lib/types';

export default function CasesPage() {
  const { request } = useAuth();
  const {
    data: cases,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['cases'],
    queryFn: () => request<CaseItem[]>('/cases'),
  });
  return (
    <main className="page-shell pb-20 pt-8 sm:pt-14">
      <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Your casebook</p>
          <h1 className="font-display mt-2 text-5xl font-bold sm:text-6xl">
            Every thread, in view.
          </h1>
        </div>
        <Link className="paper-button primary text-lg" href="/cases/new">
          <FilePlus2 size={20} /> Start a new case
        </Link>
      </div>
      <div className="mt-12">
        {isLoading && (
          <div className="flex min-h-56 items-center justify-center gap-4">
            <span className="spinner-scribble" />
            <span>Opening your cases…</span>
          </div>
        )}
        {error && (
          <div className="paper-panel border-[var(--red)] p-6" role="alert">
            <h2 className="font-display text-2xl font-bold">
              Your casebook could not open.
            </h2>
            <p className="mt-2">Please refresh. Nothing has been changed.</p>
          </div>
        )}
        {cases?.length === 0 && (
          <div className="paper-panel tape mx-auto max-w-2xl p-8 text-center sm:p-12">
            <Inbox className="mx-auto" size={48} strokeWidth={1.4} />
            <h2 className="font-display mt-5 text-4xl font-bold">
              No cases yet.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-xl text-[var(--muted)]">
              Paste the decision or describe what happened. Recourse will help
              you work out the rest.
            </p>
            <Link className="paper-button primary mt-7" href="/cases/new">
              Bring your first case <ArrowRight size={19} />
            </Link>
          </div>
        )}
        {!!cases?.length && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {cases.map((item, index) => (
              <Link
                key={item.id}
                href={`/cases/${item.id}`}
                className={`paper-panel group min-h-[245px] p-6 transition-transform hover:-translate-y-1 ${index % 3 === 1 ? 'rotate-[.5deg]' : index % 3 === 2 ? 'rotate-[-.5deg]' : ''}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`status-dot ${item.status === 'READY' || item.status === 'RESOLVED' ? 'ready' : item.processing.status === 'error' ? 'error' : 'waiting'}`}
                  />
                  <span className="text-sm uppercase tracking-wider text-[var(--muted)]">
                    {new Date(item.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <h2 className="font-display mt-7 line-clamp-3 text-3xl font-bold leading-tight">
                  {item.title}
                </h2>
                <p className="mt-4 text-[var(--muted)]">
                  {statusLabels[item.status]}
                </p>
                <span className="mt-6 inline-flex items-center gap-2 text-[var(--blue-dark)] group-hover:underline">
                  Open the case <ArrowRight size={18} />
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
