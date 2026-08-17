export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fdfbf7] px-6 text-[#2d2d2d]">
      <section className="w-full max-w-2xl border-2 border-[#2d2d2d] bg-white p-10 shadow-[6px_6px_0_0_#2d2d2d]">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-[#2d5da1]">
          Engineering foundation
        </p>
        <h1 className="text-4xl font-bold tracking-tight">Recourse</h1>
        <p className="mt-4 max-w-xl text-lg leading-8">
          The web application foundation is running. Product workflows are
          intentionally added in later phases after durable state, security, and
          provider boundaries are in place.
        </p>
      </section>
    </main>
  );
}
