import Link from "next/link";
import { Logo } from "../../../../components/logo";
import { Notice } from "../../../../components/ui";
export default function ForgotPasswordPage() {
  return (
    <div className="auth-form">
      <Logo />
      <div className="mt-10">
        <p className="eyebrow">Account recovery</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Password reset delivery is not enabled
        </h1>
        <p className="mt-4 text-sm leading-6 text-pencil-muted">
          The secure token layer exists in the backend, but no transactional
          email provider is enabled in this environment. Recourse will not
          pretend a reset email was sent.
        </p>
      </div>
      <Notice tone="info">
        Ask an administrator to configure the approved email provider before
        using password recovery.
      </Notice>
      <Link
        href="/auth/sign-in"
        className="mt-7 inline-flex text-sm font-semibold text-blue underline underline-offset-4"
      >
        Return to sign in
      </Link>
    </div>
  );
}
