"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CloseCircle,
  InfoCircle,
  Refresh2,
  Warning2,
} from "./icons";

export function Button({
  className = "",
  variant = "primary",
  loading = false,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
}) {
  const styles = {
    primary: "bg-pencil text-paper hover:-translate-y-0.5",
    secondary: "border-2 border-pencil bg-transparent hover:bg-muted",
    ghost: "text-pencil-muted hover:bg-muted",
    danger: "border-2 border-red text-red hover:bg-red/10",
  };
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <span className="spinner" aria-label="Working" /> : null}
      {children}
    </button>
  );
}

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <section className={`paper-card ${className}`}>{children}</section>;
}
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className="display-heading">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-base leading-7 text-pencil-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
export function StatusBadge({ status }: { status: string | null | undefined }) {
  const normalized = status ?? "UNKNOWN";
  const tone =
    /READY|VERIFIED|SUPPORTED|SUCCEEDED|APPROVED|RESOLVED|SATISFIED|COMPLETED|OPEN/.test(
      normalized,
    )
      ? "status-good"
      : /FAILED|CONTRADICTED|EXPIRED|BLOCKED|UNSUPPORTED|MISSING|REJECTED|NEEDS_HUMAN/.test(
            normalized,
          )
        ? "status-bad"
        : "status-warn";
  return <span className={`status-badge ${tone}`}>{humanize(normalized)}</span>;
}
export function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <InfoCircle size={24} />
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-pencil-muted">{description}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="empty-state border-red/30 bg-red/5 text-red">
      <CloseCircle size={24} />
      <div>
        <h2 className="font-semibold">Something needs attention</h2>
        <p className="mt-1 text-sm">{message}</p>
        {retry ? (
          <Button className="mt-4" variant="danger" onClick={retry}>
            <Refresh2 size={16} /> Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}
export function LoadingState({
  label = "Loading live case data",
}: {
  label?: string;
}) {
  return (
    <div className="empty-state">
      <span className="spinner spinner-dark" />
      <span className="text-sm text-pencil-muted">{label}…</span>
    </div>
  );
}
export function Notice({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "warning" | "danger" | "success";
}) {
  const Icon =
    tone === "warning" || tone === "danger"
      ? Warning2
      : tone === "success"
        ? Check
        : InfoCircle;
  return (
    <div className={`notice notice-${tone}`}>
      <Icon size={18} /> <div>{children}</div>
    </div>
  );
}
export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}
export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className ?? ""}`} />;
}
export function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={`input min-h-32 resize-y ${props.className ?? ""}`}
    />
  );
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`input ${props.className ?? ""}`} />;
}
export function LinkButton({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center gap-2 rounded-xl bg-pencil px-4 py-2 text-sm font-semibold !text-paper transition hover:-translate-y-0.5 ${className}`}
    >
      {children}
      <ArrowRight size={16} />
    </Link>
  );
}
export function MotionCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
export function Metric({
  label,
  value,
  helper,
}: {
  label: string;
  value: React.ReactNode;
  helper?: string;
}) {
  return (
    <div>
      <p className="text-sm text-pencil-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {helper ? (
        <p className="mt-1 text-xs text-pencil-muted">{helper}</p>
      ) : null}
    </div>
  );
}
