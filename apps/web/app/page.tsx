import Link from 'next/link';
import {
  ArrowDown,
  ArrowRight,
  Check,
  FileText,
  Search,
  Sparkles,
} from 'lucide-react';
import { SiteHeader } from '@/components/site-header';

const steps = [
  {
    number: '01',
    title: 'Bring the decision',
    text: 'Paste what happened or add the letter, screenshot, or PDF you received.',
    icon: FileText,
  },
  {
    number: '02',
    title: 'See the whole case',
    text: 'Recourse finds the current process, reads your evidence, and tells you what is known or missing.',
    icon: Search,
  },
  {
    number: '03',
    title: 'Choose your move',
    text: 'Prepare an email, formal letter, or a grounded answer for a portal question. You stay in control.',
    icon: Sparkles,
  },
];

export default function LandingPage() {
  return (
    <main className="overflow-hidden">
      <SiteHeader />
      <section className="page-shell relative grid min-h-[calc(100vh-82px)] items-center gap-12 pb-20 pt-10 lg:grid-cols-[1.08fr_.92fr] lg:py-20">
        <div className="relative z-10">
          <p className="eyebrow">Case intelligence for difficult decisions</p>
          <h1 className="font-display mt-5 max-w-[760px] text-[clamp(3.35rem,8vw,7.7rem)] font-bold leading-[.88] tracking-[-.07em]">
            Find your
            <br />
            <span className="scribble-underline text-[var(--red)]">
              next move.
            </span>
          </h1>
          <p className="mt-8 max-w-xl text-xl leading-relaxed sm:text-2xl">
            When an institution says no, Recourse helps you understand why,
            organize the facts, verify the process, and prepare a response you
            can stand behind.
          </p>
          <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Link
              href="/signup"
              className="paper-button primary !px-6 !py-4 text-xl"
            >
              Start with what happened <ArrowRight />
            </Link>
            <span className="max-w-[230px] text-base text-[var(--muted)]">
              No hardcoded categories. No external action without you.
            </span>
          </div>
        </div>
        <div
          className="relative mx-auto h-[490px] w-full max-w-[470px]"
          aria-label="A case taking shape"
        >
          <div className="paper-panel tape absolute left-3 top-20 w-[78%] rotate-[-5deg] p-6">
            <p className="eyebrow">The decision</p>
            <p className="mt-3 text-xl">
              “We&apos;re unable to approve your request…”
            </p>
            <div className="mt-5 sketch-rule" />
            <p className="mt-4 text-[var(--muted)]">
              Received Tuesday · reference found
            </p>
          </div>
          <div className="paper-panel absolute right-0 top-[235px] w-[77%] rotate-[4deg] bg-[#fff5bd] p-6">
            <p className="font-display text-2xl font-bold">What matters</p>
            <ul className="mt-3 space-y-3">
              <li className="flex gap-2">
                <Check size={20} /> Current process verified
              </li>
              <li className="flex gap-2">
                <Check size={20} /> Two useful documents
              </li>
              <li className="flex gap-2">
                <span className="text-[var(--red)]">?</span> One date still
                needed
              </li>
            </ul>
          </div>
          <svg
            className="absolute -left-8 bottom-2 h-28 w-36 text-[var(--blue)]"
            viewBox="0 0 140 110"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M10 12c45 9 81 42 94 81m0 0-18-16m18 16 7-24"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <a
          href="#how-it-works"
          aria-label="How it works"
          className="absolute bottom-7 left-1/2 hidden -translate-x-1/2 items-center gap-2 text-sm lg:flex"
        >
          Scroll to unfold it <ArrowDown size={17} />
        </a>
      </section>

      <section
        id="how-it-works"
        className="border-y-2 border-[var(--ink)] bg-[var(--paper-deep)] py-24"
      >
        <div className="page-shell">
          <div className="max-w-2xl">
            <p className="eyebrow">One calm path through the mess</p>
            <h2 className="font-display mt-3 text-5xl font-bold leading-tight sm:text-6xl">
              From scattered facts to a grounded case.
            </h2>
          </div>
          <div className="mt-14 grid gap-8 lg:grid-cols-3">
            {steps.map(({ number, title, text, icon: Icon }, index) => (
              <article
                key={number}
                className={`paper-panel relative p-7 ${index === 1 ? 'lg:translate-y-8 lg:rotate-[1deg]' : index === 2 ? 'lg:rotate-[-1deg]' : 'lg:rotate-[-.5deg]'}`}
              >
                <span className="font-display absolute -right-2 -top-9 text-7xl font-bold text-[var(--old-paper)] [text-shadow:1px_1px_0_#2d2d2d]">
                  {number}
                </span>
                <Icon size={31} strokeWidth={1.7} />
                <h3 className="font-display mt-7 text-3xl font-bold">
                  {title}
                </h3>
                <p className="mt-3 text-xl text-[var(--muted)]">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="page-shell py-24 sm:py-32">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Built around your boundary</p>
            <h2 className="font-display mt-3 text-5xl font-bold sm:text-6xl">
              Prepared by Recourse.
              <br />
              Performed by you.
            </h2>
          </div>
          <div className="paper-panel tape rotate-[1deg] p-7 sm:p-10">
            <p className="text-2xl">
              Recourse can research, analyze, draft, and help answer a portal
              question.
            </p>
            <div className="my-6 sketch-rule" />
            <p className="text-xl text-[var(--red-dark)]">
              It cannot send the email, submit the form, call the institution,
              or claim something happened outside the product.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t-2 border-[var(--ink)] bg-[var(--blue)] py-20 text-white">
        <div className="page-shell flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
          <div>
            <p className="eyebrow !text-[#f9df76]">Start where you are</p>
            <h2 className="font-display mt-2 text-5xl font-bold">
              Tell us what happened.
            </h2>
          </div>
          <Link
            href="/signup"
            className="paper-button !bg-[#fff5bd] !text-[var(--ink)] !px-6 text-xl"
          >
            Open a case <ArrowRight />
          </Link>
        </div>
      </section>
      <footer className="page-shell flex flex-col gap-3 py-8 text-[var(--muted)] sm:flex-row sm:justify-between">
        <span>Recourse · thoughtful help for difficult decisions</span>
        <span>
          Research and drafting support—not professional representation.
        </span>
      </footer>
    </main>
  );
}
