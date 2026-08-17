# Recourse — Codex Build Sequence and Prompts

**Purpose:** Build Recourse incrementally with Codex, not in one giant request.  
**Rule:** Send Prompt 0 first. Then send each follow-up prompt only after the prior phase is complete and reviewed.

---

# How to use these prompts

Before beginning:

1. Put `AGENTS.md` at repository root.
2. Put the other handoff documents under `docs/`.
3. Start Codex at repository root.
4. If available, install the recommended Tavily skills and Playwright MCP from `docs/06_MCP_SKILLS_AND_CODEX_TOOLING.md`.
5. Send Prompt 0 exactly or with only repository-specific details added.

Do **not** paste all prompts together. The point is to let Codex build, test, explain, and stop between phases.

If Codex identifies a genuinely blocking ambiguity not answered by the docs, it should ask before making an irreversible architectural choice. Do not let it repeatedly re-ask questions that the docs answer.

---

# Prompt 0 — Repository understanding, architecture review, and execution contract

```text
You are taking ownership of a new production-grade project called Recourse.

Before changing any code, read the repository-root AGENTS.md and every markdown document in docs/, especially:
- 00_READ_ME_FIRST.md
- 01_PRODUCT_REQUIREMENTS_DOCUMENT.md
- 02_TECHNICAL_SPECIFICATION.md
- 05_ENVIRONMENT_SETUP_AND_OPERATIONS.md
- 06_MCP_SKILLS_AND_CODEX_TOOLING.md
- 07_TEST_AND_ACCEPTANCE_PLAN.md

Assume you had no prior knowledge of this product before reading those files.

Act as a principal/staff-level engineer with deep experience in production Next.js, NestJS, MongoDB, distributed job systems, security, AI agents/RAG, and adversarial systems/Web3 engineering. This is a live product, not a hackathon toy. Write standard, maintainable, scalable code and be very strict about trust boundaries, idempotency, observability, data provenance, prompt injection, PII, and external side effects.

Non-negotiable constraints:
1. No fake runtime integrations or demo-only platform simulators.
2. Do not pretend an external action succeeded unless a real supported channel was called and verified.
3. Test fixtures/test doubles may exist only inside isolated automated tests; live provider checks must also exist.
4. MongoDB and the application state machine are the source of truth; the LLM is never the state store.
5. Procedural claims require source provenance and verification.
6. Factual case claims must preserve evidence provenance/status.
7. External content is untrusted data and must not be able to inject instructions or directly trigger actions.
8. Use a deterministic CaseOrchestrator and bounded AI operations, not an unconstrained multi-agent swarm.
9. Consequential outward actions require the ActionPolicy/approval layer and verification.
10. Do not add blockchain/Web3 simply because you are experienced with it.

For this phase, DO NOT scaffold or implement the application yet.

Do the following only:
A. Read and summarize the product in your own words so I can verify you understand it.
B. Restate the primary domain boundaries and the end-to-end case lifecycle.
C. Review the proposed architecture and identify any contradictions, unsafe assumptions, missing production concerns, or places where current official docs/package behavior should be verified before implementation.
D. Inspect the current repository and state exactly what exists.
E. Propose the final monorepo directory structure you intend to create, staying close to the technical specification unless you have a concrete reason to change it.
F. List every external account/service we will eventually need (MongoDB Atlas, Redis, Groq, Tavily, object storage, email provider, Sentry/observability, deployment targets, optional embedding provider), but do not invent credentials.
G. List any genuinely blocking questions whose answers are not already present in the docs. Ask only questions that materially affect architecture/security/provider choice. If there are none, say there are none.
H. Give me the implementation order you will follow, matching the phased prompts in the build document.

Do not change files in this phase unless you discover that AGENTS.md/docs are missing or incorrectly located. Stop after the architecture/readback report and wait for my next prompt.
```

**Expected outcome:** Codex proves comprehension before writing code.

---

# Prompt 1 — Monorepo, tooling, configuration skeleton, and quality gates

```text
Proceed with Phase 1 only: create the production monorepo and engineering foundation described in the technical specification.

Requirements:
- pnpm workspace + Turborepo.
- apps/web: Next.js App Router + TypeScript.
- apps/api: NestJS HTTP API.
- apps/worker: NestJS standalone worker application.
- packages/contracts, packages/config, packages/logger, packages/observability, shared lint/tsconfig packages where useful.
- TypeScript strict mode everywhere.
- current mutually compatible stable framework/package versions verified from official docs; commit the lockfile.
- root scripts for dev, build, lint, typecheck, test, format/check, and service-specific commands.
- typed environment loader/validation with safe defaults only where appropriate. No secret defaults.
- .env.example containing names/descriptions but never fake production secrets.
- structured logger foundation and request/correlation ID utilities.
- API global validation/error format and Swagger/OpenAPI bootstrap.
- health endpoint skeleton.
- Dockerfiles or build-ready container structure for api and worker, but do not build domain features yet.
- docker-compose.dev.yml for local Redis and any safe local infrastructure; do not replace MongoDB Atlas production architecture with an embedded database.
- CI skeleton that can install, lint, typecheck, test, and build.
- basic README developer commands if needed, but keep the handoff docs authoritative.

Do not implement auth/cases/retrieval/AI yet beyond module placeholders needed for clean compilation.

Use no unnecessary dependency. Explain each non-obvious dependency you add.

At the end:
1. run install/lint/typecheck/tests/build;
2. fix all failures caused by this phase;
3. show the final repository tree at an appropriate depth;
4. list exact package/runtime versions selected;
5. list files changed;
6. list env variables introduced;
7. explain architectural decisions and any deviations from the spec;
8. stop and wait for Phase 2.
```

---

# Prompt 2 — Authentication, authorization, security foundation, and persistence bootstrap

```text
Proceed with Phase 2 only: implement authentication/authorization and the core persistence/security foundation.

Read AGENTS.md and relevant docs first.

Implement:
- MongoDB Atlas/Mongoose integration using typed configuration.
- database connection health checks and graceful shutdown.
- User model/indexes.
- email/password sign-up and sign-in.
- Argon2id password hashing.
- short-lived JWT access tokens.
- rotating refresh-token family stored securely (hash tokens at rest where appropriate), HttpOnly/Secure/SameSite cookie handling, logout/revocation, and refresh-token reuse protection.
- authenticated user guard/decorator.
- centralized ownership authorization pattern to be reused by case modules.
- password reset/email verification data model and endpoints only if you can implement them correctly with the selected real email provider abstraction; otherwise build the secure token/domain layer now and leave delivery explicitly for the email phase without fake sends.
- security headers/CORS config/rate limiting appropriate to auth endpoints.
- AuditLog base model/service for security-relevant actions.
- typed config validation for auth/database/security settings.
- MongoDB index creation/verification tooling foundation.
- API integration tests for auth and authorization.

Security requirements:
- never expose refresh tokens to JS;
- never log passwords/tokens;
- normalize emails;
- generic credential failure messages;
- brute-force/rate protection;
- test cross-user access denial;
- no unscoped findById pattern for user-owned resources once those resources exist.

Do not implement case domain functionality yet beyond prerequisites.

At the end run lint/typecheck/unit/integration/build and report:
- schema/indexes created;
- security decisions;
- env additions;
- commands used;
- any setup I must perform in MongoDB Atlas;
- changed files;
- remaining risks.
Then stop.
```

---

# Prompt 3 — Core case domain, state machine, events, institutions, and domain contracts

```text
Proceed with Phase 3 only: implement the persistent case domain and deterministic workflow primitives.

Implement the domain models/contracts from the technical specification:
- Case
- Decision
- CaseEvent append-only event history
- Institution
- base Deadline model
- controlled enums/unions for CaseStatus, RelationshipType, DecisionType, ClaimEvidenceStatus, SubmissionCapability, ControlledActionType, etc.

Implement:
- CaseStateMachineService with an explicit allowed transition map.
- CaseEventService with per-case monotonic sequence behavior and idempotent event append where appropriate.
- Case CRUD/intake endpoints (without AI processing yet).
- ownership authorization on every case endpoint.
- cursor pagination/list filters.
- update/correction flow that preserves original extracted values vs user corrections rather than destroying history.
- soft/tombstone deletion orchestration foundation so later worker results cannot resurrect deleted cases.
- institution lookup/normalization service foundation, without pretending model-discovered domains are verified.
- case activity API.
- tests for transition validity, duplicate event handling, cross-user authorization, deletion/tombstone behavior.

Use MongoDB transactions where appropriate and supported, but do not create unnecessary transaction coupling.

Do not implement Groq, Tavily, evidence parsing, or queues yet except interfaces/types needed by the domain.

At the end run all checks, describe the state machine, show the domain models/indexes, list env changes (if any), and stop.
```

---

# Prompt 4 — Object storage and evidence ingestion pipeline

```text
Proceed with Phase 4 only: implement production-grade file/evidence storage and document ingestion foundations using **Cloudinary** for object/file storage.

Implement:

* StorageProvider interface with a real Cloudinary provider configured via environment variables.
* private/authenticated assets, opaque storage keys, and short-lived signed upload/download access.
* upload-intent and upload-completion endpoints.
* file size/MIME/extension validation with configurable limits.
* Evidence and EvidenceBlock models/indexes.
* SHA-256 integrity handling and duplicate detection.
* secure deletion lifecycle and processing-status state machine.
* native extraction for text PDFs, DOCX, EML/MIME, text, and supported images using maintained packages verified against current docs/security.
* sanitized HTML email text extraction, page/block provenance, unsupported/failed extraction states.
* multimodal fallback interfaces only; do not integrate Groq vision yet.
* Cloudinary health/live-check script.
* tests for malicious filenames, MIME mismatch, oversized files, duplicates, ownership, deletion during processing, and parser failures.

Avoid routing large file bytes through application memory where possible; prefer direct Cloudinary uploads.

Do not add a fictional runtime storage service. Test-only local mocks are allowed; staging/production must use Cloudinary and pass the live provider check.

At completion, run checks and tell me exactly how to configure Cloudinary and which environment variables are required. Stop.
```

---

# Prompt 5 — Redis/BullMQ workers, durable orchestration, retries, and SSE activity

```text
Proceed with Phase 5 only: implement durable async processing and real-time case activity.

Implement:
- Redis/BullMQ integration following current NestJS/BullMQ production guidance.
- separate apps/worker runtime; do not run heavy workers inside API process.
- queues: case-orchestration, procedure-retrieval, evidence-processing, ai-operations, notifications, external-actions, maintenance (combine only if you can justify a simpler equivalent).
- deterministic job IDs/idempotency keys.
- retry classification and exponential backoff for transient operations.
- Unrecoverable/non-retryable errors for invalid inputs.
- provider-friendly queue rate-limit/concurrency configuration.
- dead/failed job observability and admin-readable failure metadata.
- graceful worker shutdown.
- CaseOrchestratorService that reacts to persisted case events/states and schedules known workflow steps, but do not add AI/retrieval implementation yet.
- SSE endpoint for case activity sourced from persisted events, with auth/ownership, heartbeat/reconnection behavior, and safe payloads.
- worker/API health checks.
- integration tests with real local Redis.

Do not let the orchestrator ask an LLM what the workflow should be. It controls known stages and later invokes bounded AI operations.

At the end:
- run all checks;
- show queue/job conventions;
- show retry/idempotency rules;
- show how API and worker are started locally;
- list Redis env vars and production configuration considerations;
- stop.
```

---

# Prompt 6 — Groq AI provider, structured-output framework, safety boundaries, and initial AI operations

```text
Proceed with Phase 6 only: implement the Groq AI layer and bounded structured operations.

Before coding, verify the current official Groq documentation for:
- openai/gpt-oss-20b;
- openai/gpt-oss-120b;
- Structured Outputs strict mode;
- current supported multimodal/vision model(s);
- tool-use limitations;
- data-retention controls.

Implement:
- GenerativeAIProvider interface and GroqProvider.
- model router by operation.
- AI operation registry.
- versioned prompt system.
- Zod -> compatible JSON Schema strict-output utility.
- AIRun persistence without chain-of-thought.
- usage/latency/error metadata.
- provider retries/rate-limit behavior.
- untrusted-evidence prompt boundary helpers.
- optional safety/prompt-injection classifier using a currently supported safety model only if official docs confirm it and it improves the architecture.
- initial operations:
  1. classify-case;
  2. extract-document-claims;
  3. extract-timeline-events.
- multimodal extraction fallback for screenshots/scanned pages using the currently supported Groq multimodal model, while preserving native extraction as first choice.
- strict semantic fallback values such as unknown/null rather than invented data.
- integration of classification with CaseOrchestrator so a newly processed decision can move through classification correctly.
- live Groq provider check script.
- golden tests and safe live integration test gated by env flag.

Important: Groq Structured Outputs currently cannot be combined with tool use or streaming in the same request according to the checked docs. Preserve the two-phase architecture.

Do not implement Tavily/procedure retrieval yet.

At the end report:
- exact Groq models actually selected/current IDs;
- which operations use which model and why;
- prompt/schema versions;
- ZDR/data-setting steps I need to consider;
- env vars;
- live verification command/results if credentials are available;
- tests/build status;
- stop.
```

---

# Prompt 7 — Tavily live procedural retrieval, source snapshots, procedure versions, and verification

```text
Proceed with Phase 7 only: build the live Procedural Intelligence Engine using Tavily and Groq.

Before coding, read current official Tavily docs for Search, Extract, Map, Crawl, usage reporting, and best practices. Use the official JS SDK/current API shape.

Implement:
- WebRetrievalProvider interface and TavilyProvider.
- RetrievalRun model/usage tracking.
- SourceSnapshot model with canonical URL, domain, authority tier, retrieval timestamp, content hash, normalized paragraph IDs, source metadata, and optional raw-object key.
- URL normalization/dedupe.
- source authority classifier/ranker with deterministic official-domain/jurisdiction/relationship/decision relevance factors.
- Procedure, ProcedureVersion, ProceduralClaim models and indexes.
- procedure cache resolver and freshness policy.
- bounded procedure query builder from structured case classification.
- Tavily Search for discovery.
- Tavily Extract of the actual source pages before claims can be established.
- Tavily Map/Crawl only when a fragmented official site requires deeper navigation, with strict page/depth/cost budgets.
- strict Groq procedure extraction schema.
- claim-level verification operation that returns SUPPORTED/CONTRADICTED/AMBIGUOUS/NOT_FOUND.
- source conflicts and procedure conflict state.
- deterministic procedure confidence calculation with explainable factors.
- procedure versioning when source content/procedural claims materially change.
- attach procedure to a case only when scope matches.
- procedure/source APIs and UI-ready provenance payloads.
- CaseOrchestrator transition from classification -> procedure resolution -> next appropriate state.
- live Tavily provider checks.
- tests for: search snippet not treated as evidence, unofficial-only result, conflicting official sources, stale cache, page changed, jurisdiction mismatch, duplicate URL, retrieval failure, prompt injection inside retrieved page.

Never fall back to model memory as authoritative procedure if Tavily fails.

At the end explain the full retrieval flow, source ranking, confidence formula, caching/versioning behavior, Tavily env/setup, costs/rate controls, and test results. Stop.
```

---

# Prompt 8 — Vector/hybrid retrieval, evidence claims, case graph, contradictions, requirements, and readiness

```text
Proceed with Phase 8 only: implement the Evidence Intelligence Engine and persistent Case Graph.

Before coding, verify current MongoDB Atlas Vector Search guidance and choose the embedding implementation behind the specified EmbeddingProvider interface. If the project does not yet have an embedding provider decision and this materially affects paid-provider setup, ask me one concise blocking question; otherwise use the production-standard provider documented in the spec and keep it replaceable.

Implement:
- EmbeddingProvider abstraction.
- MongoDB Atlas Vector Search indexes/config/scripts for evidence blocks and procedure-source chunks.
- lexical/full-text indexing needed for exact identifiers/dates/names.
- strict mandatory caseId filtering for private evidence retrieval.
- Claim model/services and claim dedup/merge rules.
- entity representation only as needed for cases.
- GraphNode/GraphEdge persistent models and incremental graph builder.
- EvidenceRequirementMatch model and matcher.
- contradiction candidate detection (deterministic for structured values plus model reasoning for semantic conflicts).
- contradiction resolver.
- timeline persistence/normalization.
- case analysis operation.
- deterministic/versioned readiness engine with caps for critical missing requirements/unresolved contradictions/unverified procedures.
- case graph/timeline/claims/requirements API endpoints.
- case activity events when critical gaps/contradictions are discovered.
- tests for cross-case vector isolation, semantic/lexical retrieval, conflicting names resolved by evidence, unresolved contradictions, missing critical requirement, score repeatability, stale graph rebuild, duplicate claims.

Do not make the LLM generate a readiness percentage directly.

At the end provide exact Atlas index definitions/creation commands, embedding env requirements, readiness formula/version, test results, and stop.
```

---

# Prompt 9 — Grounded appeal generation, policy/action layer, and real capability modeling

```text
Proceed with Phase 9 only: implement grounded challenge generation and the Action Engine foundations.

Implement:
- Appeal model and version/sequence behavior.
- structured appeal argument schema before prose rendering.
- appeal composer using verified procedural claims + case claims/evidence only.
- grounding verifier that maps material factual sentences to claim/evidence IDs and procedural statements to verified procedural claim IDs.
- factualGroundingCoverage, proceduralGroundingCoverage, unsupportedAssertionCount.
- blocking rule for unsupported material assertions.
- attachment checklist based on evidence requirements.
- CaseAction model.
- SubmissionCapability: AUTO_API / EMAIL / ASSISTED_PORTAL / MANUAL / UNSUPPORTED.
- ActionPolicyEngine.
- approval endpoints/state transitions and audit records.
- ActionAdapter interface with prepare/execute/verify.
- AssistedPortal adapter that provides verified official destination/instructions but does not claim submission.
- generic real Email adapter interface; if a real email provider is already configured, integrate it correctly. Otherwise leave capability unavailable until the later provider setup rather than faking delivery.
- idempotency and verification rules for real actions.
- UI-ready payload explaining why an action is recommended and what evidence/source supports it.
- tests for fabricated-user request, unsupported claim, expired procedure version, action without approval, duplicate approval, duplicate execute request, failed verification.

Do not build browser automation that bypasses platform authentication or anti-bot controls.
Do not claim AUTO_API for an institution without a real supported API integration.

At the end explain how a real platform with no API is represented truthfully and show all action safety gates. Stop.
```

---

# Prompt 10 — Email/inbound responses, response analysis, replanning, deadlines, and notifications

```text
Proceed with Phase 10 only: complete the persistent case loop after an appeal/action.

Select/configure the real transactional email provider only after checking current official inbound/outbound capabilities. If provider choice is not already specified and selecting one would create a paid/irreversible dependency, ask me first. Do not invent an email account.

Implement:
- EmailProvider abstraction.
- signed/verified inbound webhook handling.
- opaque case reply/forward association tokens.
- safe outbound send with message IDs and audit logs.
- response evidence ingestion and case-association classifier.
- AnalyzeResponse operation: outcome, stated reason, addressed claims, unaddressed claims, new issues, requested evidence, mentioned deadlines.
- response-to-case events/status transitions.
- ReplanCase operation returning only the controlled next-action enum + evidence/procedure-based rationale.
- CaseOrchestrator path for REJECTED / MORE_INFO / APPROVED / UNKNOWN.
- Deadline calculation/service using verified source claim, trigger event, timezone/business-day metadata, conflict handling.
- delayed BullMQ reminder jobs or a robust scheduler pattern.
- notification model, in-app notifications, transactional email notifications.
- cases that reach RESOLVED, EXHAUSTED, or NEEDS_HUMAN.
- tests for webhook replay, forged signature, unrelated email, duplicate response, rejection introducing new issue, deadline source change, procedure update affecting deadline, reminder retry, approved response verification.

Never infer an external case is resolved simply because an email sounds positive if the response is ambiguous.

At the end explain the full observe -> analyze -> replan loop and how it remains durable across process restarts. Stop.
```

---

# Prompt 11 — Production frontend and complete user experience

```text
Proceed with Phase 11 only: build the complete production frontend against the real backend built so far.

No fake data and no hardcoded demo states. Loading/empty/error states must come from real API state.

Build/refine:
- Implement light and dark mode
- Logo to use for the app has been added in the public folder
- polished auth flows;
- dashboard;
- case list with filters/status/deadlines;
- new-case intake with text/upload/screenshot paths;
- upload progress and processing state;
- classification review/correction;
- persistent case workspace navigation;
- case Overview;
- Decision page;
- Evidence page with document viewer/extracted claims/provenance;
- Procedure page with verified claims, source links/passages, last verified/version/conflict states;
- React Flow case graph plus accessible textual/table fallback;
- Timeline page;
- Appeals/Actions page with grounding coverage, unsupported-claim gate, attachments, approval states, capability type, external receipt;
- Sources page;
- Activity feed driven by SSE/persisted case events;
- notifications;
- right-side Case Health panel;
- Ask Recourse case-grounded UI only if backend operation exists; do not create a generic hallucinating chat endpoint just to fill the UI.
- responsive/mobile behavior;
- accessibility states;
- all error/retry states.

Use TanStack Query for server state, Zustand only for ephemeral UI, React Hook Form/Zod for forms, IconSax for icons, Framer motion for animations.
Use tailwind CSS for the UI

Add Playwright tests for the complete real application flow up to the point where a real external provider boundary makes an unsafe side effect inappropriate in CI.

At the end:
- run lint/typecheck/tests/build/e2e;
- use Playwright MCP if installed to inspect the live app and fix visible/interaction issues;
- list routes/components/state architecture;
- explain how the UI communicates uncertainty rather than hiding it;
- stop.
```

---

# Prompt 12 — Privacy, hardening, abuse prevention, observability, and production operations

```text
Proceed with Phase 12 only: harden Recourse as a sensitive production application.

Perform a threat-model-driven implementation/review covering:
- auth/session attacks;
- IDOR/cross-user case access;
- SSRF from source retrieval;
- prompt injection in web pages/documents/emails;
- malicious file uploads;
- XSS from rendered external content;
- webhook forgery/replay;
- action replay/idempotency;
- exposed signed URLs;
- secret leakage;
- logs containing PII;
- provider key misuse;
- queue poisoning/duplicate jobs;
- deletion races;
- stale procedure risk;
- model hallucinated rights/procedures;
- email abuse/spam;
- denial-of-wallet via AI/Tavily usage.

Implement/finalize:
- security headers and CORS;
- endpoint/file/AI rate limits;
- SSRF protection for any direct fetching;
- HTML sanitization;
- file signature/MIME checks and malware-scan integration point;
- audit coverage;
- PII-safe structured logs;
- OpenTelemetry-compatible traces or selected observability stack;
- Sentry if configured;
- metrics for queues/providers/grounding/retrieval/cost;
- provider spend/cost controls;
- graceful shutdown and readiness/liveness health;
- account/case deletion end-to-end;
- privacy/data-retention configuration documentation;
- production error handling.

Then run a security-focused test suite and, if available, a Codex Security scan on the repository. Review findings; fix genuine high-impact issues created by our code. Do not blindly apply automated patches.

Report the threat model, findings, fixes, remaining risks, and new env/operational settings. Stop.
```

---

# Prompt 13 — Full test/evaluation suite, live providers, load behavior, and launch gates

```text
Proceed with Phase 13 only: finish the serious test/evaluation system described in docs/07_TEST_AND_ACCEPTANCE_PLAN.md.

Implement/complete:
- unit tests for all domain rules;
- Mongo integration tests;
- real local Redis/BullMQ tests;
- object-storage adapter tests plus safe live check;
- Groq golden structured-output evals;
- Tavily source/procedure evals;
- prompt-injection evals;
- cross-case isolation tests;
- appeal grounding tests;
- response/replanning tests;
- state-machine/idempotency tests;
- Playwright browser E2E;
- safe live-provider suite gated by explicit env flag;
- load tests for API reads, SSE, queue bursts, and representative document/retrieval processing without creating unsafe external actions;
- CI separation between deterministic tests and paid live-provider checks;
- coverage thresholds appropriate for critical domain/services;
- evaluation report generation.

Test fixtures must be clearly test-only and must not become runtime data or hardcoded production behavior.

Run the complete deterministic suite. If live credentials are available and LIVE_PROVIDER_TESTS=true, also run the safe live-provider suite.

At the end produce a launch-gate matrix showing pass/fail for every acceptance criterion. Stop.
```

---

# Prompt 14 — Deployment, CI/CD, staging, indexes, provider configuration, and production readiness

```text
Proceed with Phase 14 only: make the project deployable and operational.

Implement/finalize:
- production Dockerfiles for API/worker with non-root runtime and graceful shutdown;
- Vercel-compatible web deployment configuration (or chosen frontend platform);
- API/worker deployment manifests/config examples appropriate to our selected container host without hardcoding secrets;
- MongoDB Atlas index creation/verification command including Vector Search indexes;
- Redis production configuration guidance;
- object-storage lifecycle/CORS policies;
- environment separation: local/test/staging/prod;
- CI workflows for lint/typecheck/test/build/security;
- optional staging E2E workflow;
- safe deployment health/smoke scripts;
- rollback strategy;
- version/build metadata;
- database/index deployment ordering;
- queue deployment ordering to avoid workers processing incompatible jobs during rollout;
- observability alerts/runbook links;
- backup/recovery considerations.

No placeholder “deploy somewhere” instructions. Make the setup concrete while keeping secrets/account IDs user-supplied.

Do not deploy to production without my credentials/explicit environment access. Prepare everything and tell me what I need to configure.

At the end run local build/container checks possible in the environment and stop.
```

---

# Prompt 15 — Final implementation audit, environment inventory, full setup guide, and end-to-end live verification

```text
This is the final handoff phase. Do not add speculative features.

First, re-read AGENTS.md, PRD, technical spec, environment/operations guide, and acceptance plan. Audit the implemented repository against every must-have requirement and production rule.

Do the following:

1. Identify every PRD/spec item as IMPLEMENTED, PARTIAL, NOT IMPLEMENTED, or NOT APPLICABLE. Do not hide gaps.
2. Fix remaining in-scope implementation gaps that are safe and do not require an account/credential I have not provided.
3. Remove dead demo-only code, stale TODOs, unused dependencies, fake fixtures outside tests, and misleading feature flags.
4. Run lint, typecheck, all deterministic tests, builds, E2E, and security checks.
5. If real provider credentials are available and explicitly safe, run the live-provider verification suite. Never perform a consequential external submission just to prove connectivity.
6. Verify MongoDB indexes, queue connectivity behavior, object storage, Groq structured output, Tavily search+extract, SSE, and auth flows.
7. Generate/update an IMPLEMENTATION_REPORT.md that explains exactly what you built.
8. Generate/update a SETUP.md that a new engineer can follow from zero.
9. Generate/update .env.example with EVERY required/optional env var, grouped and documented. Never include secrets.
10. Tell me every external dashboard action I must perform, step by step: MongoDB Atlas, Redis, Groq, Tavily, object storage, embedding provider if used, email provider if used, Sentry, Vercel, API/worker host, DNS/webhook URLs, and provider privacy/ZDR settings.
11. Explain exact commands to run locally: install, start dependencies, configure indexes, run API, run worker, run web, run tests, run live provider checks.
12. Explain the full end-to-end manual test flow using REAL provider behavior and a real adverse-decision document, including what should appear in the UI at each stage. Where a real platform only supports ASSISTED_PORTAL/MANUAL submission, explicitly say that the user must complete the official flow; do not claim Recourse submitted it.
13. Explain how to ingest a real institution response and observe replanning.
14. Explain how failures/retries are inspected and recovered.
15. Explain known limitations and what would be next for production scale.
16. Show final repository structure.
17. List exact runtime/framework/provider model versions actually used.
18. Give me a concise final checklist of actions I personally still need to take before staging and before production.

Write this handoff like a very experienced principal engineer handing a sensitive live platform to another senior team. Be precise, exhaustive where operationally necessary, and honest about any unsupported functionality.

When complete, stop. Do not start a new feature.
```

---

# Optional follow-up prompt — Review a completed phase before continuing

Use this if a phase feels suspicious:

```text
Before we continue, perform a skeptical review of the phase you just completed. Assume another senior engineer wrote it and you are the reviewer.

Look specifically for:
- violations of AGENTS.md/PRD/spec;
- fake runtime behavior;
- insecure trust boundaries;
- idempotency bugs;
- state-machine inconsistencies;
- missing ownership checks;
- PII in logs;
- prompt-injection paths;
- ungrounded AI claims;
- missing indexes;
- queue duplicate/retry races;
- unverified external actions;
- tests that pass only because they over-mock behavior;
- unnecessary dependencies;
- hidden TODOs/placeholders.

Fix genuine issues, rerun relevant checks, report what changed, and stop.
```

---

# Why this order matters

The sequence deliberately builds from deterministic foundations outward:

```text
repo/tooling
   ↓
auth/security/data
   ↓
case state machine
   ↓
storage/evidence
   ↓
queues/orchestration
   ↓
AI provider
   ↓
live procedures
   ↓
evidence intelligence
   ↓
appeal/action safety
   ↓
responses/replanning
   ↓
frontend
   ↓
hardening
   ↓
tests/evals
   ↓
deployment
   ↓
final operational handoff
```

If Codex builds the UI or “agent” before durable state/provenance/orchestration exists, it is likely to produce a convincing prototype with weak production semantics. This sequence intentionally prevents that.
