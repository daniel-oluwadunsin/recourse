'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, FileText, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { ApiError, useAuth } from '@/lib/auth';
import type { CaseItem } from '@/lib/types';

const schema = z.object({
  decisionText: z
    .string()
    .min(20, 'Tell us a little more so we can understand what happened.'),
  title: z.string().max(120).optional(),
  previouslySubmitted: z.boolean(),
});
type Values = z.infer<typeof schema>;
const DRAFT_KEY = 'recourse:new-case-draft';

export default function NewCasePage() {
  const { request } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { decisionText: '', title: '', previouslySubmitted: false },
  });
  const draft = useWatch({ control });
  useEffect(() => {
    const saved = sessionStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        reset(JSON.parse(saved) as Values);
      } catch {}
    }
  }, [reset]);
  useEffect(() => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);
  const create = useMutation({
    mutationFn: (values: Values) =>
      request<CaseItem>('/cases', {
        method: 'POST',
        body: JSON.stringify(values),
      }),
    onSuccess: async (item) => {
      sessionStorage.removeItem(DRAFT_KEY);
      await queryClient.invalidateQueries({ queryKey: ['cases'] });
      router.push(`/cases/${item.id}`);
    },
    onError: (failure) =>
      setError(
        failure instanceof ApiError
          ? failure.message
          : 'Your draft is still here. Please try again.',
      ),
  });
  return (
    <main className="page-shell pb-20 pt-6">
      <Link
        className="inline-flex min-h-12 items-center gap-2 text-[var(--blue-dark)]"
        href="/cases"
      >
        <ArrowLeft size={19} /> Back to cases
      </Link>
      <div className="mt-5 grid gap-10 lg:grid-cols-[1fr_330px]">
        <form onSubmit={handleSubmit((values) => create.mutate(values))}>
          <p className="eyebrow">A new case</p>
          <h1 className="font-display mt-2 max-w-3xl text-5xl font-bold leading-tight sm:text-6xl">
            Start with what happened.
          </h1>
          <p className="mt-4 max-w-2xl text-xl text-[var(--muted)]">
            Paste the decision, quote the message, or describe it in your own
            words. You do not need to know the legal or official category.
          </p>
          <div className="mt-8">
            <label className="field-label" htmlFor="decision">
              The decision or situation
            </label>
            <textarea
              id="decision"
              className="paper-input min-h-[280px] text-xl"
              placeholder={
                'Example: “On 14 August, I received an email saying…”\n\nInclude the institution if you know it. If you do not, say that.'
              }
              {...register('decisionText')}
            />
            {errors.decisionText && (
              <p className="mt-2 text-[var(--red-dark)]">
                {errors.decisionText.message}
              </p>
            )}
          </div>
          <details className="mt-5">
            <summary className="cursor-pointer text-[var(--blue-dark)]">
              Add an optional case title
            </summary>
            <div className="mt-3">
              <label className="field-label" htmlFor="title">
                Case title
              </label>
              <input
                id="title"
                className="paper-input"
                placeholder="Recourse can create this for you"
                {...register('title')}
              />
            </div>
          </details>
          <label className="paper-soft mt-6 flex cursor-pointer items-start gap-3 p-4">
            <input
              type="checkbox"
              className="mt-1 size-5 accent-[var(--blue)]"
              {...register('previouslySubmitted')}
            />
            <span>
              <strong className="font-display">
                I already submitted something
              </strong>
              <span className="mt-1 block text-[var(--muted)]">
                You can record exactly what you sent after the case opens.
              </span>
            </span>
          </label>
          {error && (
            <div
              role="alert"
              className="paper-soft mt-5 border-[var(--red)] bg-[#fff0ec] p-4 text-[var(--red-dark)]"
            >
              {error}
            </div>
          )}
          <button
            className="paper-button primary mt-7 text-xl"
            disabled={create.isPending}
          >
            Save and review my case{' '}
            {create.isPending ? (
              <span className="spinner-scribble !size-5 !border-2" />
            ) : (
              <ArrowRight size={20} />
            )}
          </button>
        </form>
        <aside className="space-y-5 lg:pt-28">
          <div className="paper-panel tape p-6">
            <FileText />
            <h2 className="font-display mt-4 text-2xl font-bold">
              You can add files next
            </h2>
            <p className="mt-2 text-[var(--muted)]">
              PDFs, DOCX files, screenshots, images, and text are supported.
            </p>
          </div>
          <div className="paper-soft p-5">
            <ShieldCheck size={22} />
            <p className="mt-2">
              <strong>Nothing leaves Recourse as an external action.</strong>{' '}
              You choose what to send and confirm it afterward.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
