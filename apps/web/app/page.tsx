import Link from "next/link";
import { Logo } from "../components/logo";
import {
  ArrowRight,
  Check,
  DocumentText,
  Global,
  ShieldTick,
} from "../components/icons";
import { LinkButton } from "../components/ui";

export default function Home() {
  return (
    <main>
      <nav className="landing-nav">
        <Logo />
        <div className="flex items-center gap-3">
          <Link
            href="/auth/sign-in"
            className="hidden text-sm font-semibold sm:inline"
          >
            Sign in
          </Link>
          <LinkButton href="/auth/sign-up">Create account</LinkButton>
        </div>
      </nav>
      <section className="hero-grid">
        <div>
          <p className="eyebrow">
            Grounded recourse for consequential decisions
          </p>
          <h1 className="mt-5 max-w-3xl text-[clamp(3.8rem,9vw,8rem)] font-bold leading-[.86] tracking-[-.09em]">
            Know what is <span className="text-red">known.</span>
            <br />
            Act on what is <span className="text-blue">verified.</span>
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-8 text-pencil-muted">
            Recourse turns a platform decision into a durable, evidence-backed
            case: procedural sources, provenance, contradictions, readiness, and
            human-approved next actions in one workspace.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/auth/sign-up">
              Open a case <ArrowRight size={17} />
            </LinkButton>
            <Link
              href="/auth/sign-in"
              className="inline-flex items-center rounded-xl border-2 border-pencil px-4 py-2 text-sm font-semibold"
            >
              Sign in
            </Link>
          </div>
        </div>
        <div className="doodle-card paper-card space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="eyebrow">The workspace</p>
              <h2 className="mt-2 text-2xl font-bold">
                A clear record of the next move.
              </h2>
            </div>
            <span className="rounded-full bg-red/10 p-3 text-red">
              <ShieldTick size={26} />
            </span>
          </div>
          <div className="space-y-4 text-sm">
            <div className="flex gap-3">
              <Global size={20} className="shrink-0 text-blue" />
              <span>
                <strong>Verified procedure.</strong>
                <br />
                <span className="text-pencil-muted">
                  Official source passages, freshness, conflicts, and scope.
                </span>
              </span>
            </div>
            <div className="flex gap-3">
              <DocumentText size={20} className="shrink-0 text-blue" />
              <span>
                <strong>Evidence provenance.</strong>
                <br />
                <span className="text-pencil-muted">
                  Native extraction first, claims linked back to blocks.
                </span>
              </span>
            </div>
            <div className="flex gap-3">
              <Check size={20} className="shrink-0 text-green" />
              <span>
                <strong>Safe action gates.</strong>
                <br />
                <span className="text-pencil-muted">
                  No consequential outward action without approval and
                  verification.
                </span>
              </span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
