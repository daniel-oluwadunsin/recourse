# Recourse setup and operations

This guide is the operational handoff for the current repository. Read `IMPLEMENTATION_REPORT.md` before deploying: the repository has production-oriented foundations, but the documented launch blockers remain real.

## 1. Runtime inventory

- Node.js: supported `>=20.9.0`; verified locally with `24.15.0`
- package manager: pnpm `9.0.0`
- workspace/build: Turborepo `2.10.10`, TypeScript `5.9.3`
- web: Next.js `16.3.1`, React/React DOM `19.2.8`
- API/worker: NestJS `11.2.1`
- MongoDB client: Mongoose `9.9.2`
- queues: BullMQ `6.1.2`, ioredis `6.0.0`
- browser tests: Playwright `1.62.1`; deterministic tests: Vitest `4.1.10`
- storage: Cloudinary SDK `2.10.0`, private raw assets
- AI: Groq SDK `1.5.0`; `openai/gpt-oss-20b` for fast tasks, `openai/gpt-oss-120b` for high-value reasoning, configured vision fallback from `GROQ_MODEL_VISION`
- retrieval: Tavily SDK `0.7.7`, search followed by source extraction
- embeddings: Voyage HTTPS API, `voyage-4-lite`, 1,024 dimensions
- email: Nodemailer `9.0.5`, ImapFlow `1.7.1`, Gmail SMTP/IMAP
- telemetry: Sentry Node `10.70.0`; OpenTelemetry export variables are defined but full OTEL tracing is not implemented

The lockfile is authoritative for all transitive versions.

## 2. Prerequisites

Install Node.js, Corepack, Docker Desktop (or local Redis), and access to a MongoDB replica set. MongoDB transactions are required. Atlas is required for production vector/search indexes; a standalone local MongoDB process is insufficient.

```bash
corepack enable
corepack prepare pnpm@9.0.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
```

Generate independent secrets and place them in `.env`:

```bash
openssl rand -base64 48
openssl rand -base64 48
openssl rand -hex 32
```

Use the first two for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`. Use the third for `EMAIL_WEBHOOK_SECRET` only when deploying a signed inbound gateway. Never commit `.env`.

## 3. Local infrastructure

Start Redis:

```bash
docker compose -f docker-compose.dev.yml up -d redis
redis-cli ping
```

Use MongoDB Atlas, or start a local MongoDB replica set. The application uses transactions; initialize the local set once with `rs.initiate()` and use a URI such as `mongodb://127.0.0.1:27017/recourse?replicaSet=rs0`.

Validate configuration and create conventional indexes:

```bash
pnpm env:check
pnpm db:institutions
pnpm db:indexes
```

On Atlas, also create/verify vector and lexical search indexes:

```bash
pnpm atlas:indexes
```

`pnpm atlas:indexes` must run against MongoDB Atlas. A local MongoDB deployment rejects `$listSearchIndexes`; that failure is expected and must not be reported as an Atlas verification pass.

The four expected search index names are `evidence_blocks_vector`, `procedure_source_chunks_vector`, `evidence_blocks_lexical`, and `procedure_source_chunks_lexical` unless overridden in `.env`.

## 4. Run the application

Run each service in a separate terminal. The API and worker must both be running; uploads can complete without processing when the worker is absent.

```bash
pnpm web:dev
pnpm api:dev
pnpm worker:dev
```

Endpoints:

- web: `http://localhost:3000`
- API base: `http://localhost:4000/api/v1`
- OpenAPI: `http://localhost:4000/api/docs`
- liveness: `http://localhost:4000/health/live`
- readiness: `http://localhost:4000/health/ready`
- worker heartbeat: `http://localhost:4000/api/v1/health/worker`

`pnpm dev` builds the workspace first and then starts all development services, but separate terminals make failures easier to inspect.

## 5. Provider setup and live checks

### MongoDB Atlas

1. Create separate staging and production projects/clusters.
2. Require TLS, create least-privilege database users, and allow only API/worker egress IPs or private networking. Do not allow `0.0.0.0/0` in production.
3. Put the application URI in the secret manager as `MONGODB_URI`; set `MONGODB_DATABASE` separately per environment.
4. Set `MONGODB_AUTO_INDEX=false` outside local development.
5. Run `pnpm db:indexes`, then `pnpm atlas:indexes` from an authorized release job.
6. Verify backups, point-in-time recovery, alerts, and restore procedure.

### Redis

1. Provision managed Redis with TLS, authentication, persistence appropriate to BullMQ, and no public ingress.
2. Set `REDIS_URL` and a unique `REDIS_PREFIX` per environment.
3. Confirm eviction is not configured to discard BullMQ keys under normal load.
4. Start one worker and verify `/api/v1/health/worker` returns `worker: ok`.

### Groq

1. Create a project-scoped API key and store it as `GROQ_API_KEY` on API and worker hosts.
2. Confirm the configured models are enabled in the account.
3. Review Groq data-use, retention, and zero-data-retention controls for the account. Enable the strictest available no-training/ZDR setting before sending real evidence.
4. Run `pnpm groq:check`. It performs a non-consequential strict structured-output request.

### Tavily

1. Create a project/key, set `TAVILY_API_KEY` and optional `TAVILY_PROJECT_ID`.
2. Set credit ceilings and alerts; keep application-side limits enabled.
3. Review retention/privacy terms because search queries can contain case classification data. Do not send raw private evidence.
4. Run `pnpm tavily:check`; it verifies search and extraction, not snippets alone.

### Cloudinary

1. Use a dedicated product/environment cloud and restricted credentials.
2. Keep assets private/authenticated; do not create public delivery transformations for the evidence folder.
3. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, and an environment-specific `CLOUDINARY_UPLOAD_FOLDER`.
4. Configure retention/deletion review and access logs in Cloudinary.
5. Run `LIVE_CLOUDINARY_CHECK=true pnpm cloudinary:check`. The check uploads, reads metadata, creates signed access, and deletes its temporary asset.

### Voyage embeddings

1. Create a project-scoped API key and set `EMBEDDING_API_KEY`.
2. Review provider retention/training/privacy settings before embedding evidence text.
3. Keep `EMBEDDING_MODEL=voyage-4-lite` and `EMBEDDING_DIMENSIONS=1024` aligned with Atlas vector indexes.
4. Run `pnpm embedding:check`.

### Gmail

1. Use a dedicated Gmail/Workspace mailbox, enable 2-Step Verification, create an app password, and enable IMAP.
2. Set `EMAIL_PROVIDER=gmail`, `GMAIL_EMAIL`, and `GMAIL_APP_PASSWORD` in the secret manager.
3. Restrict mailbox access and establish retention/deletion policy. Review Google Workspace data-region and admin audit settings if available.
4. Set `EMAIL_INBOUND_ENABLED=true` only after the case-specific reply address and mailbox polling behavior have been tested in staging.
5. Run `pnpm gmail:check`. It verifies SMTP and read-only IMAP connectivity and sends no message.
6. A real outbound test must target a mailbox you control, use a verified procedure destination, and pass through the persisted approval gate. Never send a test appeal to a real institution.

### Sentry and OpenTelemetry

1. Create separate Sentry projects for API, worker, and web if web telemetry is later enabled.
2. Set server-side `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, and a conservative `SENTRY_TRACES_SAMPLE_RATE`.
3. Configure server-side PII scrubbing and disable request bodies, evidence text, authorization headers, and cookies.
4. Set `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, and `OTEL_SERVICE_NAME` only after an OTEL SDK/export path is implemented; variables alone do not provide traces.

### Vercel, API/worker hosts, DNS, and webhooks

1. Deploy `apps/web` to Vercel. Set `NEXT_PUBLIC_API_URL` to the public HTTPS API origin at build time.
2. Deploy API and worker as separate long-running services from the same release. Do not deploy the BullMQ worker to a request-only/serverless runtime.
3. Configure API health probes: `/health/live` for liveness and `/health/ready` for readiness. Configure the worker host process probe and use `/api/v1/health/worker` from the API as an end-to-end heartbeat check.
4. Set `WEB_URL`, `API_URL`, `CORS_ALLOWED_ORIGINS`, `AUTH_COOKIE_SECURE=true`, `AUTH_COOKIE_SAME_SITE=lax` or stricter, and `TRUST_PROXY=true` only behind a trusted proxy.
5. Create DNS records such as `app.example.com` and `api.example.com`, enforce HTTPS/HSTS, and restrict API ingress.
6. The optional signed inbound gateway posts to `https://api.example.com/api/v1/email/inbound` with `X-Recourse-Email-Signature: sha256=<HMAC>`. Gmail polling does not require public webhook DNS.
7. Rotate all staging secrets before production; never reuse local or staging JWT/provider secrets.

## 6. Verification commands

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
pnpm audit --prod --audit-level high
pnpm db:indexes
pnpm db:institutions            # seed/update canonical institution records
pnpm atlas:indexes             # Atlas only
LIVE_CLOUDINARY_CHECK=true pnpm cloudinary:check
pnpm groq:check
pnpm tavily:check
pnpm embedding:check
pnpm gmail:check
```

The authenticated Playwright test requires an isolated test account:

```bash
E2E_REAL_BACKEND=1 E2E_EMAIL='test-account@example.com' E2E_PASSWORD='secret-from-manager' pnpm e2e
```

Do not put a real password in shell history; inject it from CI secrets in shared environments.

## 7. Manual end-to-end flow

1. Sign up/sign in. The dashboard must load only after a successful server session. Refresh the browser and verify the rotating refresh cookie restores the session.
2. Select **New case**. Enter the institution as written, relationship, decision type, dates, jurisdiction, reason, and explicit financial impact. Upload a real adverse-decision PDF/image/DOCX/EML/TXT or paste its exact text. Confirm consent outside Recourse until the missing in-product consent control is implemented.
3. Submit. The UI must open the case workspace. Activity should show persisted creation, classification, procedure retrieval, evidence processing, and later analysis events. A file should progress `UPLOADING → UPLOADED → PROCESSING → READY`; failures must show a stable error code.
4. Review **Decision** and save corrections. Original extracted fields remain in the durable decision record/event history.
5. Review **Evidence**. Select each item, open its private signed copy, inspect extracted blocks/page provenance, and verify claims are labeled verified, externally verified, user asserted, inferred, contradicted, or unknown. **Add evidence** must upload to the current case.
6. Review **Procedure** and **Sources**. Material claims must link to extracted source snapshots and authoritative institution pages. Search snippets, community threads, user guides, and videos do not become Tier 1 merely because they are hosted on an official domain. Unknown/conflicting requirements must remain visible.
7. Review **Case graph**, **Timeline**, overview gaps, contradictions, readiness score, deadlines, and activity. Graph information must also be represented textually. If analysis finds unresolved items, the overview must separate them by owner: answer only the questions under **What we need from you** (use “I do not know” when truthful); Recourse-owned analysis must run internally; institution-owned unknowns must appear as disclosure requests and must not block drafting. Saving user answers creates audited text evidence and queues analysis again.
8. Confirm that recommended next steps remain visible after analysis. In **Appeals & actions**, generate a grounded draft. Verify factual/procedural coverage and that unsupported material assertions or procedural claims whose authority has been revoked block action creation/approval/execution.
9. Create a gated action with the capability actually supported by the procedure. Approve it. For `ASSISTED_PORTAL` or `MANUAL`, Recourse does not submit anything: the user must complete the official flow and retain/upload the acknowledgement. For `EMAIL`, execute only against a verified official mailto destination; Gmail provider acceptance is not institution receipt.
10. After a real institution response arrives, open **Responses** and upload the response PDF/image/text, or allow the dedicated mailbox poller to associate a reply sent to the case-specific address. The UI should show `RECEIVED`, then `ANALYZED`, the outcome/reason, addressed and unaddressed claims, requested evidence, and the bounded next action. Activity should show response receipt, analysis, replanning, and the resulting state transition.
11. Verify notifications and deadlines. Mark an in-app notification read and confirm the state persists after refresh.
12. Sign out and confirm protected URLs redirect to sign-in. Do not test account/evidence deletion on production data; use a disposable staging account.

## 8. Failure inspection and recovery

- API readiness: `curl -fsS http://localhost:4000/health/ready`
- worker heartbeat: `curl -fsS http://localhost:4000/api/v1/health/worker`
- persisted failures: authenticated `GET /api/v1/admin/queues/failures` as `STAFF`/`ADMIN`
- queue health: authenticated `GET /api/v1/admin/queues/health`
- MongoDB: inspect `workflow_dispatches`, `job_failures`, `ai_runs`, `retrieval_runs`, `outbound_emails`, and `case_events` by case ID; never paste evidence bodies into tickets/logs
- BullMQ: inspect failed/stalled counts with a protected operations tool connected to the environment Redis

Provider and extraction jobs are idempotent and retry according to their retry category. Fix the provider/configuration cause before retrying. Consequential actions must not be blindly replayed: inspect the idempotency key, provider reference, outbound email record, and verification status first. Reconcile pending `workflow_dispatches` by restarting a healthy API/worker; the dispatch loop republishes durable pending events.

## 9. Staging and production checklist

Before staging:

- provision Atlas/Redis/Cloudinary/Groq/Tavily/Voyage/Gmail/Sentry;
- set environment-specific secrets and run all live checks;
- enable Atlas search indexes;
- use an isolated test mailbox/account and a non-institution recipient;
- complete the authenticated E2E and manual flow;
- exercise password reset with a disposable account and decide whether the documented missing verification, consent, and export features block the staging audience.

Before production:

- implement verification delivery, explicit document-processing consent, and case export;
- enable and validate malware scanning or formally restrict accepted formats/risk until it exists;
- enable inbound response polling only after staging validation;
- configure Sentry/alerts/backups/restore, secret rotation, privacy/ZDR settings, retention jobs, and incident runbooks;
- complete accessibility, load, disaster-recovery, and independent security review;
- verify every institution route and keep unsupported routes `ASSISTED_PORTAL`, `MANUAL`, or `UNSUPPORTED`.
