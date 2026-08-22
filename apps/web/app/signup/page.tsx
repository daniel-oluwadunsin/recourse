import { Suspense } from 'react';
import { AuthForm } from '@/components/auth-form';
import { SiteHeader } from '@/components/site-header';

export default function SignupPage() {
  return (
    <main>
      <SiteHeader compact />
      <section className="page-shell grid min-h-[calc(100vh-130px)] place-items-center py-10">
        <div className="paper-panel tape w-full max-w-[540px] p-7 sm:p-10">
          <p className="eyebrow">Your private casebook</p>
          <h1 className="font-display mt-2 text-5xl font-bold">
            Start with the truth.
          </h1>
          <p className="mt-3 text-xl text-[var(--muted)]">
            Bring any consequential institutional decision. You do not need to
            know the right category or process.
          </p>
          <Suspense>
            <AuthForm mode="signup" />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
