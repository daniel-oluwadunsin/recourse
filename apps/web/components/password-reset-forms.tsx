"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { requestPasswordReset, resetPassword } from "../lib/api";
import { Lock1 } from "./icons";
import { Logo } from "./logo";
import { Button, Field, Notice, TextInput } from "./ui";

const requestSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

const completeSchema = z
  .object({
    password: z.string().min(12, "Use at least 12 characters."),
    confirmPassword: z.string().min(1, "Confirm the new password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export function PasswordResetRequestForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof requestSchema>>({
    resolver: zodResolver(requestSchema),
    defaultValues: { email: "" },
  });

  return (
    <div className="auth-form">
      <Logo />
      <div className="mt-10">
        <p className="eyebrow">Account recovery</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Reset your password
        </h1>
        <p className="mt-4 text-sm leading-6 text-pencil-muted">
          Enter your account email. If it matches an active account, Recourse
          will send a single-use link that expires shortly.
        </p>
      </div>
      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <form
        noValidate
        className="mt-8 space-y-5"
        onSubmit={handleSubmit(async ({ email }) => {
          setError(null);
          try {
            const result = await requestPasswordReset(email);
            setMessage(result.message);
          } catch (value) {
            setError(
              value instanceof Error
                ? value.message
                : "The reset request could not be completed.",
            );
          }
        })}
      >
        <Field label="Email" error={errors.email?.message}>
          <TextInput
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...register("email")}
          />
        </Field>
        <Button type="submit" loading={isSubmitting}>
          Send reset link
        </Button>
      </form>
      <Link
        href="/auth/sign-in"
        className="mt-7 inline-flex text-sm font-semibold text-blue underline underline-offset-4"
      >
        Return to sign in
      </Link>
    </div>
  );
}

export function PasswordResetCompleteForm() {
  const [token, setToken] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof completeSchema>>({
    resolver: zodResolver(completeSchema),
    defaultValues: { confirmPassword: "", password: "" },
  });

  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get(
      "token",
    );
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }

    // Defer the client-only fragment handoff so the initial server render stays
    // stable while the secret is removed from browser history immediately.
    queueMicrotask(() => setToken(value ?? ""));
  }, []);

  return (
    <div className="auth-form">
      <Logo />
      <div className="mt-10">
        <p className="eyebrow">Account recovery</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Choose a new password
        </h1>
        <p className="mt-4 text-sm leading-6 text-pencil-muted">
          The reset link works once. Completing this form signs out every
          existing Recourse session for the account.
        </p>
      </div>
      {token === "" ? (
        <Notice tone="danger">
          This reset link is incomplete. Request a new link from the sign-in
          page.
        </Notice>
      ) : null}
      {complete ? (
        <>
          <Notice tone="success">
            Your password has been changed and existing sessions were revoked.
          </Notice>
          <Link
            href="/auth/sign-in"
            className="mt-7 inline-flex text-sm font-semibold text-blue underline underline-offset-4"
          >
            Sign in with the new password
          </Link>
        </>
      ) : (
        <form
          noValidate
          className="mt-8 space-y-5"
          onSubmit={handleSubmit(async ({ password }) => {
            setError(null);
            if (!token) {
              setError("Reset link is invalid or incomplete.");
              return;
            }
            try {
              await resetPassword(token, password);
              setComplete(true);
            } catch (value) {
              setError(
                value instanceof Error
                  ? value.message
                  : "The password could not be changed.",
              );
            }
          })}
        >
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Field
            label="New password"
            error={errors.password?.message}
            hint="At least 12 characters. Use a unique password."
          >
            <TextInput
              type="password"
              autoComplete="new-password"
              {...register("password")}
            />
          </Field>
          <Field
            label="Confirm new password"
            error={errors.confirmPassword?.message}
          >
            <TextInput
              type="password"
              autoComplete="new-password"
              {...register("confirmPassword")}
            />
          </Field>
          <Button type="submit" loading={isSubmitting} disabled={!token}>
            <Lock1 size={17} /> Change password
          </Button>
        </form>
      )}
    </div>
  );
}
