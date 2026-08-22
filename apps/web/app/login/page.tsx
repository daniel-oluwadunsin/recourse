import { Suspense } from 'react';
import { AuthForm } from '@/components/auth-form';
import { SiteHeader } from '@/components/site-header';

export default function LoginPage() {
  return (
    <main>
      <SiteHeader compact />
      <section className="page-shell grid min-h-[calc(100vh-130px)] place-items-center py-10">
        <div className="paper-panel tape w-full max-w-[520px] p-7 sm:p-10">
          <p className="eyebrow">Welcome back</p>
          <h1 className="font-display mt-2 text-5xl font-bold">
            Pick up the thread.
          </h1>
          <p className="mt-3 text-xl text-[var(--muted)]">
            Your cases, evidence, and next steps are waiting.
          </p>
          <Suspense>
            <AuthForm mode="login" />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
