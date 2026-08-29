# Recourse

![Recourse banner](apps/web/public/brand/recourse-banner.png)

> **Case intelligence for difficult decisions.**
>
> When an institution says no, Recourse helps a person understand what happened, verify the current process, organize the facts, prepare a grounded response, and continue the same case after a reply.

[![Live product](https://img.shields.io/badge/Live_product-recourse.oluwadunsin.dev-2d5da1?style=flat-square)](https://recourse.oluwadunsin.dev) [![Demo video](https://img.shields.io/badge/Demo-YouTube-e94242?style=flat-square)](https://youtu.be/cMCsYwh8BHU) [![Source](https://img.shields.io/badge/Source-GitHub-2d2d2d?style=flat-square)](https://github.com/daniel-oluwadunsin/recourse)

**Live product:** [recourse.oluwadunsin.dev](https://recourse.oluwadunsin.dev)

**Demo video:** [Watch the walkthrough on YouTube](https://youtu.be/cMCsYwh8BHU)

**Source code:** [github.com/daniel-oluwadunsin/recourse](https://github.com/daniel-oluwadunsin/recourse)

![Recourse logo](apps/web/public/brand/recourse-logo.png)

## Why Recourse exists

People receive consequential decisions every day:

- an account is suspended;
- a payment is held;
- an application is refused;
- a claim is denied;
- a scholarship is terminated;
- access is revoked;
- a benefit is stopped;
- a request is rejected;
- an employer, school, platform, agency, insurer, bank, marketplace, or other institution changes its position.

The institution usually has the policy, the decision system, the terminology, and the process knowledge. The person usually has a notice, scattered documents, limited time, and a vague instruction to “contact support” or “appeal.” That is a procedural asymmetry, not merely a writing problem.

Recourse is designed to close that gap. It turns an adverse decision into a durable, inspectable case: what the notice says, what the user can establish, what the current official process requires, what remains unknown, what was actually submitted, and what changed when the institution responded.

The product is deliberately **domain-agnostic**. A user brings a case; they do not choose from a prebuilt list of industries. Recourse extracts generic case facts and researches the actual institution and process at runtime. The same reasoning loop can support a student, seller, creator, employee, tenant, customer, applicant, policyholder, taxpayer, merchant, or small business without platform-specific adapters or hardcoded decision trees.

## The submission in one sentence

Recourse is a multimodal, evidence-first AI case-intelligence agent that researches the live procedure behind a consequential decision, identifies the facts and gaps that matter, produces truthful user-controlled communications, and preserves continuity when the institution replies.

## What makes Recourse an agent

Recourse is not a single chat box that generates a persuasive paragraph. It is a staged case loop with durable state, bounded tool use, explicit checkpoints, and a clear authority boundary:

```text
bring the decision
      ↓
understand the case
      ↓
ask for one critical missing fact when necessary
      ↓
research the current applicable process
      ↓
analyze evidence, contradictions, and gaps
      ↓
prepare the next user-controlled move
      ↓
record what the user actually submitted
      ↓
wait for the user to bring the response
      ↓
compare the response with the original case and continue
```

The agent’s next step is determined by the case state and by what is still unknown—not by a generic “be helpful” prompt. It can pause safely, save partial progress, ask a focused question, resume after clarification, and re-plan after a response. Every generated artifact is a derived aid; it is never silently promoted to evidence.

## The end-to-end experience

### 1. Bring any consequential decision

The user starts with the smallest possible intake: paste the notice or describe what happened. They can add a PDF, DOCX, TXT, PNG, JPEG, or WebP screenshot. There is no forced choice between insurance, education, marketplace, employment, finance, government, or another category.

### 2. Understand what happened before trying to persuade anyone

Gemini extracts a plain-language case model, including the institution, decision, stated reason, dates, reference numbers, jurisdiction when relevant, amount affected when visible, the user’s apparent objective, high-stakes signals, and critical unknowns.

The user sees an understandable summary such as:

> “Your account was restricted after the institution said it could not verify the information in your submission.”

The user can correct the interpretation. If an essential fact is missing, Recourse does not guess. It saves the case as **Needs information** and asks one focused question before doing research that would be built on a false premise.

### 3. Research the current process, not a remembered process

Recourse generates one focused query from the actual institution, decision, relationship/context, stated reason, and jurisdiction when relevant. Tavily Search finds a small set of candidate sources. Recourse prioritizes official institution guidance, regulators, government sources, ombudsman/dispute bodies, and strong secondary guidance; it extracts only the best one to three pages and retains source provenance.

The output is translated into human language:

- whether a formal review, appeal, complaint, or reconsideration route could be verified;
- the official entry point when available;
- deadline information when actually supported;
- required or useful documents;
- important process steps;
- uncertainty when sources conflict or the route could not be verified.

Successful procedure research is cached for seven days. The MVP uses basic Search and Extract rather than expensive crawl or research workflows, protecting the free-tier budget while keeping the result grounded in current sources.

### 4. Analyze evidence as a case, not as a pile of files

Evidence may be a notice, screenshot, PDF, DOCX, invoice, confirmation, message, receipt, or other relevant material. Recourse preserves the original file, extracts usable text locally where practical, and uses Gemini’s multimodal understanding for images and scanned documents.

The agent looks for:

- facts that directly address the stated reason;
- dates, entities, amounts, and reference numbers;
- evidence that supports or weakens a claim;
- missing documents or information;
- contradictions that materially change the story;
- a bounded chronology;
- questions the case still cannot answer.

If a date mismatch matters, Recourse surfaces it as a clarification request rather than accusing the user or silently choosing the more convenient date. If an invoice supports a supplier relationship but does not prove authorization, the product says exactly that. If a requested document is unavailable, the user can say so and ask about truthful alternatives.

### 5. Make readiness legible

The primary status is plain language, not fake mathematical precision:

- **Needs information** — an essential fact is unknown;
- **Building your case** — understanding, research, or evidence analysis is in progress;
- **Needs evidence** — an important gap remains;
- **Ready** — no unresolved critical gap is known from the current record;
- **Waiting for a response** — the user has acted externally and has told Recourse what actually happened;
- **Reviewing the response** — the user has returned with new material.

The product answers four questions on every meaningful state:

1. What is happening?
2. What did Recourse find?
3. What does Recourse need from the user?
4. What can the user do now?

### 6. Let the user choose the communication format

Once the case is ready, the user chooses the form of help that fits the situation:

- **Draft email** — subject, body, grounded factual framing, suggested attachments, and unresolved facts;
- **Generate formal letter** — a professional letter that can be previewed, copied, and downloaded as a PDF;
- **Ask Recourse** — case-aware help for questions such as “What should I write in the portal field asking why this decision should be reconsidered?” or “Which document should I attach?”

The chat receives the bounded case context: decision, user clarifications, evidence facts, contradictions, timeline, procedure research, prior submitted material, and responses. If the case does not contain the answer, Recourse says so and asks the user for the missing fact. It does not turn an unverified assumption into a confident sentence.

### 7. Preserve the truth of the actual external action

Recourse has a strict boundary: it prepares and assists; the user performs the external action.

It does not send email, submit a portal, click a third-party form, call an institution, monitor an external system, or claim that something happened outside the product. After the user acts, they choose **I’ve submitted** and record the method, date, optional reference, and whether they used the draft unchanged, changed it, or submitted something else.

If they changed the draft, Recourse captures the version that was actually submitted. This is a crucial continuity feature: when a response arrives later, the agent reasons from what the institution actually received—not from an idealized draft that never left the workspace.

### 8. Continue when a response arrives

The case does not end at the first letter. The user can return and choose **I received a response**, then paste or upload the response. Recourse compares it with the original decision, the actual submission, the evidence, the current procedure, and the case history.

It identifies:

- the new outcome;
- the reason now being given;
- what was addressed;
- what was ignored or left unresolved;
- newly requested evidence;
- changed institutional reasoning;
- whether another user-controlled route appears likely;
- the next grounded recommendation.

The same case loop can repeat, with a chronological record instead of a disconnected series of one-off AI answers.

## Competitive advantage

### 1. It targets the real bottleneck: procedural asymmetry

Most tools begin with “write an appeal.” Recourse begins earlier: what happened, what process applies, what can be established, what is missing, and what will the institution actually see. That ordering makes the final communication more useful because persuasion is constrained by the record rather than replacing it.

### 2. It generalizes by abstraction instead of by adapters

The product is not a collection of shallow workflows for a few recognizable platforms. Its common abstraction is a consequential decision plus evidence plus a live procedure plus a user-controlled next step. New domains are handled by generic extraction and live research rather than code changes such as `switch (domain)`.

### 3. It treats evidence, external procedure, and user choice as different kinds of truth

Recourse keeps three sources separate:

- **Case truth:** what the user’s documents establish;
- **Procedural truth:** what retrieved, current sources establish;
- **User choice:** what the user decides to submit or do.

This separation reduces a common failure mode in AI assistance: laundering a suggestion into a fact, or confusing a generated draft with a completed external action.

### 4. It is designed for continuity, not one-shot output

The immutable-submission checkpoint is a product-level trust primitive. A later response is interpreted against the actual submitted content, not just against the first draft. That makes Recourse useful across a real multi-step dispute, where the institution changes its explanation, asks for new evidence, or responds only partially.

### 5. It makes uncertainty actionable

“I don’t know” is not the end of the experience. Recourse turns uncertainty into the smallest useful next question, a missing-evidence request, a visible unverified-process state, or an explicit unresolved fact in a draft. The agent can keep helping without manufacturing certainty.

### 6. It is agentic without being opaque or overbuilt

The system uses a small number of inspectable operations—understand case, extract evidence, extract procedure, analyze case, answer case question, draft email, draft formal letter, analyze response—backed by structured output and schema validation. It does not hide simple product logic behind a swarm, queue system, vector database, or proprietary orchestration layer.

### 7. It respects user agency as a feature, not a disclaimer

In a consequential situation, “automation” can create a new risk: the system may send a message the user did not approve, submit the wrong version, or imply a deadline or route that was never verified. Recourse stops at the boundary where the user must decide and act. The product gives the person better context and better materials, then leaves the irreversible move with them.

## Why this matters

A denial, suspension, rejection, or restriction is rarely a single sentence. It is an interaction between a decision, a policy, a process, a set of documents, a deadline, and an institution that may respond in stages. The cost of misunderstanding is practical: a missed route, a weak response, an omitted attachment, a contradictory explanation, or a false claim that creates a new problem.

Recourse gives people a calm operating layer for that complexity. It does not promise to win a case. It helps the user build a truer picture of the case, identify what can still be done, and move forward with a response they can stand behind.

## Technical strategy

```text
Next.js web app
       │
       │ REST / JSON
       ▼
NestJS API ─────── MongoDB
   │  │  │
   │  │  └──── Cloudinary: server-controlled evidence storage
   │  └─────── Tavily: focused live Search + Extract
   └────────── Gemini: multimodal structured case reasoning
```

### AI and tool-use loop

1. **Bound the context.** The API assembles only the decision, relevant extracted facts, selected evidence snippets, research output, submission history, and response material needed for the operation.
2. **Call one capable Flash model.** Gemini handles text, images, scanned documents, structured case extraction, analysis, drafting, chat, and response comparison.
3. **Require structured output.** Machine-consumed responses are requested as JSON and validated with Zod before being persisted or shown as a state transition.
4. **Keep documents and retrieved pages untrusted.** Prompts explicitly treat document/web text as data, not instructions, and require unknowns instead of invented facts.
5. **Use bounded live research.** One focused Tavily Search, a small result set, and extraction of the strongest one to three sources; successful procedure results are cached.
6. **Persist before and after provider work.** The case is saved as it moves through processing, missing information, evidence review, readiness, submission, waiting, and continuation. Provider failure maps to a retryable saved state.
7. **Use user checkpoints for consequential actions.** The user confirms the actual submission and supplies the response; Recourse never claims the outside world changed because an internal button was clicked.

### Security and privacy posture

- Argon2id password hashing.
- Short-lived access JWTs held in browser memory.
- Rotating refresh tokens in an HttpOnly cookie; only token hashes are stored.
- Owner-scoped case, document, chat, download, and deletion operations.
- Backend-controlled Cloudinary uploads with the API secret kept server-side.
- MIME and size validation, SHA-256 duplicate detection, and private document downloads.
- No intentional logging of raw evidence text or model reasoning.
- Prompt-injection defensive instructions for uploaded and retrieved content.
- Plain, retryable provider errors instead of raw status-code experiences.

Gemini’s unpaid developer tier is not represented as an enterprise zero-retention service. The product discloses the provider data-use tradeoff before the first AI operation, and public demos should use synthetic/non-sensitive material.

## Repository layout

```text
recourse/
├── apps/
│   ├── api/                 # NestJS REST API, auth, cases, AI, research, uploads, PDFs
│   └── web/                 # Next.js App Router product and landing experience
├── packages/
│   └── shared/              # Shared Zod contracts, statuses, and plain-language labels
├── apps/web/public/brand/   # Orion-ready Recourse logo and banner assets
├── tests/e2e/               # Playwright lifecycle, responsive, accessibility, visual checks
├── scripts/                 # Deterministic E2E server
├── docs/                    # Product, technical, design, acceptance, and submission notes
└── .env.example             # Blank environment contract; never commit the local .env
```

The runtime is intentionally small: Next.js, NestJS, MongoDB, Gemini, Tavily, and Cloudinary. It does not use queues, workers, vectors, embeddings, Redis, an agent framework, domain adapters, blockchain components, or third-party browser automation.

## Run locally

### Requirements

- Node.js 24
- pnpm 11.12.0
- MongoDB Atlas or a compatible MongoDB instance
- Gemini Developer API key
- Tavily API key
- Cloudinary account

```bash
corepack enable
corepack prepare pnpm@11.12.0 --activate
pnpm install
cp .env.example .env
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The API runs at [http://localhost:4000/api/v1](http://localhost:4000/api/v1) by default.

Production build and start:

```bash
pnpm build
pnpm start
```

## Environment

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production` |
| `PORT` | Nest API port; normally `4000` |
| `WEB_URL` | Exact browser origin allowed by CORS |
| `NEXT_PUBLIC_API_URL` | Browser-visible `/api/v1` base URL |
| `MONGODB_URI` | Durable MongoDB connection string |
| `MONGODB_DB_NAME` | Durable database name |
| `JWT_ACCESS_SECRET` | Random secret of at least 32 characters |
| `JWT_REFRESH_SECRET` | Different random secret of at least 32 characters |
| `JWT_ACCESS_TTL` | Access JWT lifetime; normally `15m` |
| `JWT_REFRESH_TTL` | Refresh JWT lifetime; normally `30d` |
| `GEMINI_API_KEY` | Primary Gemini Developer API key |
| `GEMINI_API_KEY_2...N` | Optional ordered fallback keys for rate-limit resilience |
| `GEMINI_MODEL` | Structured multimodal Flash model configured for the project |
| `TAVILY_API_KEY` | Tavily Search and Extract key |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Server-side Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Server-only Cloudinary secret; never expose it in the browser |
| `MAX_UPLOAD_MB` | Evidence upload cap; normally `15` |
| `LIVE_PROVIDER_TESTS` | Opt-in live provider smoke tests; default `false` |

See [.env.example](.env.example) and [docs/03_ENVIRONMENT_AND_PROVIDER_NOTES.md](docs/03_ENVIRONMENT_AND_PROVIDER_NOTES.md) for provider setup. The local `.env` is ignored and its values must never be committed or printed.

## Provider notes

### Gemini

Recourse uses the current Google Gen AI JavaScript SDK, multimodal input, structured JSON output, and Zod validation. Set `GEMINI_MODEL` to a current Flash model available to the configured project; the repository default is the model documented in the current environment contract. Gemini free-tier content may be used to improve Google products and may be human-reviewed, so the product shows a concise consent disclosure before the first AI operation.

### Tavily

The MVP uses basic Search and basic Extract only. It starts with one focused search, caps the result set, extracts the strongest sources, and caches successful procedure research for seven days. It does not use Tavily Research or Crawl in the core case flow.

### Cloudinary

Evidence is uploaded server-side. Images use an image resource type; PDFs, DOCX, and text use raw resources. The API stores controlled asset identifiers in MongoDB, validates the upload, enforces case ownership on download, and removes stored assets when a case or document is permanently deleted.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
LIVE_PROVIDER_TESTS=true pnpm test:providers
```

The deterministic E2E server uses MongoDB in memory and contract fakes for paid/external providers. The suite covers signup/login, case creation, arbitrary case understanding, missing information, evidence upload, research, readiness, case chat, email drafting, formal letter generation, submission confirmation, response continuation, private downloads, auth refresh, ownership isolation, mobile layouts, accessibility, and visual states. Live provider smoke tests are opt-in so they do not burn quota during ordinary development.

## Product boundaries

Recourse is organizational and drafting support, not a replacement for qualified professional representation. It does not provide legal, financial, immigration, medical, or other professional advice. It can continue helping with evidence organization and official procedural research while suggesting qualified help when a case appears high-stakes.

It also does not:

- send email for the user;
- submit a portal or form;
- click third-party portals;
- call an institution;
- monitor an external system;
- claim that an external action succeeded;
- invent facts, evidence, deadlines, policies, or rights;
- use blockchain, custody, or DeFi execution.

Those boundaries are part of the product’s trust model and are deliberately enforced in the workflow, not left as marketing language.

## Orion submission materials

The copy-paste field values, judge-facing long description, technical strategy, social-link checklist, demo walkthrough, and submission preflight are in [docs/orion-submission.md](docs/orion-submission.md).

The generated submission assets are:

- [Recourse logo](apps/web/public/brand/recourse-logo.png)
- [Recourse banner](apps/web/public/brand/recourse-banner.png)

## Design direction

The interface follows [docs/design.md](docs/design.md): warm paper, pencil-black text, correction-marker red, ballpoint blue, wobbly borders, hard offset shadows, handwritten typography, and an editorial collage language. The visual metaphor is intentional: a difficult decision may arrive as a mess of paper and uncertainty, but a case can be organized into a legible next move.
