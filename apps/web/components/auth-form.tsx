"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { signIn, signUp } from "../lib/api";
import { useAuthStore } from "../lib/auth-store";
import { Button, Field, Notice, TextInput } from "./ui";
import { Lock1 } from "./icons";
import { Logo } from "./logo";

const sharedSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});
const signInSchema = sharedSchema.extend({
  // Sign-in must not enforce the sign-up password policy client-side. Existing
  // accounts may have been created under an older policy; the API remains the
  // authority for credential verification.
  password: z.string().min(1, "Enter your password."),
});
const signUpSchema = sharedSchema.extend({
  password: z.string().min(12, "Use at least 12 characters."),
});
type Values = z.infer<typeof signUpSchema>;

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const search = useSearchParams();
  const setSession = useAuthStore((state) => state.setSession);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(mode === "sign-in" ? signInSchema : signUpSchema),
    defaultValues: { email: "", password: "" },
  });
  const submit = async (values: Values) => {
    setServerError(null);
    try {
      const session =
        mode === "sign-in"
          ? await signIn(values.email, values.password)
          : await signUp(values.email, values.password);
      setSession(session.accessToken, session.user);
      router.replace(search.get("next") || "/dashboard");
    } catch (error) {
      setServerError(
        error instanceof Error ? error.message : "Authentication failed.",
      );
    }
  };
  return (
    <div className="auth-form">
      <Logo />
      <div className="mt-10">
        <p className="eyebrow">
          {mode === "sign-in"
            ? "Welcome back"
            : "Start with a secure workspace"}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          {mode === "sign-in"
            ? "Sign in to Recourse"
            : "Create your Recourse account"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-pencil-muted">
          Your case files stay private and every workflow step is recorded with
          provenance.
        </p>
      </div>
      {serverError ? <Notice tone="danger">{serverError}</Notice> : null}
      <form
        noValidate
        className="mt-8 space-y-5"
        onSubmit={handleSubmit(submit)}
      >
        <Field label="Email" error={errors.email?.message}>
          <TextInput
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...register("email")}
          />
        </Field>
        <Field
          label="Password"
          error={errors.password?.message}
          hint={
            mode === "sign-up"
              ? "At least 12 characters. Use a unique password."
              : undefined
          }
        >
          <TextInput
            type="password"
            autoComplete={
              mode === "sign-in" ? "current-password" : "new-password"
            }
            placeholder="••••••••••••"
            {...register("password")}
          />
        </Field>
        <Button type="submit" loading={isSubmitting}>
          <Lock1 size={17} />{" "}
          {mode === "sign-in" ? "Sign in" : "Create account"}
        </Button>
      </form>
      <div className="mt-6 flex flex-wrap justify-between gap-3 text-sm text-pencil-muted">
        {mode === "sign-in" ? (
          <>
            <Link className="source-link" href="/auth/forgot-password">
              Forgot password?
            </Link>
            <Link className="source-link" href="/auth/sign-up">
              Create account
            </Link>
          </>
        ) : (
          <Link className="source-link" href="/auth/sign-in">
            Already have an account?
          </Link>
        )}
      </div>
    </div>
  );
}
