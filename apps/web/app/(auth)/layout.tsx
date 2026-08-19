export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="auth-page">
      <section className="auth-aside">
        <div>
          <p className="eyebrow">Recourse / private by design</p>
          <p className="mt-16 max-w-lg text-5xl font-bold leading-[.98] tracking-[-.06em]">
            Make the next step <span className="text-red">grounded.</span>
          </p>
          <p className="mt-6 max-w-md text-base leading-7 opacity-70">
            A durable place to understand a consequential decision, collect
            evidence, verify procedure, and choose a safe next action.
          </p>
        </div>
        <p className="text-sm opacity-60">
          Evidence stays evidence. Uncertainty stays visible.
        </p>
      </section>
      <section className="auth-form-wrap">{children}</section>
    </main>
  );
}
