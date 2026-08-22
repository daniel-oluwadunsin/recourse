'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { statusLabels } from '@recourse/shared';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clipboard,
  Clock3,
  Download,
  ExternalLink,
  FilePlus2,
  FileText,
  HelpCircle,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ConsentDialog } from './consent-dialog';
import { ApiError, useAuth } from '@/lib/auth';
import type { CaseFile, CaseItem, ChatMessage } from '@/lib/types';

type Tab = 'overview' | 'evidence' | 'research' | 'ask' | 'drafts' | 'activity';
const tabs: Array<{ id: Tab; label: string; icon: typeof FileText }> = [
  { id: 'overview', label: 'Overview', icon: FileText },
  { id: 'evidence', label: 'Evidence', icon: Paperclip },
  { id: 'research', label: 'Process', icon: Search },
  { id: 'ask', label: 'Ask Recourse', icon: MessageCircle },
  { id: 'drafts', label: 'Drafts', icon: Mail },
  { id: 'activity', label: 'Activity', icon: Clock3 },
];
const submissionChoices = [
  ['unchanged', 'A Recourse draft, unchanged'],
  ['changed', 'A Recourse draft, changed'],
  ['different', 'Something different'],
  ['previously_submitted', 'Submitted before Recourse'],
] as const;

export function CaseWorkspace({ caseId }: { caseId: string }) {
  const { request, download, user, acceptConsent } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);
  const pendingAction = useRef<null | (() => Promise<void>)>(null);
  const caseQuery = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => request<CaseItem>(`/cases/${caseId}`),
    refetchInterval: (query) =>
      query.state.data?.processing.status === 'running' ? 1500 : false,
  });
  const documentsQuery = useQuery({
    queryKey: ['documents', caseId],
    queryFn: () => request<CaseFile[]>(`/cases/${caseId}/documents`),
  });
  const chatQuery = useQuery({
    queryKey: ['chat', caseId],
    queryFn: () => request<ChatMessage[]>(`/cases/${caseId}/chat`),
    enabled: tab === 'ask',
  });
  const item = caseQuery.data;
  const documents = documentsQuery.data ?? [];

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['case', caseId] }),
      queryClient.invalidateQueries({ queryKey: ['documents', caseId] }),
      queryClient.invalidateQueries({ queryKey: ['cases'] }),
    ]);
  }
  async function act(name: string, operation: () => Promise<unknown>) {
    setBusy(name);
    setError('');
    try {
      await operation();
      await refreshAll();
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : 'That step could not be completed. Your work is still saved.',
      );
    } finally {
      setBusy('');
    }
  }
  function consented(operation: () => Promise<void>) {
    if (user?.hasAiConsent) void operation();
    else {
      pendingAction.current = operation;
      setConsentOpen(true);
    }
  }
  async function acceptAndContinue() {
    setConsentBusy(true);
    try {
      await acceptConsent();
      setConsentOpen(false);
      const next = pendingAction.current;
      pendingAction.current = null;
      if (next) await next();
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : 'Consent could not be saved.',
      );
    } finally {
      setConsentBusy(false);
    }
  }

  if (caseQuery.isLoading)
    return (
      <main className="grid min-h-[65vh] place-items-center">
        <div className="flex items-center gap-4">
          <span className="spinner-scribble" /> Opening this case…
        </div>
      </main>
    );
  if (caseQuery.error || !item)
    return (
      <main className="page-shell py-20">
        <div className="paper-panel mx-auto max-w-xl p-8 text-center">
          <AlertTriangle className="mx-auto text-[var(--red)]" />
          <h1 className="font-display mt-4 text-4xl font-bold">
            This case could not open.
          </h1>
          <p className="mt-3">
            It may have been deleted, or the connection may be unavailable.
          </p>
          <Link className="paper-button mt-6" href="/cases">
            Back to your cases
          </Link>
        </div>
      </main>
    );

  const processing = item.processing.status === 'running';
  const operationError =
    item.processing.status === 'error' ? item.processing.error : null;
  return (
    <main className="page-shell pb-24 pt-3">
      <ConsentDialog
        open={consentOpen}
        onOpenChange={setConsentOpen}
        onAccept={acceptAndContinue}
        busy={consentBusy}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="inline-flex min-h-12 items-center gap-2 text-[var(--blue-dark)]"
          href="/cases"
        >
          <ArrowLeft size={18} /> All cases
        </Link>
        <span className="flex items-center gap-2 text-[var(--muted)]">
          <span
            className={`status-dot ${['READY', 'RESOLVED'].includes(item.status) ? 'ready' : operationError ? 'error' : 'waiting'}`}
          />{' '}
          {statusLabels[item.status]}
        </span>
      </div>
      <header className="mt-4 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="eyebrow">
            {item.classification?.institution ?? 'Institution not confirmed'}
          </p>
          <h1 className="font-display mt-2 max-w-4xl text-[clamp(2.55rem,5vw,4.6rem)] font-bold leading-[.96] tracking-[-.045em]">
            {item.title}
          </h1>
        </div>
        {item.status !== 'CLOSED' && (
          <div className="flex gap-2">
            <button
              className="paper-button quiet"
              aria-label="More case actions"
              onClick={() => setTab('activity')}
            >
              <MoreHorizontal />
            </button>
          </div>
        )}
      </header>
      <nav
        className="mt-8 flex gap-1 overflow-x-auto border-b-2 border-[var(--ink)] pb-0"
        aria-label="Case sections"
        role="tablist"
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`flex min-h-12 shrink-0 items-center gap-2 rounded-t-lg border-2 border-b-0 px-3 sm:px-4 ${tab === id ? 'border-[var(--ink)] bg-[var(--paper)] -mb-[2px]' : 'border-transparent text-[var(--muted)]'}`}
            onClick={() => setTab(id)}
          >
            <Icon size={17} aria-hidden="true" />
            <span className={id === 'ask' ? '' : 'sr-only sm:not-sr-only'}>
              {label}
            </span>
          </button>
        ))}
      </nav>

      {error && (
        <div
          role="alert"
          className="paper-soft mt-6 flex items-start gap-3 border-[var(--red)] bg-[#fff0ec] p-4 text-[var(--red-dark)]"
        >
          <AlertTriangle className="mt-1 shrink-0" size={20} />
          <span>{error}</span>
          <button
            className="ml-auto"
            aria-label="Dismiss error"
            onClick={() => setError('')}
          >
            <X size={19} />
          </button>
        </div>
      )}
      {operationError && (
        <div role="alert" className="paper-panel mt-6 border-[var(--red)] p-5">
          <p className="eyebrow">Paused, not lost</p>
          <h2 className="font-display mt-1 text-2xl font-bold">
            {operationError.message}
          </h2>
          <button
            className="paper-button mt-4"
            disabled={busy === 'analyze'}
            onClick={() =>
              consented(() =>
                act('analyze', () =>
                  request(`/cases/${caseId}/analyze`, { method: 'POST' }),
                ),
              )
            }
          >
            <RefreshCw size={18} /> Try this step again
          </button>
        </div>
      )}
      {!processing && item.responses.at(-1)?.analysis && tab !== 'overview' && (
        <button
          className="paper-soft mt-6 flex w-full items-center gap-3 border-[var(--green)] bg-[#eff8ef] p-4 text-left"
          onClick={() => setTab('overview')}
        >
          <CheckCircle2 className="shrink-0 text-[var(--green)]" />
          <span>
            <strong className="font-display text-xl">
              Latest response reviewed
            </strong>
            <span className="block text-[var(--muted)]">
              See what changed and the grounded next step.
            </span>
          </span>
          <ArrowRight className="ml-auto shrink-0" />
        </button>
      )}

      <div className="mt-8 settle-in" role="tabpanel">
        {processing ? (
          <Processing operation={item.processing.operation} />
        ) : (
          <>
            {tab === 'overview' && (
              <Overview
                item={item}
                processing={false}
                busy={busy}
                onAnalyze={() =>
                  consented(() =>
                    act('analyze', () =>
                      request(`/cases/${caseId}/analyze`, { method: 'POST' }),
                    ),
                  )
                }
                onClarify={(field, answer) =>
                  consented(() =>
                    act('clarify', () =>
                      request(`/cases/${caseId}/clarifications`, {
                        method: 'POST',
                        body: JSON.stringify({ field, answer }),
                      }),
                    ),
                  )
                }
                onTab={setTab}
                onSubmit={() => setTab('drafts')}
                onRecord={() => {
                  document
                    .getElementById('submission-panel')
                    ?.scrollIntoView({ behavior: 'smooth' });
                  setTab('drafts');
                }}
              />
            )}
            {tab === 'evidence' && (
              <Evidence
                caseId={caseId}
                documents={documents}
                loading={documentsQuery.isLoading}
                busy={busy}
                onAct={act}
                request={request}
                download={download}
                onAnalyze={() =>
                  consented(() =>
                    act('analyze', () =>
                      request(`/cases/${caseId}/analyze`, { method: 'POST' }),
                    ),
                  )
                }
              />
            )}
            {tab === 'research' && (
              <Research
                item={item}
                processing={false}
                onAnalyze={() =>
                  consented(() =>
                    act('analyze', () =>
                      request(`/cases/${caseId}/analyze`, { method: 'POST' }),
                    ),
                  )
                }
              />
            )}
            {tab === 'ask' && (
              <Chat
                messages={chatQuery.data ?? []}
                loading={chatQuery.isLoading}
                busy={busy}
                onAsk={(question) =>
                  consented(() =>
                    act('chat', async () => {
                      await request(`/cases/${caseId}/chat`, {
                        method: 'POST',
                        body: JSON.stringify({ question }),
                      });
                      await queryClient.invalidateQueries({
                        queryKey: ['chat', caseId],
                      });
                    }),
                  )
                }
              />
            )}
            {tab === 'drafts' && (
              <Drafts
                item={item}
                documents={documents}
                busy={busy}
                onAct={act}
                request={request}
                download={download}
                consented={consented}
                onRefresh={refreshAll}
              />
            )}
            {tab === 'activity' && (
              <Activity
                item={item}
                busy={busy}
                onAct={act}
                request={request}
                onDeleted={() => router.replace('/cases')}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Overview({
  item,
  processing,
  busy,
  onAnalyze,
  onClarify,
  onTab,
  onRecord,
}: {
  item: CaseItem;
  processing: boolean;
  busy: string;
  onAnalyze(): void;
  onClarify(field: string, answer: string): void;
  onTab(tab: Tab): void;
  onSubmit(): void;
  onRecord(): void;
}) {
  const unknown = item.classification?.criticalUnknowns?.[0];
  const [answer, setAnswer] = useState('');
  const contradiction = item.analysis?.contradictions.find(
    (entry) => entry.needsUserClarification,
  );
  const waiting = item.status === 'AWAITING_RESPONSE';
  const latest = item.responses.at(-1);
  if (processing) return <Processing operation={item.processing.operation} />;
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_330px]">
      <div className="space-y-7">
        {item.status === 'NEW' && (
          <section className="paper-panel tape p-7 sm:p-9">
            <p className="eyebrow">Saved and ready</p>
            <h2 className="font-display mt-2 text-4xl font-bold">
              Let&apos;s understand the decision.
            </h2>
            <p className="mt-3 max-w-2xl text-xl">
              Recourse will identify the decision, ask only for essential
              missing information, research the current process, and review your
              evidence.
            </p>
            <button
              className="paper-button primary mt-6"
              disabled={busy === 'analyze'}
              onClick={onAnalyze}
            >
              <Sparkles size={19} /> Review my case
            </button>
          </section>
        )}
        {item.status === 'NEEDS_INFO' && unknown && (
          <section className="paper-panel border-[var(--blue)] p-7 sm:p-9">
            <p className="eyebrow">One thing before we continue</p>
            <h2 className="font-display mt-2 text-4xl font-bold">
              {unknown.questionForUser}
            </h2>
            <p className="mt-3 text-[var(--muted)]">
              If you do not know, say that plainly. Recourse will not guess.
            </p>
            <textarea
              className="paper-input mt-5 min-h-32"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="Type what you know…"
            />
            <button
              className="paper-button blue mt-4"
              disabled={!answer.trim() || busy === 'clarify'}
              onClick={() => {
                onClarify(unknown.field, answer);
                setAnswer('');
              }}
            >
              Save and continue <ArrowRight size={18} />
            </button>
          </section>
        )}
        {contradiction && (
          <ClarificationCard
            title="Two details do not line up"
            question={
              contradiction.questionForUser ?? 'Which version is correct?'
            }
            onSubmit={(value) =>
              onClarify('contradiction clarification', value)
            }
            busy={busy === 'clarify'}
          />
        )}
        {item.classification && (
          <section className="paper-panel p-7 sm:p-9">
            <p className="eyebrow">What happened</p>
            <h2 className="font-display mt-2 text-3xl font-bold">
              {item.classification.summary}
            </h2>
            {item.classification.statedReason && (
              <div className="paper-soft mt-5 p-4">
                <span className="text-[var(--muted)]">Reason given</span>
                <p className="mt-1 text-xl">
                  {item.classification.statedReason}
                </p>
              </div>
            )}
            {item.classification.highStakes && (
              <div className="mt-5 flex items-start gap-3 border-l-4 border-[var(--red)] pl-4">
                <AlertTriangle className="mt-1 shrink-0 text-[var(--red)]" />
                <p>
                  <strong>Consider qualified support.</strong>{' '}
                  {item.classification.highStakesReason} Recourse can still help
                  you organize facts, evidence, and official process
                  information.
                </p>
              </div>
            )}
          </section>
        )}
        {item.analysis && (
          <section className="paper-panel p-7 sm:p-9">
            <p className="eyebrow">What Recourse found</p>
            <h2 className="font-display mt-2 text-3xl font-bold">
              {item.analysis.summary}
            </h2>
            <p className="mt-4 text-xl">{item.analysis.recommendation}</p>
            {item.analysis.missingEvidence.length > 0 && (
              <div className="mt-7">
                <h3 className="font-display text-2xl font-bold">
                  Evidence that could help
                </h3>
                <ul className="mt-3 space-y-3">
                  {item.analysis.missingEvidence.map((gap) => (
                    <li key={gap.name} className="paper-soft p-4">
                      <strong>{gap.name}</strong>
                      <p className="text-[var(--muted)]">{gap.whyItMatters}</p>
                    </li>
                  ))}
                </ul>
                <button
                  className="paper-button mt-5"
                  onClick={() => onTab('evidence')}
                >
                  <Upload size={18} /> Add evidence
                </button>
              </div>
            )}
          </section>
        )}
        {['READY', 'AWAITING_SUBMISSION'].includes(item.status) && (
          <section>
            <p className="eyebrow">You choose what happens next</p>
            <h2 className="font-display mt-2 text-4xl font-bold">
              Your case is ready to use.
            </h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-3">
              <ActionCard
                icon={Mail}
                title="Draft email"
                text="A concise professional message you can copy."
                onClick={() => onTab('drafts')}
              />
              <ActionCard
                icon={FileText}
                title="Formal letter"
                text="A polished letter with a PDF preview."
                onClick={() => onTab('drafts')}
              />
              <ActionCard
                icon={MessageCircle}
                title="Ask Recourse"
                text="Grounded help with portal questions."
                onClick={() => onTab('ask')}
              />
            </div>
            <p className="mt-6 border-l-4 border-[var(--blue)] pl-4 text-[var(--muted)]">
              Recourse prepares. You send or submit it yourself.
            </p>
          </section>
        )}
        {waiting && (
          <section className="paper-panel tape bg-[#fff8cf] p-7 sm:p-9">
            <Clock3 size={33} />
            <p className="eyebrow mt-5">Your action is recorded</p>
            <h2 className="font-display mt-2 text-4xl font-bold">
              Waiting for a response
            </h2>
            <p className="mt-3 text-xl">
              Recourse is not monitoring the institution. When you hear back,
              bring the response here and continue the same case.
            </p>
            <button className="paper-button primary mt-6" onClick={onRecord}>
              I received a response
            </button>
          </section>
        )}
        {latest?.analysis && (
          <section className="paper-panel p-7 sm:p-9">
            <p className="eyebrow">Latest response reviewed</p>
            <h2 className="font-display mt-2 text-4xl font-bold">
              {latest.analysis.responseSummary}
            </h2>
            <p className="mt-4 text-xl">{latest.analysis.recommendation}</p>
            {latest.analysis.newRequests.length > 0 && (
              <div className="mt-5">
                <h3 className="font-display text-2xl font-bold">
                  What they asked for
                </h3>
                <ul className="mt-2 list-inside list-disc">
                  {latest.analysis.newRequests.map((request) => (
                    <li key={request}>{request}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
        {item.status === 'RESOLVED' && (
          <section className="paper-panel border-[var(--green)] bg-[#eff8ef] p-8 text-center">
            <CheckCircle2 className="mx-auto text-[var(--green)]" size={45} />
            <h2 className="font-display mt-4 text-4xl font-bold">
              This case is marked resolved.
            </h2>
            <p className="mt-2 text-xl">
              The complete case history stays here for your records.
            </p>
          </section>
        )}
      </div>
      <aside className="space-y-5">
        <SummaryNote item={item} />
        <div className="paper-soft p-5">
          <h2 className="font-display text-xl font-bold">The boundary</h2>
          <p className="mt-2 text-[var(--muted)]">
            No email or form is submitted by Recourse. After you act, record
            exactly what you sent.
          </p>
        </div>
      </aside>
    </div>
  );
}

function Processing({ operation }: { operation?: string }) {
  const response = operation === 'response_analysis';
  return (
    <section
      className="paper-panel tape mx-auto max-w-3xl p-8 text-center sm:p-12"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="spinner-scribble mx-auto block !size-14" />
      <p className="eyebrow mt-7">Your work is saved</p>
      <h2 className="font-display mt-2 text-4xl font-bold">
        {response
          ? 'Comparing the response with what you sent…'
          : 'Making sense of the case…'}
      </h2>
      <div className="mx-auto mt-7 grid max-w-lg gap-3 text-left">
        <ProgressLine
          done
          text={
            response ? 'Found the actual submission' : 'Reading the decision'
          }
        />
        <ProgressLine
          text={
            response ? 'Reviewing what changed' : 'Checking essential details'
          }
        />
        <ProgressLine
          text={
            response
              ? 'Preparing a grounded next step'
              : 'Researching the current process'
          }
        />
      </div>
      <p className="mt-7 text-[var(--muted)]">
        You can leave this page. The case will be here when you return.
      </p>
    </section>
  );
}
function ProgressLine({ text, done }: { text: string; done?: boolean }) {
  return (
    <div className="paper-soft flex items-center gap-3 p-3">
      {done ? <Check size={18} /> : <span className="status-dot waiting" />}{' '}
      {text}
    </div>
  );
}
function ActionCard({
  icon: Icon,
  title,
  text,
  onClick,
}: {
  icon: typeof Mail;
  title: string;
  text: string;
  onClick(): void;
}) {
  return (
    <button
      className="paper-panel min-h-[190px] p-5 text-left transition-transform hover:-translate-y-1"
      onClick={onClick}
    >
      <Icon size={26} />
      <h3 className="font-display mt-5 text-2xl font-bold">{title}</h3>
      <p className="mt-2 text-[var(--muted)]">{text}</p>
    </button>
  );
}
function SummaryNote({ item }: { item: CaseItem }) {
  return (
    <div className="paper-panel tape bg-[#fff8cf] p-6">
      <p className="eyebrow">At a glance</p>
      <dl className="mt-4 space-y-4">
        <div>
          <dt className="text-[var(--muted)]">Status</dt>
          <dd className="font-display text-xl font-bold">
            {statusLabels[item.status]}
          </dd>
        </div>
        {item.research?.procedure.deadline && (
          <div>
            <dt className="text-[var(--muted)]">Possible deadline</dt>
            <dd className="font-display text-xl font-bold text-[var(--red-dark)]">
              {item.research.procedure.deadline}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-[var(--muted)]">Last updated</dt>
          <dd>{new Date(item.updatedAt).toLocaleString()}</dd>
        </div>
      </dl>
    </div>
  );
}
function ClarificationCard({
  title,
  question,
  onSubmit,
  busy,
}: {
  title: string;
  question: string;
  onSubmit(value: string): void;
  busy: boolean;
}) {
  const [value, setValue] = useState('');
  return (
    <section className="paper-panel border-[var(--red)] p-7">
      <div className="flex items-center gap-3">
        <AlertTriangle className="text-[var(--red)]" />
        <h2 className="font-display text-3xl font-bold">{title}</h2>
      </div>
      <p className="mt-3 text-xl">{question}</p>
      <textarea
        className="paper-input mt-4 min-h-28"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button
        className="paper-button mt-4"
        disabled={!value.trim() || busy}
        onClick={() => {
          onSubmit(value);
          setValue('');
        }}
      >
        Clarify this
      </button>
    </section>
  );
}

function Evidence({
  caseId,
  documents,
  loading,
  busy,
  onAct,
  request,
  download,
  onAnalyze,
}: {
  caseId: string;
  documents: CaseFile[];
  loading: boolean;
  busy: string;
  onAct(name: string, operation: () => Promise<unknown>): Promise<void>;
  request<T>(path: string, init?: RequestInit): Promise<T>;
  download(path: string): Promise<Blob>;
  onAnalyze(): void;
}) {
  const [purpose, setPurpose] = useState('evidence');
  const [file, setFile] = useState<File | null>(null);
  async function saveFile() {
    if (!file) return;
    const form = new FormData();
    form.append('purpose', purpose);
    form.append('file', file);
    await onAct('upload', () =>
      request(`/cases/${caseId}/documents`, { method: 'POST', body: form }),
    );
    setFile(null);
  }
  async function downloadFile(document: CaseFile) {
    await onAct(`download-${document.id}`, async () => {
      const blob = await download(
        `/cases/${caseId}/documents/${document.id}/content`,
      );
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = document.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  }
  return (
    <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
      <section className="paper-panel tape h-fit p-6">
        <p className="eyebrow">Add to the record</p>
        <h2 className="font-display mt-2 text-3xl font-bold">
          Evidence or correspondence
        </h2>
        <label className="field-label mt-5" htmlFor="purpose">
          What is this?
        </label>
        <select
          id="purpose"
          className="paper-input"
          value={purpose}
          onChange={(event) => setPurpose(event.target.value)}
        >
          <option value="evidence">Supporting evidence</option>
          <option value="decision">Original decision</option>
          <option value="actual_submission">What I submitted</option>
          <option value="response">Response I received</option>
        </select>
        <label className="mt-4 flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-[7px_13px_5px_11px] border-2 border-dashed border-[var(--ink)] bg-white/60 p-5 text-center">
          <Upload size={28} />
          <span className="font-display mt-3 text-xl font-bold">
            {file ? file.name : 'Choose a file'}
          </span>
          <span className="mt-1 text-sm text-[var(--muted)]">
            PDF, DOCX, TXT, PNG, JPEG or WebP · up to 15 MB
          </span>
          <input
            className="sr-only"
            type="file"
            accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button
          className="paper-button blue mt-5 w-full"
          disabled={!file || busy === 'upload'}
          onClick={() => void saveFile()}
        >
          {busy === 'upload' ? 'Storing safely…' : 'Add this file'}{' '}
          <FilePlus2 size={18} />
        </button>
        <p className="mt-4 text-sm text-[var(--muted)]">
          Files are stored privately. They are sent to AI only after you accept
          the processing disclosure.
        </p>
      </section>
      <section>
        <div className="flex items-end justify-between">
          <div>
            <p className="eyebrow">Case documents</p>
            <h2 className="font-display mt-1 text-4xl font-bold">
              The evidence table
            </h2>
          </div>
          {documents.length > 0 && (
            <button
              className="paper-button hidden sm:inline-flex"
              onClick={onAnalyze}
            >
              <RefreshCw size={17} /> Review case again
            </button>
          )}
        </div>
        {loading && <p className="mt-8">Opening documents…</p>}
        {!loading && documents.length === 0 && (
          <div className="paper-soft mt-6 p-8 text-center">
            <Paperclip className="mx-auto" />
            <h3 className="font-display mt-4 text-2xl font-bold">
              No files added yet.
            </h3>
            <p className="mt-2 text-[var(--muted)]">
              That is okay. A case can begin with pasted text.
            </p>
          </div>
        )}
        <div className="mt-6 space-y-4">
          {documents.map((document) => (
            <article
              key={document.id}
              className="paper-panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center"
            >
              <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-[var(--old-paper)]">
                <FileText />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-display text-xl font-bold">
                  {document.filename}
                </h3>
                <p className="text-sm text-[var(--muted)]">
                  {purposeLabel(document.purpose)} ·{' '}
                  {formatBytes(document.size)} ·{' '}
                  {document.processingStatus === 'ready'
                    ? 'Reviewed'
                    : document.processingStatus === 'error'
                      ? 'Review paused'
                      : 'Stored'}
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  className="paper-button quiet !min-h-11 !p-2"
                  aria-label={`Download ${document.filename}`}
                  disabled={busy === `download-${document.id}`}
                  onClick={() => void downloadFile(document)}
                >
                  <Download size={19} />
                </button>
                <button
                  className="paper-button quiet danger !min-h-11 !p-2"
                  aria-label={`Delete ${document.filename}`}
                  onClick={() => {
                    if (confirm(`Permanently delete ${document.filename}?`))
                      void onAct(`delete-${document.id}`, () =>
                        request(`/cases/${caseId}/documents/${document.id}`, {
                          method: 'DELETE',
                        }),
                      );
                  }}
                >
                  <Trash2 size={19} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Research({
  item,
  processing,
  onAnalyze,
}: {
  item: CaseItem;
  processing: boolean;
  onAnalyze(): void;
}) {
  const process = item.research?.procedure;
  if (processing && !process) return <Processing />;
  if (!process)
    return (
      <EmptyState
        icon={Search}
        title="The current process has not been researched yet."
        text="Start the case review to look for the most applicable official process."
        action="Research this case"
        onAction={onAnalyze}
      />
    );
  if (process.status === 'NOT_FOUND' || process.status === 'UNVERIFIED')
    return (
      <div className="paper-panel mx-auto max-w-3xl p-8">
        <HelpCircle size={34} />
        <p className="eyebrow mt-5">No verified formal process</p>
        <h2 className="font-display mt-2 text-4xl font-bold">
          We could not responsibly confirm a formal route.
        </h2>
        <p className="mt-4 text-xl">{process.summary}</p>
        {process.uncertainty && (
          <p className="mt-4 text-[var(--muted)]">{process.uncertainty}</p>
        )}
        <div className="mt-6 border-l-4 border-[var(--blue)] pl-4">
          You can still draft an email, prepare a formal letter, or Ask
          Recourse. We will not invent a procedure.
        </div>
      </div>
    );
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <section className="paper-panel p-7 sm:p-9">
        <p className="eyebrow">Current applicable process</p>
        <h2 className="font-display mt-2 text-4xl font-bold">
          {process.summary}
        </h2>
        {process.deadline && (
          <div className="paper-soft mt-6 border-[var(--red)] bg-[#fff0ec] p-4">
            <strong className="font-display text-xl text-[var(--red-dark)]">
              Possible deadline: {process.deadline}
            </strong>
            <p className="mt-1 text-sm">
              Check the source and your own decision letter before relying on
              it.
            </p>
          </div>
        )}
        <ol className="mt-8 space-y-5">
          {process.steps.map((step, index) => (
            <li className="flex gap-4" key={step}>
              <span className="font-display grid size-9 shrink-0 place-items-center rounded-full border-2 border-[var(--ink)] font-bold">
                {index + 1}
              </span>
              <span className="pt-1 text-xl">{step}</span>
            </li>
          ))}
        </ol>
      </section>
      <aside>
        <p className="eyebrow">Sources checked</p>
        <div className="mt-4 space-y-4">
          {item.research?.sources.map((source) => (
            <a
              key={source.id}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="paper-soft block p-4 transition-transform hover:-translate-y-1"
            >
              <span className="text-sm uppercase tracking-wider text-[var(--green)]">
                {source.authority.replace('_', ' ')}
              </span>
              <h3 className="font-display mt-1 text-xl font-bold">
                {source.title}
              </h3>
              <p className="mt-2 line-clamp-3 text-sm text-[var(--muted)]">
                {source.excerpt}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm text-[var(--blue-dark)]">
                Open source <ExternalLink size={14} />
              </span>
            </a>
          ))}
        </div>
        <p className="mt-4 text-sm text-[var(--muted)]">
          Sources were accessed{' '}
          {item.research &&
            new Date(item.research.researchedAt).toLocaleDateString()}
          .
        </p>
      </aside>
    </div>
  );
}

function Chat({
  messages,
  loading,
  busy,
  onAsk,
}: {
  messages: ChatMessage[];
  loading: boolean;
  busy: string;
  onAsk(question: string): void;
}) {
  const [question, setQuestion] = useState('');
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-7">
        <p className="eyebrow">A case-aware workbench</p>
        <h2 className="font-display mt-2 text-4xl font-bold">Ask Recourse</h2>
        <p className="mt-2 text-xl text-[var(--muted)]">
          Especially useful when a portal asks, “Why should this decision be
          reconsidered?” Answers come from this case—not guesswork.
        </p>
      </div>
      <div className="paper-panel min-h-[420px] p-4 sm:p-6">
        <div className="space-y-5" aria-live="polite">
          {loading && <p>Opening the conversation…</p>}
          {!loading && messages.length === 0 && (
            <div className="grid min-h-64 place-items-center text-center">
              <div>
                <MessageCircle className="mx-auto" size={38} />
                <h3 className="font-display mt-3 text-2xl font-bold">
                  Ask about this case.
                </h3>
                <p className="mt-2 text-[var(--muted)]">
                  Try: “The portal asks why the decision should be reconsidered.
                  What should I write?”
                </p>
              </div>
            </div>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[88%] ${message.role === 'user' ? 'ml-auto' : ''}`}
            >
              <div
                className={`rounded-[8px_13px_7px_11px] border-2 border-[var(--ink)] p-4 ${message.role === 'user' ? 'bg-[var(--blue)] text-white' : 'bg-[#fff8cf]'}`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
              {message.role === 'assistant' && message.metadata?.needsFact && (
                <p className="mt-2 text-sm text-[var(--red-dark)]">
                  A fact is missing: {message.metadata.followUpQuestion}
                </p>
              )}
            </div>
          ))}
          {busy === 'chat' && (
            <div className="flex items-center gap-3">
              <span className="spinner-scribble !size-7" /> Checking the case…
            </div>
          )}
        </div>
        <form
          className="mt-6 flex flex-col gap-3 border-t-2 border-dashed border-[var(--line)] pt-5 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (!question.trim()) return;
            onAsk(question);
            setQuestion('');
          }}
        >
          <label className="sr-only" htmlFor="case-question">
            Ask a case question
          </label>
          <textarea
            id="case-question"
            className="paper-input min-h-14 flex-1"
            rows={2}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask about wording, evidence, or the next step…"
          />
          <button
            className="paper-button primary self-end"
            disabled={!question.trim() || busy === 'chat'}
          >
            Ask <Send size={18} />
          </button>
        </form>
      </div>
      <p className="mt-4 text-center text-sm text-[var(--muted)]">
        Recourse stays within this case. If the answer is not in the record, it
        will ask you instead of inventing it.
      </p>
    </div>
  );
}

function Drafts({
  item,
  documents,
  busy,
  onAct,
  request,
  download,
  consented,
  onRefresh,
}: {
  item: CaseItem;
  documents: CaseFile[];
  busy: string;
  onAct(name: string, operation: () => Promise<unknown>): Promise<void>;
  request<T>(path: string, init?: RequestInit): Promise<T>;
  download(path: string): Promise<Blob>;
  consented(operation: () => Promise<void>): void;
  onRefresh(): Promise<void>;
}) {
  const latestEmail = item.drafts.email.at(-1);
  const latestLetter = item.drafts.letter.at(-1);
  const [mode, setMode] = useState<'email' | 'letter'>('email');
  const [copied, setCopied] = useState(false);
  async function makeEmail(transformation: string) {
    await onAct('email', () =>
      request(`/cases/${item.id}/drafts/email`, {
        method: 'POST',
        body: JSON.stringify({ transformation }),
      }),
    );
  }
  async function makeLetter() {
    await onAct('letter', () =>
      request(`/cases/${item.id}/drafts/letter`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
  }
  async function pdf() {
    if (!latestLetter) return;
    await onAct('pdf', async () => {
      const blob = await download(
        `/cases/${item.id}/drafts/letter/${latestLetter.id}/pdf`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${item.title}-letter.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
  return (
    <div>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Prepared, never sent</p>
          <h2 className="font-display mt-2 text-4xl font-bold">Your drafts</h2>
          <p className="mt-2 text-xl text-[var(--muted)]">
            Choose a format. You copy, download, edit, and submit it yourself.
          </p>
        </div>
        <div className="paper-soft flex p-1">
          <button
            className={`min-h-11 rounded-md px-4 ${mode === 'email' ? 'bg-[var(--ink)] text-white' : ''}`}
            onClick={() => setMode('email')}
          >
            Email
          </button>
          <button
            className={`min-h-11 rounded-md px-4 ${mode === 'letter' ? 'bg-[var(--ink)] text-white' : ''}`}
            onClick={() => setMode('letter')}
          >
            Formal letter
          </button>
        </div>
      </div>
      {mode === 'email' && (
        <section className="paper-panel mt-7 p-6 sm:p-8">
          {!latestEmail ? (
            <div className="py-10 text-center">
              <Mail className="mx-auto" size={38} />
              <h3 className="font-display mt-4 text-3xl font-bold">
                Prepare a professional email
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-[var(--muted)]">
                Grounded in the decision, evidence, and verified process. It
                will not be sent.
              </p>
              <button
                className="paper-button primary mt-6"
                disabled={busy === 'email'}
                onClick={() => consented(() => makeEmail('concise'))}
              >
                {busy === 'email' ? 'Drafting…' : 'Draft the email'}{' '}
                <Sparkles size={18} />
              </button>
            </div>
          ) : (
            <div>
              <div className="flex flex-col gap-4 border-b-2 border-dashed border-[var(--line)] pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <span className="text-[var(--muted)]">Subject</span>
                  <h3 className="font-display text-2xl font-bold">
                    {latestEmail.subject}
                  </h3>
                </div>
                <button
                  className="paper-button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(
                      `Subject: ${latestEmail.subject}\n\n${latestEmail.body}`,
                    );
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  }}
                >
                  {copied ? <Check size={18} /> : <Clipboard size={18} />}{' '}
                  {copied ? 'Copied' : 'Copy email'}
                </button>
              </div>
              <div className="whitespace-pre-wrap py-7 text-xl leading-relaxed">
                {latestEmail.body}
              </div>
              {latestEmail.unresolvedFacts.length > 0 && (
                <Unresolved facts={latestEmail.unresolvedFacts} />
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className="paper-button"
                  onClick={() => consented(() => makeEmail('concise'))}
                >
                  Make shorter
                </button>
                <button
                  className="paper-button"
                  onClick={() => consented(() => makeEmail('more_formal'))}
                >
                  More formal
                </button>
                <button
                  className="paper-button quiet"
                  onClick={() => consented(() => makeEmail('regenerate'))}
                >
                  <RefreshCw size={17} /> Regenerate
                </button>
              </div>
            </div>
          )}
        </section>
      )}
      {mode === 'letter' && (
        <section className="paper-panel mt-7 p-6 sm:p-8">
          {!latestLetter ? (
            <div className="py-10 text-center">
              <FileText className="mx-auto" size={38} />
              <h3 className="font-display mt-4 text-3xl font-bold">
                Prepare a formal letter
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-[var(--muted)]">
                Unknown names and addresses stay as visible placeholders.
                Nothing is invented.
              </p>
              <button
                className="paper-button primary mt-6"
                disabled={busy === 'letter'}
                onClick={() => consented(makeLetter)}
              >
                {busy === 'letter' ? 'Drafting…' : 'Draft the formal letter'}{' '}
                <Sparkles size={18} />
              </button>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-dashed border-[var(--line)] pb-5">
                <div>
                  <p className="eyebrow">Letter preview</p>
                  <h3 className="font-display text-2xl font-bold">
                    {latestLetter.subject}
                  </h3>
                </div>
                <button
                  className="paper-button blue"
                  disabled={busy === 'pdf'}
                  onClick={() => void pdf()}
                >
                  <Download size={18} /> Download PDF
                </button>
              </div>
              <article className="mx-auto my-7 max-w-[680px] border border-[var(--line)] bg-white p-6 shadow-sm sm:p-10">
                <p className="text-right whitespace-pre-wrap">
                  {latestLetter.sender}
                  <br />
                  {latestLetter.date}
                </p>
                <p className="mt-7 whitespace-pre-wrap">
                  {latestLetter.recipient}
                </p>
                <h4 className="font-bold mt-7">{latestLetter.subject}</h4>
                <p className="mt-6">{latestLetter.salutation}</p>
                {latestLetter.paragraphs.map((paragraph) => (
                  <p className="mt-4" key={paragraph}>
                    {paragraph}
                  </p>
                ))}
                <p className="mt-6">{latestLetter.closing}</p>
                <p className="mt-8">{latestLetter.signatory}</p>
              </article>
              {latestLetter.unresolvedFacts.length > 0 && (
                <Unresolved facts={latestLetter.unresolvedFacts} />
              )}
              <button
                className="paper-button mt-5"
                onClick={() => consented(makeLetter)}
              >
                <RefreshCw size={17} /> Create another revision
              </button>
            </div>
          )}
        </section>
      )}
      <SubmissionPanel
        item={item}
        documents={documents}
        busy={busy}
        onAct={onAct}
        request={request}
        onRefresh={onRefresh}
      />
    </div>
  );
}

function SubmissionPanel({
  item,
  documents,
  busy,
  onAct,
  request,
}: {
  item: CaseItem;
  documents: CaseFile[];
  busy: string;
  onAct(name: string, operation: () => Promise<unknown>): Promise<void>;
  request<T>(path: string, init?: RequestInit): Promise<T>;
  onRefresh(): Promise<void>;
}) {
  const submitted =
    item.submission && !('pendingPriorSubmission' in item.submission);
  const waiting = item.status === 'AWAITING_RESPONSE';
  const [open, setOpen] = useState(
    Boolean(item.submission && 'pendingPriorSubmission' in item.submission),
  );
  const [responseOpen, setResponseOpen] = useState(false);
  const [method, setMethod] = useState('email');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [choice, setChoice] = useState(
    item.submission && 'pendingPriorSubmission' in item.submission
      ? 'previously_submitted'
      : 'unchanged',
  );
  const [actual, setActual] = useState('');
  const [draftId, setDraftId] = useState(
    item.drafts.email.at(-1)?.id ?? item.drafts.letter.at(-1)?.id ?? '',
  );
  const [reference, setReference] = useState('');
  const [response, setResponse] = useState('');
  return (
    <section
      id="submission-panel"
      className="mt-10 border-t-2 border-[var(--ink)] pt-8"
    >
      <p className="eyebrow">Keep the record truthful</p>
      <h2 className="font-display mt-2 text-4xl font-bold">
        {waiting
          ? 'Waiting for a response'
          : submitted
            ? 'Submission recorded'
            : 'After you take action'}
      </h2>
      <p className="mt-3 max-w-2xl text-xl text-[var(--muted)]">
        Recourse does not submit anything. Once you do, record exactly what was
        sent so a future response is compared with the right version.
      </p>
      {!submitted && !open && (
        <button
          className="paper-button primary mt-6"
          onClick={() => setOpen(true)}
        >
          I&apos;ve submitted
        </button>
      )}
      {open && !submitted && (
        <form
          className="paper-panel mt-6 grid gap-5 p-6 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void onAct('submission', () =>
              request(`/cases/${item.id}/submission`, {
                method: 'POST',
                body: JSON.stringify({
                  method,
                  date,
                  referenceNumber: reference,
                  sourceChoice: choice,
                  draftRevisionId: choice === 'unchanged' ? draftId : undefined,
                  actualText: choice !== 'unchanged' ? actual : undefined,
                  documentIds: documents
                    .filter(
                      (document) => document.purpose === 'actual_submission',
                    )
                    .map((document) => document.id),
                }),
              }),
            );
          }}
        >
          <div>
            <label className="field-label" htmlFor="submission-method">
              How did you submit?
            </label>
            <select
              id="submission-method"
              className="paper-input"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="email">Email</option>
              <option value="portal">Online portal</option>
              <option value="post">Post</option>
              <option value="in_person">In person</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="submission-date">
              Date submitted
            </label>
            <input
              id="submission-date"
              className="paper-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="submission-reference">
              Reference number{' '}
              <span className="font-normal text-[var(--muted)]">
                (optional)
              </span>
            </label>
            <input
              id="submission-reference"
              className="paper-input"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
          <fieldset className="sm:col-span-2">
            <legend className="field-label">What did you use?</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {submissionChoices.map(([value, label]) => (
                <label
                  key={value}
                  className={`paper-soft flex cursor-pointer gap-3 p-3 ${choice === value ? 'border-[var(--blue)] bg-[#edf4ff]' : ''}`}
                >
                  <input
                    type="radio"
                    name="choice"
                    value={value}
                    checked={choice === value}
                    onChange={() => setChoice(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          {choice === 'unchanged' ? (
            <div className="sm:col-span-2">
              <label className="field-label" htmlFor="submission-draft">
                Draft used
              </label>
              <select
                id="submission-draft"
                className="paper-input"
                value={draftId}
                onChange={(e) => setDraftId(e.target.value)}
              >
                {item.drafts.email.map((draft) => (
                  <option key={draft.id} value={draft.id}>
                    Email: {draft.subject}
                  </option>
                ))}
                {item.drafts.letter.map((draft) => (
                  <option key={draft.id} value={draft.id}>
                    Letter: {draft.subject}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="sm:col-span-2">
              <label className="field-label" htmlFor="actual-submission">
                Paste what you actually submitted
              </label>
              <textarea
                id="actual-submission"
                className="paper-input min-h-40"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                placeholder="Paste the exact submitted version here. You can also upload it under Evidence → What I submitted."
              />
              <p className="mt-2 text-sm text-[var(--muted)]">
                {
                  documents.filter(
                    (document) => document.purpose === 'actual_submission',
                  ).length
                }{' '}
                uploaded submission file(s) will also be attached to this
                record.
              </p>
            </div>
          )}
          <div className="flex gap-3 sm:col-span-2">
            <button
              className="paper-button primary"
              disabled={busy === 'submission'}
            >
              {busy === 'submission' ? 'Recording…' : 'Record my submission'}
            </button>
            <button
              type="button"
              className="paper-button quiet"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {waiting && !responseOpen && (
        <button
          className="paper-button primary mt-6"
          onClick={() => setResponseOpen(true)}
        >
          I received a response
        </button>
      )}
      {waiting && responseOpen && (
        <form
          className="paper-panel mt-6 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            void onAct('response', () =>
              request(`/cases/${item.id}/responses`, {
                method: 'POST',
                body: JSON.stringify({
                  text: response,
                  documentIds: documents
                    .filter((document) => document.purpose === 'response')
                    .map((document) => document.id),
                }),
              }),
            );
          }}
        >
          <label className="field-label" htmlFor="received-response">
            What did they say?
          </label>
          <textarea
            id="received-response"
            className="paper-input min-h-48"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="Paste the response exactly. You can also upload it under Evidence → Response I received."
          />
          <p className="mt-2 text-sm text-[var(--muted)]">
            Recourse will compare this with the immutable version you recorded
            as submitted.
          </p>
          <div className="mt-5 flex gap-3">
            <button
              className="paper-button primary"
              disabled={busy === 'response'}
            >
              {busy === 'response' ? 'Saving…' : 'Save and review response'}
            </button>
            <button
              type="button"
              className="paper-button quiet"
              onClick={() => setResponseOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Activity({
  item,
  busy,
  onAct,
  request,
  onDeleted,
}: {
  item: CaseItem;
  busy: string;
  onAct(name: string, operation: () => Promise<unknown>): Promise<void>;
  request<T>(path: string, init?: RequestInit): Promise<T>;
  onDeleted(): void;
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <section>
        <p className="eyebrow">Case history</p>
        <h2 className="font-display mt-2 text-4xl font-bold">
          What happened here
        </h2>
        <ol className="relative mt-8 space-y-0 border-l-2 border-dashed border-[var(--ink)] pl-7">
          {[...item.activity].reverse().map((entry, index) => (
            <li
              key={entry.id ?? `${entry.type}-${index}`}
              className="relative pb-7"
            >
              <span className="absolute -left-[36px] top-1 size-4 rounded-full border-2 border-[var(--ink)] bg-[var(--paper)]" />
              <h3 className="font-display text-xl font-bold">{entry.label}</h3>
              <time className="text-sm text-[var(--muted)]">
                {new Date(entry.at).toLocaleString()}
              </time>
            </li>
          ))}
        </ol>
      </section>
      <aside className="space-y-5">
        <div className="paper-soft p-5">
          <h3 className="font-display text-2xl font-bold">Case controls</h3>
          <button
            className="paper-button mt-4 w-full"
            disabled={item.status === 'CLOSED'}
            onClick={() =>
              void onAct('close', () =>
                request(`/cases/${item.id}/close`, { method: 'POST' }),
              )
            }
          >
            Close case
          </button>
          {item.status !== 'RESOLVED' && item.status !== 'CLOSED' && (
            <button
              className="paper-button mt-3 w-full"
              onClick={() =>
                void onAct('resolve', () =>
                  request(`/cases/${item.id}/resolve`, { method: 'POST' }),
                )
              }
            >
              <CheckCircle2 size={18} /> Mark resolved
            </button>
          )}
        </div>
        <div className="paper-soft border-[var(--red)] p-5">
          <h3 className="font-display text-2xl font-bold text-[var(--red-dark)]">
            Permanent deletion
          </h3>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Deletes stored evidence first, then this case and its history. If an
            evidence file cannot be removed, the case stays here so you can
            retry safely.
          </p>
          <button
            className="paper-button danger mt-4 w-full"
            disabled={busy === 'delete-case'}
            onClick={() => {
              if (
                confirm(
                  'Permanently delete this case and every file? This cannot be undone.',
                )
              )
                void onAct('delete-case', async () => {
                  await request(`/cases/${item.id}`, { method: 'DELETE' });
                  onDeleted();
                });
            }}
          >
            <Trash2 size={18} /> Delete permanently
          </button>
        </div>
      </aside>
    </div>
  );
}
function EmptyState({
  icon: Icon,
  title,
  text,
  action,
  onAction,
}: {
  icon: typeof Search;
  title: string;
  text: string;
  action: string;
  onAction(): void;
}) {
  return (
    <div className="paper-panel mx-auto max-w-2xl p-9 text-center">
      <Icon className="mx-auto" size={42} />
      <h2 className="font-display mt-4 text-3xl font-bold">{title}</h2>
      <p className="mt-3 text-xl text-[var(--muted)]">{text}</p>
      <button className="paper-button primary mt-6" onClick={onAction}>
        {action}
      </button>
    </div>
  );
}
function Unresolved({ facts }: { facts: string[] }) {
  return (
    <div className="paper-soft border-[var(--red)] bg-[#fff8e7] p-4">
      <strong className="font-display text-xl">
        Check these placeholders before using the draft
      </strong>
      <ul className="mt-2 list-inside list-disc">
        {facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
    </div>
  );
}
function purposeLabel(value: string) {
  return (
    (
      {
        decision: 'Original decision',
        evidence: 'Supporting evidence',
        actual_submission: 'Actual submission',
        response: 'Received response',
      } as Record<string, string>
    )[value] ?? 'Document'
  );
}
function formatBytes(bytes: number) {
  return bytes > 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
