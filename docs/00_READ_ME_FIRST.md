# Recourse — Engineering Handoff Bundle

**Status:** Production-first build specification  
**Prepared:** 2026-08-16  
**Primary implementation target:** Codex working inside a new repository with no prior context

## What Recourse is

Recourse is an autonomous case agent for consequential decisions made against people and businesses.

A user provides an adverse decision such as a seller suspension, gig-worker deactivation, creator demonetization, payment hold, account restriction, or similar platform enforcement action. Recourse turns that decision into a persistent, evidence-grounded case. It discovers the current challenge procedure from authoritative live sources, extracts and verifies procedural rules, analyzes the user's evidence, identifies missing evidence and contradictions, builds a factual chronology, prepares a grounded challenge, tracks responses and deadlines, and replans when the institution responds.

Recourse is **not** an AI lawyer, a generic chatbot, or an appeal-letter generator. It is an agentic case-management and contestability system.

## Files in this bundle

1. `01_PRODUCT_REQUIREMENTS_DOCUMENT.md`
   - Complete product context for an LLM or engineer who has never heard of Recourse.
   - Product goals, users, scope, workflows, safety principles, features, UX, requirements, edge cases, metrics, and roadmap.

2. `02_TECHNICAL_SPECIFICATION.md`
   - Production architecture and detailed technical design.
   - Next.js, NestJS, MongoDB, Groq, Tavily, Redis/BullMQ, object storage, AI orchestration, source provenance, case graph, APIs, data models, queues, security, observability, scalability, testing, and deployment.

3. `03_AGENTS.md`
   - Ready-to-copy repository-root `AGENTS.md` for Codex.
   - Treat this as the project's engineering constitution.

4. `04_CODEX_BUILD_SEQUENCE_AND_PROMPTS.md`
   - Exact order to use Codex.
   - One bootstrap prompt followed by focused follow-up prompts, each intentionally scoped so Codex does not attempt the whole platform in one shot.

5. `05_ENVIRONMENT_SETUP_AND_OPERATIONS.md`
   - Local development, environment variables, external service setup, queues, MongoDB indexes, storage, deployment, CI/CD, live-integration verification, and operational runbooks.

6. `06_MCP_SKILLS_AND_CODEX_TOOLING.md`
   - Codex MCP/skill recommendations and installation guidance.
   - Includes what is required, what is optional, and what should **not** be added merely because it exists.

7. `07_TEST_AND_ACCEPTANCE_PLAN.md`
   - Production-quality test plan, golden cases, safety assertions, live integration suite, E2E tests, launch gates, and acceptance criteria.

## Non-negotiable engineering principles

### 1. No fake product behavior

The running product must not pretend to support external actions that do not actually exist.

- No fictional platform APIs in production.
- No fake “appeal submitted” state.
- No fake policy pages.
- No simulated institution responses presented as real.
- No hardcoded procedural answers masquerading as live retrieval.
- No hardcoded AI conclusions for the hackathon/demo path.

If a real platform exposes no supported API for an appeal submission, Recourse must truthfully represent that capability as an assisted/manual handoff and guide the user to the official authenticated flow.

**Automated-test fixtures and test doubles are allowed only inside isolated test code.** They must never be used to power production runtime behavior or a live submission flow. Critical provider integrations must also have separate live contract tests against real sandbox/production-safe endpoints.

### 2. The LLM is not the system of record

MongoDB stores the case. The model interprets and reasons over selected context.

The model must not be responsible for remembering:

- current case status,
- authoritative procedures,
- deadlines,
- evidence provenance,
- user permissions,
- job state,
- external action state,
- audit history.

### 3. Evidence and procedural claims require provenance

A material factual statement must be distinguishable as:

- verified from a user document,
- verified from an authoritative external source,
- asserted by the user,
- inferred by the model,
- contradicted,
- unknown.

A procedural claim must point to the source snapshot and exact supporting passage(s). If Recourse cannot verify a procedural assertion, it must not present it as fact.

### 4. External content is untrusted data

Web pages, PDFs, screenshots, emails, and user documents may contain prompt injection or malicious instructions. They are evidence, not instructions to the model.

### 5. The workflow is code-controlled

Use a deterministic application-level case state machine and orchestrator. Do not build an unconstrained swarm of agents that decide their own lifecycle.

AI is used for bounded operations such as classification, extraction, comparison, verification, evidence reasoning, strategy generation, response analysis, and drafting.

### 6. Sensitive outward actions require explicit authorization

Reading public sources and analyzing uploaded evidence can be automatic. Sending emails, submitting appeals, filing complaints, or taking actions with external consequences must pass through an action policy layer and require confirmation where appropriate.

### 7. Production-first, not hackathon-first

The codebase should be structured as a live product from day one:

- durable storage,
- idempotency,
- retries,
- dead-letter handling,
- role/ownership authorization,
- auditability,
- observability,
- provider abstractions,
- rate limits,
- cost controls,
- secure file storage,
- environment separation,
- migrations/index management,
- real tests,
- clean interfaces.

## Preferred stack

- **Frontend:** Next.js + TypeScript, App Router, Tailwind CSS, shadcn/ui, TanStack Query, Zustand, React Flow
- **Backend:** NestJS + TypeScript, REST API, Swagger/OpenAPI
- **Database:** MongoDB Atlas + Mongoose
- **Semantic retrieval:** MongoDB Atlas Vector Search; embedding provider behind an interface
- **AI:** Groq
  - `openai/gpt-oss-20b` for lower-cost structured extraction/classification
  - `openai/gpt-oss-120b` for high-value case reasoning and verification
  - current Groq-supported multimodal model selected from official Groq model documentation at implementation time for screenshot/image understanding
- **Web retrieval:** Tavily Search + Extract + Map/Crawl where required
- **Queue/workers:** Redis + BullMQ using a separate worker process
- **Files:** S3-compatible object storage, recommended Cloudflare R2 or AWS S3
- **Realtime:** Server-Sent Events for case activity
- **Browser/E2E:** Playwright Test
- **Observability:** structured logs + Sentry/OpenTelemetry-compatible instrumentation
- **Deployment:** Vercel for web; containerized API and worker; managed MongoDB/Redis/object storage

Do not pin major framework versions in documentation. During implementation, Codex must verify and install current compatible stable releases from official package/framework documentation, commit the resulting lockfile, and document the exact versions actually used.

## How to use the bundle with Codex

1. Create an empty Git repository.
2. Copy all `.md` files from this bundle into a `docs/` directory **except** `03_AGENTS.md`.
3. Copy `03_AGENTS.md` to repository root and rename it to `AGENTS.md`.
4. Install only the MCP/skills in `06_MCP_SKILLS_AND_CODEX_TOOLING.md` that are marked required/recommended.
5. Start a fresh Codex session at the repository root.
6. Send **Prompt 0** from `04_CODEX_BUILD_SEQUENCE_AND_PROMPTS.md`.
7. Review Codex's architecture readback and blocking questions.
8. Continue with Prompts 1, 2, 3... in order. Do not paste all prompts at once.
9. At the end of every phase, require Codex to run the relevant checks and summarize what changed before continuing.
10. The final prompt forces Codex to produce an environment/setup report and explain how to exercise the complete live flow.

## Important implementation note about Groq Structured Outputs

As of 2026-08-16, Groq's strict JSON-schema Structured Outputs are supported by `openai/gpt-oss-20b` and `openai/gpt-oss-120b`. Groq currently states that **streaming and tool use are not supported in the same request as Structured Outputs**. Therefore Recourse must separate tool execution and strict structured extraction into distinct orchestration phases.

Typical pattern:

1. application/model determines the information needed;
2. backend executes Tavily or another tool;
3. backend normalizes tool results;
4. a separate strict Structured Output request extracts a typed result;
5. backend validates and persists it.

## Important privacy note

Recourse will handle highly sensitive material. Groq's current data documentation states that ordinary inference inputs/outputs are not retained by default except under specified reliability/abuse-monitoring conditions, and Zero Data Retention controls are available. Production setup must review the current provider data terms, enable the strongest appropriate retention controls, and avoid unnecessary transmission of raw PII.

## Current official documentation references used for this handoff

OpenAI Codex:
- https://developers.openai.com/codex/agent-configuration/agents-md
- https://developers.openai.com/codex/build-skills
- https://developers.openai.com/codex/mcp
- https://developers.openai.com/codex/learn/best-practices
- https://developers.openai.com/codex/security
- https://developers.openai.com/codex/third-party/github

Groq:
- https://console.groq.com/docs/model/openai/gpt-oss-20b
- https://console.groq.com/docs/model/openai/gpt-oss-120b
- https://console.groq.com/docs/structured-outputs
- https://console.groq.com/docs/tool-use/local-tool-calling
- https://console.groq.com/docs/vision
- https://console.groq.com/docs/your-data

Tavily:
- https://docs.tavily.com/welcome
- https://docs.tavily.com/documentation/api-reference/introduction
- https://docs.tavily.com/documentation/api-reference/endpoint/crawl
- https://docs.tavily.com/documentation/best-practices/best-practices-extract
- https://docs.tavily.com/documentation/best-practices/best-practices-crawl
- https://docs.tavily.com/documentation/agent-skills

MongoDB/Nest/BullMQ/Playwright:
- https://www.mongodb.com/docs/atlas/atlas-vector-search/
- https://docs.nestjs.com/techniques/mongodb
- https://docs.nestjs.com/techniques/queues
- https://docs.bullmq.io/guide/going-to-production
- https://playwright.dev/docs/intro
- https://playwright.dev/docs/getting-started-mcp

---

**Codex should read the PRD and technical specification in full before changing code.**
