# Recourse final implementation audit

Audit date: 20 August 2026. This report is a handoff, not marketing. `IMPLEMENTED` means the capability exists in production code and has deterministic coverage or live verification noted below. `PARTIAL` means meaningful code exists but at least one required behavior is absent or unverified. `NOT IMPLEMENTED` is an explicit gap. `NOT APPLICABLE` means the requirement is optional/non-goal for this release.

## Executive assessment

Recourse has a coherent Next.js/NestJS/MongoDB/BullMQ implementation with real Cloudinary, Groq, Tavily, Voyage, and Gmail adapters. Durable case events, outbox dispatch, evidence provenance, procedure source snapshots, grounded drafting, approval-gated actions, SSE, response analysis, and replanning are present. The upload-to-current-case defect is fixed, file evidence is queued and refreshed in the UI, and uploaded institution responses now become durable response records automatically after extraction. Case analysis now assigns every unresolved item to `USER`, `RECOURSE`, or `INSTITUTION`: only genuinely user-answerable facts become questions, internal analysis stays internal, and institution-only facts become non-blocking disclosure requests carried into the appeal.

The repository is **not yet approved for unrestricted production launch**. The principal product blockers are verification delivery/enforcement, explicit sensitive-document consent, and structured case export. The current local environment also has inbound Gmail polling, malware scanning, Sentry, metrics, and Atlas Search disabled/unavailable. Those facts are not hidden behind fake success states.

## Architecture actually built

```text
Browser / Next.js web
        │ REST + SSE, short-lived access token
        ▼
NestJS API ─── MongoDB (durable case state, audit, outbox)
    │  │
    │  └──── Redis/BullMQ ─── NestJS worker
    │                            ├─ case orchestration
    │                            ├─ evidence extraction
    │                            ├─ procedure retrieval
    │                            ├─ bounded AI operations
    │                            ├─ notifications/email polling
    │                            └─ maintenance/reconciliation
    ├─ Cloudinary private raw assets
    ├─ Groq structured outputs
    ├─ Tavily search + source extraction
    ├─ Voyage embeddings
    └─ Gmail SMTP + IMAP
```

MongoDB is the durable state owner. BullMQ owns queued work. Cloudinary owns binaries. Models return schema-validated structured outputs; conversational memory is not required for correctness.

## PRD functional requirement matrix

| Requirement                             | Status          | Evidence and gaps                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8.1 Authentication/account management   | PARTIAL         | Account creation, Argon2id login, rotating refresh tokens, logout, owner-scoped `me`, account deletion, and password reset are implemented. Reset requests are enumeration-safe in content/timing floor, tokens are hashed/single-use/expiring, Gmail delivery is confirmed, and reset revokes all sessions. Email verification delivery/enforcement, data export, and explicit document-processing consent are absent.                   |
| 8.2 Case creation                       | IMPLEMENTED     | Structured form, pasted text, PDF/DOCX/EML/TXT/images, SHA-256, durable evidence, async classification, review/correction, and original/corrected decision projections exist. A failed post-create upload now directs the user to retry in the created case instead of creating a duplicate.                                                                                                                                              |
| 8.3 Jurisdiction resolution             | PARTIAL         | User-entered jurisdiction and classification candidates are persisted; IP is not used. There is no dedicated `NEEDS_USER_INPUT` substate/UI and institution contracting-entity resolution is limited.                                                                                                                                                                                                                                     |
| 8.4 Live procedural retrieval           | IMPLEMENTED     | Cache/freshness check, targeted queries, page-type-aware authority ranking, Tavily search then extraction, immutable snapshots, strict extraction, claim verification, conflict/confidence data, version activation, and UI provenance exist. User posts/community pages/media hosted on an official domain are explicitly not Tier 1. Live Tavily search/extract passed. Coverage quality still depends on official source availability. |
| 8.5 Procedure version/change monitoring | PARTIAL         | Immutable versions, source hashes, freshness, and maintenance queue foundations exist. Scheduled fleet-wide re-fetch and automatic affected-case impact analysis are not complete.                                                                                                                                                                                                                                                        |
| 8.6 Evidence ingestion                  | IMPLEMENTED     | Supported formats, private Cloudinary raw assets, opaque keys, hashes, type/size/signature checks, statuses, native extraction, blocks, labels, provenance, signed download, deduplication, and tombstoned deletion exist. Malware scanning is optional and currently disabled locally.                                                                                                                                                   |
| 8.7 Atomic evidence claims              | IMPLEMENTED     | Versioned strict extraction creates claims with evidence/block references, status, confidence, timestamps, and AI audit records.                                                                                                                                                                                                                                                                                                          |
| 8.8 Evidence statuses                   | IMPLEMENTED     | Verified document/external, user asserted, inferred, contradicted, and unknown semantics are persisted and visibly badged. Contract spelling uses `EXTERNAL_VERIFIED` rather than PRD prose `VERIFIED_EXTERNAL`.                                                                                                                                                                                                                          |
| 8.9 Persistent case graph               | IMPLEMENTED     | Graph nodes/edges are persisted and versioned; UI renders the graph plus non-canvas labels/metadata.                                                                                                                                                                                                                                                                                                                                      |
| 8.10 Timeline reconstruction            | IMPLEMENTED     | Persisted events retain raw/normalized dates, precision, source references, and confidence.                                                                                                                                                                                                                                                                                                                                               |
| 8.11 Requirement matching               | PARTIAL         | SATISFIED/MISSING/UNCERTAIN/CONFLICTED matching, links, reason, confidence, and critical gaps exist. PRD `PARTIAL`/`NOT_APPLICABLE` are not first-class match enums and recommendation text is limited.                                                                                                                                                                                                                                   |
| 8.12 Deterministic readiness            | IMPLEMENTED     | Versioned deterministic computation, factors, score, explanations, API, and UI exist.                                                                                                                                                                                                                                                                                                                                                     |
| 8.13 Contradiction detection            | IMPLEMENTED     | Deterministic candidates plus bounded semantic analysis, severity, open/resolved state, references, and UI exist. Entity-resolution depth remains conservative.                                                                                                                                                                                                                                                                           |
| 8.14 Controlled recommendations         | IMPLEMENTED     | Shared enum taxonomy, Zod schemas, readiness recommendations, and response replanning constrain outputs. No arbitrary runtime action type is accepted.                                                                                                                                                                                                                                                                                    |
| 8.15 Grounded appeal generation         | IMPLEMENTED     | Structured arguments, factual/procedural references, bounded non-duplicative claim selection, coverage, unsupported assertion count, contradiction count, persisted drafts, institution disclosure requests, and submission blocking exist.                                                                                                                                                                                               |
| 8.16 Capability model                   | IMPLEMENTED     | `AUTO_API`, `EMAIL`, `ASSISTED_PORTAL`, `MANUAL`, `UNSUPPORTED` contracts exist. No fictional `AUTO_API` implementation is registered. Assisted portal truthfully cannot execute.                                                                                                                                                                                                                                                         |
| 8.17 Human approval gates               | IMPLEMENTED     | Proposal/action record, payload hash, separate approval, execution, result, verification, audit, cancellation endpoint, and UI gates exist. Approval and prepared actions revalidate current procedural-claim authority before reuse/execution.                                                                                                                                                                                           |
| 8.18 External verification              | IMPLEMENTED     | Gmail requires provider acceptance/message ID; assisted portal returns no submission and no verified result. Institution receipt is never inferred from SMTP acceptance. No safe live send was performed in this audit.                                                                                                                                                                                                                   |
| 8.19 Response ingestion                 | IMPLEMENTED     | Signed webhook, Gmail polling, copied/uploaded text and file evidence, case-token association, idempotency, uploaded-response association, analysis, response UI, and provenance exist. Local `EMAIL_INBOUND_ENABLED=false`, so mailbox polling was not exercised.                                                                                                                                                                        |
| 8.20 Replanning                         | IMPLEMENTED     | Response analysis persists outcome/reason/addressed/unaddressed claims/new issues/requests; orchestration transitions to replanning and produces one controlled next step with rationale.                                                                                                                                                                                                                                                 |
| 8.21 Deadlines                          | PARTIAL         | Persisted deadlines, trigger/source/confidence/timezone/business-day calculation, recalculation, reminders, and API/overview UI exist. Full change-history presentation and all ambiguous-conflict scenarios are not exhaustively covered in UI.                                                                                                                                                                                          |
| 8.22 Notifications                      | PARTIAL         | Durable in-app notifications, read state, email delivery service, reminder jobs, and several case triggers exist. The complete PRD trigger catalogue has not been verified one by one, and inbound polling is disabled locally.                                                                                                                                                                                                           |
| 8.23 Ask Recourse                       | NOT APPLICABLE  | PRD says this “may” be provided. No chatbot was added; durable case screens remain authoritative.                                                                                                                                                                                                                                                                                                                                         |
| 8.24 Activity feed                      | IMPLEMENTED     | Append-only MongoDB events, workflow dispatch, SSE with reconnect/last-event recovery, and persisted activity UI exist. No fake frontend activity animation is used.                                                                                                                                                                                                                                                                      |
| 8.25 Case export                        | NOT IMPLEMENTED | No PDF/ZIP/document case packet endpoint or UI exists. This is a V1 launch blocker.                                                                                                                                                                                                                                                                                                                                                       |

## PRD trust, non-functional, V1, and edge-case audit

| Area                                 | Status         | Notes                                                                                                                                                                                                  |
| ------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 10.1 No fabrication                  | IMPLEMENTED    | Missing integrations fail or use truthful manual/unsupported capabilities; retrieval snippets are not evidence.                                                                                        |
| 10.2 No guaranteed legal conclusions | IMPLEMENTED    | UI and outputs use confidence/uncertainty; no success-rate guarantee.                                                                                                                                  |
| 10.3 Hidden institutional reasoning  | IMPLEMENTED    | The product does not claim access to private risk signals.                                                                                                                                             |
| 10.4 Prompt injection                | IMPLEMENTED    | External content is delimited/untrusted, prompt rules and schema/provenance validation exist. Dedicated adversarial eval depth should expand.                                                          |
| 10.5 Sensitive data                  | PARTIAL        | Private storage, signed URLs, log redaction, deletion, hashes, auth, and audit exist. Explicit consent, malware scanning, complete privacy review, and production telemetry scrubbing are outstanding. |
| 11.1 Reliability                     | IMPLEMENTED    | Durable outbox, idempotent jobs, retries, failures, heartbeat, transactions, and action idempotency exist. Disaster-recovery/load evidence is outstanding.                                             |
| 11.2 Performance                     | PARTIAL        | Async boundaries/persisted reads are correct; no production p95/load-test report exists.                                                                                                               |
| 11.3 Scalability                     | IMPLEMENTED    | Stateless API, independent worker, queue concurrency/rate limits, pagination, indexes, cache, and object storage.                                                                                      |
| 11.4 Auditability                    | IMPLEMENTED    | AI/retrieval/action audit models include operations, versions, hashes/references, output, usage/latency, and errors.                                                                                   |
| 11.5 Accessibility                   | PARTIAL        | Semantic buttons/links, labels, visible focus/contrast, textual graph data, and keyboard-friendly controls exist. No formal WCAG audit or screen-reader matrix was completed.                          |
| 12.1 V1 must-have aggregate          | PARTIAL        | All listed capabilities except case export are present at least partially; account recovery/consent are also production blockers from 8.1.                                                             |
| 12.2 Nice-to-have                    | NOT APPLICABLE | Direct OAuth connectors, team workspaces, billing, multilingual UI, and advanced adapters were intentionally not added. Gmail mailbox polling is implemented without a user Gmail OAuth connector.     |
| 12.3 Non-goals                       | IMPLEMENTED    | No CAPTCHA bypass, credential harvesting, universal auto-submission, legal representation, success prediction, money movement, or blockchain.                                                          |
| 13.1 unidentified institution        | PARTIAL        | Raw name/unknown state is preserved, but dedicated candidate/user-input workflow is limited.                                                                                                           |
| 13.2 vague reason                    | IMPLEMENTED    | Unknown/low-confidence fields remain explicit.                                                                                                                                                         |
| 13.3 authenticated source            | IMPLEMENTED    | No credential scraping; such paths resolve to assisted/manual/human.                                                                                                                                   |
| 13.4 conflicting sources             | IMPLEMENTED    | Conflicts persist and reduce confidence/readiness.                                                                                                                                                     |
| 13.5 duplicate evidence/events       | IMPLEMENTED    | SHA-256 unique indexes and idempotency keys prevent silent duplication.                                                                                                                                |
| 13.6 provider/rate-limit failure     | IMPLEMENTED    | Classified retries/failures and durable state; observed Groq rate-limit/failure records remain inspectable.                                                                                            |
| 13.7 deletion during processing      | IMPLEMENTED    | Tombstones and revision checks stop late jobs from resurrecting data.                                                                                                                                  |
| 13.8 unsupported action              | IMPLEMENTED    | Explicit capability prevents fake submission.                                                                                                                                                          |
| 14 Product metrics                   | PARTIAL        | Application metrics foundations and persistent audit data exist; `METRICS_ENABLED=false` locally and no product analytics dashboard is configured.                                                     |

## Technical specification audit

| Spec section               | Status                               | Implementation                                                                                                                                                                                                      |
| -------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–3 goals/topology         | IMPLEMENTED                          | pnpm/Turbo monorepo with `apps/web`, `apps/api`, `apps/worker`, and shared packages.                                                                                                                                |
| 4 version policy           | IMPLEMENTED                          | Exact versions locked; no newly introduced overlapping framework.                                                                                                                                                   |
| 5 frontend                 | IMPLEMENTED                          | Next App Router, strict TypeScript, React Query, Zustand memory token, responsive protected shell, documented routes including added Responses.                                                                     |
| 6 API conventions/modules  | IMPLEMENTED                          | Nest modules, global validation/error envelope, request IDs, Swagger, rate limits, no business logic in controllers.                                                                                                |
| 7 auth/authorization       | PARTIAL                              | Auth, owner scoping, rotating sessions, enumeration-safe single-use password reset, and account deletion are implemented. Email verification is incomplete. Organizations are future/not applicable.                |
| 8.1–8.19 Mongo models      | IMPLEMENTED                          | Named schemas/indexes exist for all specified core models and later queue/email/graph models.                                                                                                                       |
| 9 state machine            | IMPLEMENTED                          | Explicit transition map, transactional event+state mutation, revision/idempotency guards.                                                                                                                           |
| 10–11 queues/orchestrator  | IMPLEMENTED                          | BullMQ queues, identities, retries, concurrency, outbox dispatch, crash recovery, worker heartbeat.                                                                                                                 |
| 12–14 AI/prompts/injection | IMPLEMENTED                          | Groq abstraction, model router, strict schemas, versioned prompts, AI runs, separated tool/reasoning phases, provenance validation.                                                                                 |
| 15–16 retrieval/snapshots  | IMPLEMENTED                          | Tavily discovery/extraction, authority scoring, normalization, immutable snapshots, procedure versions/claims.                                                                                                      |
| 17 evidence pipeline       | IMPLEMENTED                          | Direct-to-storage intent, completion integrity check, extraction, optional multimodal fallback, blocks, failures, deletion.                                                                                         |
| 18 embeddings/retrieval    | PARTIAL                              | Voyage provider and Atlas vector/lexical definitions exist. Live embedding passed; current local MongoDB cannot verify Atlas Search execution.                                                                      |
| 19 evidence intelligence   | IMPLEMENTED                          | Claims, deduplication, conservative entity metadata, contradictions. Entity resolution is not a full master-data service.                                                                                           |
| 20 graph                   | IMPLEMENTED                          | Persisted versioned nodes/edges and UI.                                                                                                                                                                             |
| 21 readiness               | IMPLEMENTED                          | Deterministic, versioned, tested readiness.                                                                                                                                                                         |
| 22 grounding               | IMPLEMENTED                          | Structured draft + post-generation verifier and blocking gate.                                                                                                                                                      |
| 23 responses/replanning    | IMPLEMENTED                          | Email/upload association, analysis, events, state transitions, bounded replan.                                                                                                                                      |
| 24 outbound actions        | IMPLEMENTED                          | Adapter contract, Gmail and assisted portal adapters, approval and verification. No official platform API adapter is invented.                                                                                      |
| 25 email                   | IMPLEMENTED                          | Gmail SMTP, IMAP polling, signed webhook boundary, case reply tokens, inbound/outbound persistence. Polling disabled in current environment.                                                                        |
| 26 SSE                     | IMPLEMENTED                          | Authenticated SSE, heartbeats, last-event recovery, pub/sub wakeup plus MongoDB source of truth.                                                                                                                    |
| 27 endpoints               | PARTIAL                              | Core endpoints and password-reset request/complete endpoints exist. Optional explicit response POST is replaced by evidence-kind automation. Case export and email-verification endpoints are absent.               |
| 28 storage                 | IMPLEMENTED                          | Cloudinary private raw assets with opaque keys and short-lived signed delivery.                                                                                                                                     |
| 29 security                | PARTIAL                              | Headers/CORS/rate limits/validation/auth/private URLs/log redaction/SSRF URL controls and secure password reset are present. Scanner, consent, security review, and email verification remain.                      |
| 30 observability           | PARTIAL                              | Structured redacted logs, metrics registry, Sentry server hooks, queue failures, provider audit records. Sentry/metrics/OTEL are not configured locally; full tracing absent.                                       |
| 31 cost controls           | IMPLEMENTED                          | Provider limits, queue rate limits, per-case/day limits, Tavily credit ceiling/cache, model routing.                                                                                                                |
| 32 retention/deletion      | PARTIAL                              | Retention variables, tombstones, account/evidence cleanup exist. Automated full retention sweeps and production lifecycle proof need operational validation.                                                        |
| 33 environment separation  | IMPLEMENTED                          | Typed environment and per-environment prefixes/secrets; actual staging/production infrastructure is user work.                                                                                                      |
| 34–35 deployment/runtime   | PARTIAL                              | Independent buildable web/API/worker topology and health probes exist. No checked-in production Dockerfiles/IaC or deployed staging evidence.                                                                       |
| 36 CI/CD                   | PARTIAL                              | GitHub workflow/foundational gates exist; no proven release/deploy pipeline or migration approval workflow.                                                                                                         |
| 37 testing                 | IMPLEMENTED with gaps                | Unit/integration/queue/E2E/provider checks exist. Authenticated real-backend Playwright and an interactive live case lifecycle were completed with a disposable QA account; load/DR/accessibility tests are absent. |
| 38 evaluation harness      | PARTIAL                              | Deterministic operation/provenance tests exist; no broad golden corpus with measured accuracy targets.                                                                                                              |
| 39 live providers          | IMPLEMENTED with environment caveats | Cloudinary, Groq, Tavily, Voyage, Gmail connectivity passed. No consequential email/platform submission. Atlas Search and inbound mailbox processing not live-verified locally.                                     |
| 40 failure modes           | IMPLEMENTED                          | Provider errors, retries, stale revisions, failures collection, outbox reconciliation, truthful degraded behavior.                                                                                                  |
| 41 scalability             | PARTIAL                              | Horizontal boundaries/limits are correct; no production capacity/load report.                                                                                                                                       |
| 42 coding standards        | IMPLEMENTED                          | Strict TS, DI, cohesive services, schemas, no `any` in domain additions, idempotent side effects.                                                                                                                   |
| 43 env groups              | IMPLEMENTED                          | `.env.example` covers all 169 typed runtime keys plus four test-only E2E keys.                                                                                                                                      |
| 44 MCP distinction         | NOT APPLICABLE                       | No MCP runtime product dependency was introduced.                                                                                                                                                                   |
| 45 Web3 note               | NOT APPLICABLE                       | No blockchain/wallet/token functionality.                                                                                                                                                                           |
| 46 readiness checklist     | PARTIAL                              | Code gates/providers largely pass; launch blockers and external controls remain below.                                                                                                                              |
| 47 drafting references     | NOT APPLICABLE                       | Specification provenance, not a runtime requirement.                                                                                                                                                                |
| 48 summary                 | PARTIAL                              | Architecture matches; product is not launch-complete until explicit blockers are closed.                                                                                                                            |

## Verification performed

Deterministic/local:

- environment parser: passed (`local`, `development`)
- web/API/worker typechecks: passed after fixes
- web/API lint on changed code: passed; final workspace gates are listed below
- Vitest: 24 files passed, 92 tests passed; one explicit Groq live test skipped by its opt-in flag
- Playwright: 3 public/reset tests passed, then all 4 tests passed with the isolated real-backend QA account
- MongoDB conventional indexes: all named indexes verified; equivalent legacy `tokenHash_1` was safely matched, removed, and recreated as `case_email_tokens_hash_unique`
- Redis/API readiness: passed
- worker heartbeat: passed
- production dependency audit: no known vulnerabilities

Live, safe provider checks:

- Cloudinary: upload, metadata, signed download, delete passed
- Groq: strict structured output using `openai/gpt-oss-20b` passed
- Tavily: search and underlying-page extract passed
- Voyage: 1,024-dimensional `voyage-4-lite` embedding passed
- Gmail: SMTP verify and read-only IMAP mailbox verify passed; `sent=false`

Interactive live lifecycle verification used disposable case `RC-7467A9B984DF4C8A` and a real TXT adverse-decision fixture through the web UI. Cloudinary upload completed, the worker extracted evidence blocks/claims, the human evidence-attestation control was exercised, Groq analysis ran, a user-answerable deadline question was answered in-product and reprocessed, readiness reached 84% with zero critical gaps and zero open contradictions, and a 100% factual/100% procedural grounded draft was generated. An `ASSISTED_PORTAL` action was approved and prepared against the verified YouTube help article. It remained explicitly “Not executed / not verified”; no YouTube form was submitted. The audit then found that older domain-only authority logic had promoted three user/community/media pages. Those three snapshots and eight dependent procedure claims were downgraded, and the affected unsubmitted draft/actions were blocked. New retrievals use the corrected page-type-aware classifier.

Not performed or not safe in this audit:

- no external appeal, institution email, regulator filing, or portal submission
- no Atlas Search index/query verification because `MONGODB_URI` targets local MongoDB; the command now reaches MongoDB and fails closed with the expected Atlas-only error
- no Gmail inbox consumption because `EMAIL_INBOUND_ENABLED=false`
- no malware scan because no scanner is configured and `MALWARE_SCAN_REQUIRED=false`; evidence truthfully records `SKIPPED`
- no Sentry/OTEL emission because they are unconfigured
- no load, disaster-recovery, penetration, or formal accessibility audit

## Important fixes in the final audit

- Case list rows navigate to case details.
- **Add evidence** on a case now opens an in-case uploader instead of `/cases/new`.
- Intake non-image documents are classified as decision notices, not generic text.
- Failed intake uploads preserve the created case and provide a direct retry path without duplicate case creation.
- Evidence and response screens refresh while processing; SSE invalidates every material case query rather than only case/events.
- Uploaded `INSTITUTION_RESPONSE` evidence becomes an idempotent `CaseResponse`, emits `RESPONSE_RECEIVED`, and enters analysis/replanning.
- Added a Responses screen and case tab showing outcome, reason, requests, confidence, and replanned action.
- Gmail live check now uses the same `getOrThrow` configuration behavior as production.
- Mongo index setup migrates one precisely validated legacy token-hash index name.
- Password recovery/profile copy no longer falsely blames unconfigured email.
- Malware scanning stays an explicit optional boundary: absent scanner means `SKIPPED`, not `CLEAN`.
- Analysis v2 assigns unresolved facts to user, Recourse, or institution. The API discards unsupported user/internal questions unless they reference a concrete missing requirement or open contradiction.
- The overview asks only user-owned questions, shows Recourse work and institution disclosure requests separately, persists answers as audited text evidence, and re-runs analysis.
- Reanalysis reuses the durable claim/timeline ledger and does not duplicate extraction for already-processed evidence.
- Same-source claim restatements are no longer treated as contradictions; persisted open counts are recomputed after resolution.
- Appeal composition now bounds large claim sets deterministically, removes repeated variants, and remains fully grounding-verified.
- Official-domain authority is page-aware: community posts, user threads, channel pages, and videos cannot establish Tier-1 procedure claims.
- Assisted handoff selects the official page containing appeal/submission instructions, presents a production UI instead of raw recommendation JSON, and remains `PREPARED`/unverified until a real external completion is confirmed.
- Approved/prepared actions revalidate current source authority and become unavailable if their procedural grounding is revoked.
- API throttling remains fail-closed, but 429 responses now expose stable production copy instead of the internal `ThrottlerException` class name.

## Repository structure

```text
recourse/
├── apps/
│   ├── api/                 NestJS REST API and domain services
│   │   └── src/
│   │       ├── common/      authz, security, observability, HTTP errors
│   │       ├── database/    MongoDB connection and named indexes
│   │       └── modules/     auth, cases, evidence, retrieval, procedure,
│   │                        intelligence, appeals, email, queues, health
│   ├── web/                 Next.js App Router application
│   │   ├── app/             public/auth/protected routes
│   │   ├── components/      shell, case workspace, uploader, UI primitives
│   │   └── lib/             API, session, React Query, types
│   └── worker/              NestJS BullMQ processors and heartbeat
├── packages/
│   ├── config/              typed environment schema
│   ├── contracts/           shared Zod contracts/enums
│   ├── eslint-config/
│   ├── logger/              structured redacted logging
│   ├── observability/       metrics primitives
│   └── typescript-config/
├── scripts/                 environment/index/live-provider checks
├── e2e/                     Playwright flows and safe synthetic fixtures
├── test/                    workspace foundation tests
├── docs/                    authoritative PRD/spec/design/operations/acceptance
├── .env.example             complete non-secret environment template
├── SETUP.md                 zero-to-production operations guide
└── IMPLEMENTATION_REPORT.md this audit
```

## Security and operational implications

- Files contain sensitive evidence. Keep Cloudinary private, URLs short-lived, logs body-free, and provider privacy settings reviewed.
- `MALWARE_SCAN_REQUIRED=false` is acceptable only for controlled development/staging risk acceptance. It is not a positive scan result.
- Gmail SMTP acceptance proves provider acceptance only. It does not prove institution receipt, case acceptance, or resolution.
- `ASSISTED_PORTAL` and `MANUAL` always require the user to complete the official process. Recourse must not claim submission.
- MongoDB transactions require a replica set. Atlas Search requires Atlas.
- Never replay an external-action failure until idempotency/provider reference state is inspected.
- Existing local cases/provider audit rows are test data and should not be promoted to staging/production.

## Known limitations and production-scale next work

Launch blockers:

1. Implement email verification delivery/enforcement.
2. Add explicit consent capture/versioning before processing sensitive documents.
3. Implement structured case packet export with provenance labels and original evidence controls.
4. Decide and implement malware-scanning strategy before unrestricted file intake.

Before scale:

- complete Atlas vector/lexical live verification and a retrieval relevance corpus;
- deploy Sentry/metrics/alerts with PII scrubbing and add distributed tracing;
- add load, soak, worker-crash, Redis/Mongo failover, backup/restore, and disaster-recovery evidence;
- complete formal WCAG and independent application/security review;
- add broad procedure/evidence/response golden eval sets with measured accuracy;
- automate procedure change impact and retention lifecycle sweeps;
- build a protected operator UI/runbook for failure replay and case-safe support;
- introduce institution integrations only where official support and compliance review exist.

## User actions still required

Before staging:

- provision all dashboards and secrets following `SETUP.md`;
- point MongoDB to Atlas and run both index commands;
- configure Sentry and operational alerts;
- enable/test Gmail inbound only with a controlled staging mailbox;
- provide an isolated browser E2E account and complete the authenticated/manual flow;
- accept or close the four launch-blocker features above for the staging audience.

Before production:

- close all four launch blockers;
- enable scanner and production privacy/ZDR controls;
- complete security/accessibility/load/DR reviews;
- verify backups/restores, DNS/TLS/cookies/CORS/private networking, secret rotation, and deletion/retention;
- verify each supported institution channel and leave all others assisted/manual/unsupported;
- obtain product/legal/privacy approval for the jurisdictions and data handled.
