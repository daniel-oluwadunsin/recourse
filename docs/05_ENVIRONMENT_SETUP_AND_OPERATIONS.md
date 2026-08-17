# Recourse — Environment Setup and Operations Guide

**Version:** 1.0  
**Date:** 2026-08-16

This document defines the expected external services, environment variables, local-development topology, staging/production setup, health checks, and operational workflows.

---

# 1. Required external services

## 1.1 MongoDB Atlas

Purpose:

- system-of-record database;
- case state;
- events;
- procedure/source metadata;
- evidence metadata and text blocks;
- AI/retrieval audit data;
- Vector Search indexes.

Production requirements:

- replica-set/Atlas deployment that supports required transactions/features;
- TLS;
- IP/network access restricted to deployed services where practical;
- database user with least-privilege application permissions;
- backups enabled;
- separate staging and production databases/projects where practical.

Do not store raw uploaded binaries in MongoDB.

## 1.2 Redis

Purpose:

- BullMQ queues;
- delayed/reminder jobs;
- concurrency/rate coordination;
- ephemeral queue infrastructure.

Production requirements:

- managed Redis suitable for BullMQ;
- durable/high-availability configuration appropriate to launch requirements;
- TLS when provider supports it;
- worker connection settings aligned with current BullMQ production guidance;
- separate staging/prod instances or strong namespace isolation.

## 1.3 Groq

Purpose:

- structured classification/extraction;
- case reasoning;
- procedure verification;
- evidence reasoning;
- response analysis/replanning;
- multimodal fallback where applicable.

Required setup:

1. Create a GroqCloud project.
2. Create a server-side API key.
3. Review project model permissions.
4. Ensure selected GPT-OSS models are allowed.
5. Review current data controls and enable Zero Data Retention where appropriate for sensitive production case data.
6. Set project spend/rate limits/alerts appropriate to environment.

Never expose the Groq key to Next.js browser code.

## 1.4 Tavily

Purpose:

- live procedure source discovery;
- source extraction;
- site map/crawl for fragmented official help centers;
- retrieval usage accounting.

Required setup:

1. Create Tavily account/project.
2. Generate API key.
3. Review credits/rate limits.
4. Enable usage tracking in requests where supported.
5. Set application-side budgets for Search/Extract/Crawl/Map.

Never use search snippets alone as evidence.

## 1.5 S3-compatible object storage

Recommended:

- Cloudinary

Purpose:

- original user evidence;
- rendered document pages;
- raw source snapshots if retained;
- case exports.

Production requirements:

- private bucket;
- no public ACL;
- server-side encryption;
- signed upload/download URLs;
- lifecycle cleanup for temporary renders;
- CORS limited to application origins for direct uploads;
- separate staging/production bucket or prefix with strong IAM isolation.

## 1.6 Embedding provider

Only required if embeddings are generated in the application rather than by Atlas automated embedding.

Provider must be abstracted behind `EmbeddingProvider`.

Before production:

- review current data retention;
- select model/dimensions;
- configure vector index accordingly;
- document migration implications if model changes.

## 1.7 Email provider

Needed for:

- transactional user notifications;
- optionally inbound case-response forwarding;
- optionally supported real email-based procedural actions.

Provider should support signed inbound webhooks if inbound email is part of V1.

Do not choose a provider purely from this document; Codex should verify current provider capability when the email phase begins. Good candidates historically include Postmark, Resend, SendGrid, and AWS SES, but the selected provider must be validated against current inbound-routing requirements.

## 1.8 Observability

Recommended minimum:

- Sentry for application exceptions/performance; and/or
- OpenTelemetry-compatible tracing/metrics backend.

No raw private evidence should be included in telemetry.

## 1.9 Deployment

Recommended topology:

- Next.js web: Vercel;
- Nest API: container host;
- Nest worker: separate container service;
- MongoDB Atlas;
- managed Redis;
- cloudinary

Potential container hosts can include Fly.io, Render, Railway, Google Cloud Run, AWS ECS, or another production container runtime. Choose based on team account availability and worker/background-process support, not trendiness.

---

# 2. Environment variables

Codex must generate the final `.env.example` from the actual implementation. The following is the target inventory.

## 2.1 Application

```bash
NODE_ENV=development
APP_ENV=local
WEB_URL=http://localhost:3000
API_URL=http://localhost:4000
API_PORT=4000
API_PREFIX=/api/v1
LOG_LEVEL=debug
```

Production:

- `WEB_URL` and `API_URL` must be canonical HTTPS origins;
- CORS allowlist derived from explicit config, not `*`.

## 2.2 MongoDB

```bash
MONGODB_URI=
MONGODB_DATABASE=recourse
MONGODB_MAX_POOL_SIZE=
MONGODB_MIN_POOL_SIZE=
```

Do not put credentials in source control.

## 2.3 Redis/BullMQ

```bash
REDIS_URL=
REDIS_PREFIX=recourse:local:

QUEUE_CASE_CONCURRENCY=5
QUEUE_PROCEDURE_CONCURRENCY=3
QUEUE_EVIDENCE_CONCURRENCY=3
QUEUE_AI_CONCURRENCY=5
QUEUE_NOTIFICATION_CONCURRENCY=10
QUEUE_EXTERNAL_ACTION_CONCURRENCY=2
```

Provider-specific rate variables may include:

```bash
GROQ_REQUESTS_PER_WINDOW=
TAVILY_REQUESTS_PER_WINDOW=
```

Do not guess account limits; configure from actual provider limits.

## 2.4 Auth

```bash
JWT_ACCESS_SECRET=
JWT_ACCESS_TTL=15m
JWT_REFRESH_SECRET=
JWT_REFRESH_TTL=30d
AUTH_COOKIE_NAME=recourse_refresh
AUTH_COOKIE_DOMAIN=
AUTH_COOKIE_SECURE=false

PASSWORD_RESET_TOKEN_TTL_MINUTES=30
EMAIL_VERIFICATION_TOKEN_TTL_HOURS=24
```

Secrets should be cryptographically strong random values generated outside code.

Production must use secure cookies.

## 2.5 Groq

```bash
GROQ_API_KEY=
GROQ_MODEL_FAST=openai/gpt-oss-20b
GROQ_MODEL_REASONING=openai/gpt-oss-120b
GROQ_MODEL_VISION=
GROQ_MODEL_SAFETY=
GROQ_DEFAULT_REASONING_EFFORT=medium
GROQ_REQUEST_TIMEOUT_MS=
```

`GROQ_MODEL_VISION` should be populated with the currently supported model actually selected during implementation.

`GROQ_MODEL_SAFETY` is optional unless the safety classifier is implemented.

## 2.6 Tavily

```bash
TAVILY_API_KEY=
TAVILY_SEARCH_MAX_RESULTS=8
TAVILY_MAX_QUERIES_PER_PROCEDURE=5
TAVILY_CRAWL_MAX_DEPTH=2
TAVILY_CRAWL_MAX_PAGES=20
TAVILY_INCLUDE_USAGE=true
```

Tune values by cost/quality; they are application budgets, not provider claims.

## 2.7 Embeddings

If using app-managed provider:

```bash
EMBEDDING_PROVIDER=voyage
EMBEDDING_API_KEY=
EMBEDDING_MODEL=
EMBEDDING_DIMENSIONS=
EMBEDDING_BATCH_SIZE=
```

If Atlas automated embeddings are used instead, remove unused secrets and document Atlas configuration.

## 2.8 Object storage

cloudinary:

```bash
OBJECT_STORAGE_PROVIDER=s3
OBJECT_STORAGE_ENDPOINT=
OBJECT_STORAGE_REGION=auto
OBJECT_STORAGE_BUCKET=
OBJECT_STORAGE_ACCESS_KEY_ID=
OBJECT_STORAGE_SECRET_ACCESS_KEY=
OBJECT_STORAGE_FORCE_PATH_STYLE=false

PRESIGNED_UPLOAD_TTL_SECONDS=900
PRESIGNED_DOWNLOAD_TTL_SECONDS=300
```

For R2, endpoint/region semantics should follow current Cloudflare documentation.

## 2.9 Upload limits

```bash
UPLOAD_MAX_BYTES_PDF=
UPLOAD_MAX_BYTES_IMAGE=
UPLOAD_MAX_BYTES_DOCX=
UPLOAD_MAX_BYTES_EMAIL=
UPLOAD_MAX_PAGES=
```

Do not choose absurdly high defaults. Limits should protect memory/cost.

## 2.10 Email

Final names depend on chosen provider. Abstract names can be:

```bash
EMAIL_PROVIDER=
EMAIL_API_KEY=
EMAIL_FROM_ADDRESS=
EMAIL_FROM_NAME=Recourse
EMAIL_INBOUND_DOMAIN=
EMAIL_WEBHOOK_SECRET=
EMAIL_REPLY_DOMAIN=
```

## 2.11 Sentry/observability

```bash
SENTRY_DSN=
SENTRY_ENVIRONMENT=
SENTRY_RELEASE=
OTEL_EXPORTER_OTLP_ENDPOINT=
OTEL_EXPORTER_OTLP_HEADERS=
OTEL_SERVICE_NAME=recourse-api
```

Frontend public Sentry variables, if used, must only expose values designed to be public.

## 2.12 Feature flags

Keep minimal:

```bash
FEATURE_INBOUND_EMAIL=false
FEATURE_PROCEDURE_CHANGE_MONITORING=false
FEATURE_CASE_CHAT=false
FEATURE_LIVE_PROVIDER_TESTS=false
```

Do not use flags to hide unfinished fake behavior in production.

## 2.13 Live integration test gate

```bash
LIVE_PROVIDER_TESTS=false
LIVE_TEST_SAFE_EMAIL_RECIPIENT=
```

Live tests must be deliberately enabled and safe.

---

# 3. Local development setup

## 3.1 Prerequisites

Expected:

- Git;
- Node.js active LTS supported by installed packages;
- pnpm via Corepack or official installation;
- Docker/Desktop/compatible runtime for local Redis if used;
- access to MongoDB Atlas development database;
- provider API keys for live Groq/Tavily tests when needed.

## 3.2 Initial setup

Expected workflow after code exists:

```bash
git clone <repo>
cd recourse
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
```

Populate required secrets.

Start local Redis:

```bash
docker compose -f docker-compose.dev.yml up -d redis
```

Verify env:

```bash
pnpm env:check
```

Create/verify indexes:

```bash
pnpm db:indexes
```

Run services:

```bash
pnpm dev
```

or separately:

```bash
pnpm --filter web dev
pnpm --filter api start:dev
pnpm --filter worker start:dev
```

The actual final scripts must be documented by Codex after implementation.

---

# 4. MongoDB Atlas setup

## 4.1 Create project/cluster

Recommended:

- development project/cluster separate from production;
- region close to API/worker deployment;
- backup enabled in production;
- networking restricted.

## 4.2 Database user

Create an application user with only permissions required by the Recourse database.

Avoid using organization-owner/admin credentials in the application URI.

## 4.3 Vector Search indexes

The final index definitions depend on embedding dimensions and schema. Codex must generate scripts/JSON definitions from the actual implementation.

At minimum expect separate indexes for:

- private `evidence_blocks` vector + metadata fields (`caseId`, `evidenceId`, type/date);
- procedure/source chunks with metadata (`procedureId`, `institutionId`, `jurisdiction`, `authorityTier`, version).

The application should expose an index verification script that fails clearly when expected indexes are absent.

## 4.4 Text indexes

Create lexical indexes for exact search where needed, including identifiers, names, codes, and normalized text.

---

# 5. Redis/BullMQ setup

## 5.1 Local

Use Docker Redis.

## 5.2 Production

Follow current BullMQ production guidance.

Important characteristics:

- resilient reconnection;
- worker `maxRetriesPerRequest` behavior compatible with BullMQ;
- TLS/provider URL handling;
- no ephemeral free-tier configuration that silently evicts queue keys;
- monitoring of memory/latency/queue backlog.

## 5.3 Queue health

Admin/monitoring should expose:

- waiting count;
- active count;
- delayed count;
- failed count;
- oldest waiting age;
- failure reason categories.

---

# 6. Groq setup and operational policy

## 6.1 Project/key

Use dedicated project API key.

Avoid sharing a personal catch-all key between unrelated products.

## 6.2 Data controls

Before real private case processing:

- review current Groq data-handling docs;
- enable Zero Data Retention when it matches your account/product requirements;
- avoid optional features that require retention unless intentionally accepted;
- document chosen configuration.

## 6.3 Model permissions

Allow only models the project actually uses when practical.

This reduces accidental spend/model drift.

## 6.4 Model verification

At app startup or live-provider test, do not call models unnecessarily. A safe health command can verify configured model IDs before release.

## 6.5 Rate/cost policy

- 20B default for low-risk typed transforms;
- 120B only for high-value reasoning;
- context selection before prompt construction;
- no entire-case dumps by default;
- track token use/cost by operation.

---

# 7. Tavily setup and operational policy

## 7.1 Search strategy

For procedure resolution:

1. query official institution domain if known;
2. query jurisdiction-specific official pages;
3. retrieve actual URLs;
4. use Extract;
5. use Map/Crawl only if required.

## 7.2 Cost guards

Configure hard per-resolution budgets:

- maximum number of queries;
- maximum search results inspected;
- maximum extracted pages;
- maximum crawl depth/pages;
- cache reuse/freshness.

## 7.3 Failure policy

If Tavily is unavailable:

- use sufficiently fresh previously verified procedure if allowed by risk policy;
- otherwise mark procedure unresolved/delayed;
- never substitute Groq's remembered process as authoritative.

---

# 8. Object storage setup

## 8.1 Bucket policy

Private only.

Application role/key permissions:

- PutObject/GetObject/DeleteObject only within bucket/prefix needed;
- ListBucket if application requires it;
- no account-wide permissions.

## 8.2 CORS

Allow only expected web origins/methods/headers for presigned direct upload.

## 8.3 Lifecycle

Recommended:

- original evidence retained according to case/user retention settings;
- derived page renders deleted after configurable period unless needed for UI;
- temporary failed-upload objects cleaned;
- exports expire unless user retention policy says otherwise.

---

# 9. Email setup

After provider is selected:

1. verify sending domain;
2. configure SPF/DKIM/DMARC as provider requires;
3. configure inbound domain/routing if used;
4. point signed webhook to staging/production API;
5. store webhook secret;
6. test replay/signature rejection;
7. configure a safe support/reply address.

Case inbound aliases must use opaque tokens, not guessable case IDs alone.

---

# 10. Deployment environment layout

## 10.1 Staging

Staging should use:

- real Groq;
- real Tavily;
- real object storage staging bucket;
- real managed/isolated Mongo database;
- real Redis;
- real email sandbox/staging configuration;
- separate public domain/subdomain;
- no production user data.

Staging is where the complete live integration flow is tested.

## 10.2 Production

Production needs:

- locked down secrets;
- monitored MongoDB/Redis;
- backups;
- TLS;
- custom domains;
- provider spend alerts;
- Sentry/tracing;
- rate limits;
- security scan reviewed;
- privacy/data-retention decisions documented.

---

# 11. CI/CD

## 11.1 Deterministic CI

Every PR:

```text
install frozen dependencies
→ lint
→ typecheck
→ unit tests
→ integration tests
→ build web/api/worker
→ security/dependency scan
```

## 11.2 E2E

Run Playwright against an ephemeral/staging build.

Do not perform destructive/consequential external platform submissions from CI.

## 11.3 Live provider tests

Run manually or scheduled in staging with explicit credentials and `LIVE_PROVIDER_TESTS=true`.

Safe checks only.

---

# 12. Health endpoints

API should provide:

```text
GET /health/live
GET /health/ready
```

`live`: process responsive.

`ready`: required backing services reachable enough to serve traffic, such as Mongo; decide whether transient providers should mark the whole API unready or be represented as degraded health.

Worker should expose/log equivalent health via platform mechanism or HTTP health sidecar if necessary.

Detailed health information must not leak secrets/internal connection data publicly.

---

# 13. Operational runbooks

## 13.1 Queue backlog

Symptoms:

- cases stuck “processing”;
- oldest job age rising.

Check:

1. worker replicas healthy;
2. Redis connectivity;
3. provider rate limits;
4. failed job reasons;
5. concurrency configuration.

Do not simply purge queues.

## 13.2 Provider rate limiting

- classify 429 separately;
- honor retry headers where provided;
- queue delay/backoff;
- reduce concurrency;
- surface degraded processing if sustained.

## 13.3 Procedure retrieval degradation

- verify Tavily status/credits;
- inspect query/result logs without exposing user-sensitive content;
- inspect official source availability;
- verify no source-ranking regression;
- do not mark procedure verified from stale model output.

## 13.4 Groq structured-output failure

Strict mode should guarantee schema shape for supported models, but semantic failure/refusal can still occur.

- inspect operation/model/prompt version;
- ensure input was compatible;
- use explicit unknown/refusal handling;
- avoid retry loops that hallucinate harder.

## 13.5 Stuck external action

Never blindly rerun.

1. inspect idempotency key;
2. inspect provider response/reference;
3. call verify method/read external state if supported;
4. only retry when non-execution is established.

## 13.6 Suspected data exposure

- revoke relevant secrets/sessions;
- preserve audit logs;
- stop affected integration;
- follow incident-response/legal notification process appropriate to jurisdiction;
- rotate credentials;
- inspect access logs.

---

# 14. Backup and recovery

## MongoDB

- production backups enabled;
- test restore procedure periodically.

## Object storage

- versioning or retention policy evaluated for production;
- understand delete semantics/privacy obligations.

## Redis

Queue durability does not replace MongoDB as case state. If Redis is lost, persistent case state/events must allow repair/re-enqueue of incomplete stages using reconciliation jobs.

Implement a maintenance reconciler eventually:

```text
find cases in processing state with no active/recent corresponding job
→ verify stage
→ enqueue idempotent recovery job
```

---

# 15. Safe end-to-end manual test flow

The final implementation should support this real-product flow without mocked runtime dependencies:

1. Sign up with a real test user.
2. Create a case using a real adverse-decision screenshot/PDF/email that the tester is authorized to use.
3. Confirm file is uploaded to real staging object storage.
4. Observe persisted activity events via SSE.
5. Groq classifies the decision.
6. Confirm/edit classification.
7. Tavily searches the live web for the current official procedure.
8. Tavily extracts actual official source pages.
9. Groq structures/validates procedure claims.
10. Open Procedure page and click source support.
11. Upload real supporting documents (redacted test-safe versions when appropriate).
12. Observe evidence extraction/claim graph.
13. Verify evidence gaps and readiness calculation.
14. Generate a grounded appeal draft.
15. Inspect grounding coverage and evidence/source links.
16. If the real institution has no integrated API, verify Recourse truthfully shows `ASSISTED_PORTAL` and official URL/instructions rather than fake submission.
17. If a real safe email-based action exists and has been configured, approve and send to the authorized test destination, then verify message ID.
18. Ingest a real/safely generated institutional reply or test mailbox response through the real email provider pipeline.
19. Observe response analysis and replanning.
20. Verify deadlines/notifications.

This proves Recourse's intelligence and infrastructure without fabricating an external platform response.

---

# 16. Pre-production personal checklist

The final Codex handoff should tell the operator to confirm:

- [ ] MongoDB Atlas cluster/user/networking/backup;
- [ ] Vector Search indexes applied;
- [ ] Redis provisioned and persistence/eviction reviewed;
- [ ] Groq project/key/model permissions/data controls/ZDR;
- [ ] Tavily key/credits/budget;
- [ ] object storage bucket/CORS/IAM/lifecycle;
- [ ] embedding provider/index dimensions, if used;
- [ ] email provider/domain/webhooks, if used;
- [ ] Sentry/OTel;
- [ ] Vercel web env;
- [ ] API/worker host env/secrets;
- [ ] production domains and CORS;
- [ ] TLS;
- [ ] provider spend alerts;
- [ ] privacy policy/terms/data retention appropriate to launch;
- [ ] security scan reviewed;
- [ ] staging full-flow test passes;
- [ ] no runtime mock/simulator remains.

