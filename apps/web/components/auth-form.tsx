'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError, useAuth } from '@/lib/auth';

const schema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(10, 'Use at least 10 characters.'),
});
type Values = z.infer<typeof schema>;

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const { login, signup } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });
  const isLogin = mode === 'login';
  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={handleSubmit(async (values) => {
        setError('');
        try {
          await (isLogin ? login : signup)(values.email, values.password);
          router.replace(search.get('next') || '/cases');
        } catch (failure) {
          setError(
            failure instanceof ApiError
              ? failure.message
              : 'That did not work. Please try again.',
          );
        }
      })}
    >
      <div>
        <label className="field-label" htmlFor="email">
          Email
        </label>
        <input
          className="paper-input"
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          {...register('email')}
        />
        {errors.email && (
          <p className="mt-1 text-[var(--red-dark)]">{errors.email.message}</p>
        )}
      </div>
      <div>
        <label className="field-label" htmlFor="password">
          Password
        </label>
        <input
          className="paper-input"
          id="password"
          type="password"
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          placeholder="At least 10 characters"
          {...register('password')}
        />
        {errors.password && (
          <p className="mt-1 text-[var(--red-dark)]">
            {errors.password.message}
          </p>
        )}
      </div>
      {error && (
        <div
          role="alert"
          className="paper-soft border-[var(--red)] bg-[#fff0ec] p-3 text-[var(--red-dark)]"
        >
          {error}
        </div>
      )}
      <button
        className="paper-button primary w-full text-xl"
        disabled={isSubmitting}
      >
        {isSubmitting
          ? 'One moment…'
          : isLogin
            ? 'Open my cases'
            : 'Create my private casebook'}{' '}
        {!isSubmitting && <ArrowRight size={20} />}
      </button>
      <p className="text-center text-[var(--muted)]">
        {isLogin ? 'New to Recourse?' : 'Already have an account?'}{' '}
        <Link
          className="text-[var(--blue-dark)] underline decoration-wavy underline-offset-4"
          href={isLogin ? '/signup' : '/login'}
        >
          {isLogin ? 'Create an account' : 'Sign in'}
        </Link>
      </p>
    </form>
  );
}
