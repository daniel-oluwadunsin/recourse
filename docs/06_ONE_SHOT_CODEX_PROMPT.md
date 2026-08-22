# One-shot Codex prompt

Use this as the single implementation prompt with **GPT-5.6 Sol / Ultra High reasoning**.

---

You are the principal engineer and product engineer responsible for rebuilding **Recourse** completely in this repository in one continuous implementation run.

I want the full product built, tested, visually audited, and handed back to me. Do not stop after scaffolding or after individual phases.

Work like an exceptionally experienced staff/principal engineer in Next.js, NestJS, MongoDB, AI agents, multimodal/document AI, secure production applications and premium product UX.

## 0. READ THE ENTIRE REPOSITORY FIRST

Before writing code:

1. inspect the repository tree;
2. read every project Markdown document fully;
3. specifically read:
   - `00_READ_ME_FIRST.md`
   - `01_PRODUCT_REQUIREMENTS_DOCUMENT.md`
   - `02_TECHNICAL_SPECIFICATION.md`
   - `AGENTS.md`
   - `03_ENVIRONMENT_AND_PROVIDER_NOTES.md`
   - `04_TEST_AND_ACCEPTANCE_PLAN.md`
   - `05_CODEX_TOOLING.md`
   - **`design.md`**
4. inspect the existing `.env` variable names without printing secret values;
5. understand that I deleted the prior project code and am rebuilding, so the `.env` may contain stale credentials/integrations;
6. internally summarize the product and architecture before making files.

`design.md` is the visual/interaction design authority.

If the repository is effectively empty apart from docs/design/env, initialize it cleanly.

## 1. VERIFY CURRENT OFFICIAL DOCS

Do not code material integrations from memory.

Read current official docs for:

- Next.js
- NestJS
- MongoDB Atlas
- Google Gemini Developer API
- current Gemini models
- Gemini structured outputs
- Gemini document/multimodal understanding
- Gemini free-tier limits/data policy
- Tavily Search
- Tavily Extract
- Tavily pricing/credits
- Cloudinary Node SDK
- Cloudinary raw/PDF/document uploads
- Cloudinary private/authenticated delivery as relevant

Start here:

Gemini:
https://ai.google.dev/gemini-api/docs
https://ai.google.dev/gemini-api/docs/models
https://ai.google.dev/gemini-api/docs/pricing

Tavily:
https://docs.tavily.com/llms.txt
https://docs.tavily.com/documentation/api-credits
https://docs.tavily.com/documentation/api-reference/endpoint/search

Cloudinary:
https://cloudinary.com/documentation/node_integration
https://cloudinary.com/documentation/node_image_and_video_upload
https://cloudinary.com/documentation/image_upload_api_reference

If the docs conflict with assumptions in our Markdown, use current official docs while preserving product intent.

## 2. PRODUCT YOU ARE BUILDING

Recourse is **not an appeal-letter generator for a few hardcoded domains**.

It is a general-purpose autonomous case-intelligence agent.

A user may bring essentially any consequential/adverse institutional case:

- platform decision;
- school/university;
- government;
- employment;
- finance;
- insurance;
- housing;
- immigration;
- marketplace;
- telecom;
- professional body;
- a domain we did not anticipate.

**Do not hardcode domains or create platform-specific adapters.**

The generic loop is:

```text
user brings case
→ understand decision
→ ask user if critical information is missing
→ research the current applicable process
→ analyze evidence
→ identify gaps/contradictions
→ case becomes ready
→ USER chooses help:
     draft email
     generate formal letter
     Ask Recourse / answer portal questions
→ USER performs external action
→ user confirms "I've submitted"
→ wait for response
→ user supplies response
→ Recourse analyzes it
→ recommend next legitimate step
→ repeat
```

## 3. CRITICAL USER-ACTION BOUNDARY

Recourse must **not**:

- send email on behalf of the user;
- submit appeal portals;
- browser-automate third-party forms;
- call institutions;
- claim something was submitted;
- choose an external communication action for the user.

Recourse prepares and assists.

The user chooses and performs the action.

When ready, the product gives them:

1. **Draft email**
2. **Generate formal letter**
3. **Ask Recourse**

The Ask Recourse experience must be case-aware and especially useful when a portal asks questions.

Example:

> "The portal asks why this decision should be reconsidered. What should I write?"

Recourse answers from the actual case and evidence.

If the case lacks the answer, it says so and asks the user for the fact instead of inventing it.

## 4. SUBMISSION CONFIRMATION

The user clicks:

> **I've submitted**

Ask:

- method;
- date;
- reference number optional;
- whether they used Recourse's draft unchanged, changed it or submitted something different.

If changed/different, let them paste/upload what was actually submitted.

Future response analysis must reason from the **actual submitted version**.

Then move to:

> **Waiting for a response**

When the user later clicks:

> **I received a response**

continue the same case.

## 5. MISSING INFORMATION

If Gemini cannot reliably identify an essential fact:

- save the partial analysis;
- ask the user a concise question;
- set the case to waiting/needs info;
- wait for user input;
- continue after they answer.

Do not guess the institution.

## 6. PROCEDURAL SOURCE CONFLICTS

For this MVP, do not burden the user with complex conflict screens.

Internally choose the best applicable source using:

- authority;
- specificity;
- jurisdiction;
- recency.

Keep provenance.

If the conflict is too severe to choose responsibly, show that the procedure could not be verified.

## 7. NO FORMAL PROCESS FOUND

If Tavily/Gemini cannot verify a formal process:

say so plainly.

Do not invent one.

Still allow:

- Draft email
- Formal letter
- Ask Recourse

## 8. KEEP THE ARCHITECTURE SMALL

Initialize a pnpm monorepo:

```text
apps/web    Next.js
apps/api    NestJS
packages/shared only if genuinely useful
```

Use:

- Next.js + TypeScript
- NestJS + TypeScript
- MongoDB
- Gemini
- Tavily
- Cloudinary
- Tailwind
- shadcn/ui primitives
- TanStack Query
- React Hook Form + Zod
- Playwright

Do **not** add unless absolutely necessary:

- vector search;
- embeddings;
- Pinecone/Qdrant;
- Mongo vector search;
- Redis;
- BullMQ;
- Temporal;
- Kafka/RabbitMQ;
- Neo4j;
- microservices;
- separate worker app;
- agent framework;
- GraphQL;
- Web3/blockchain;
- browser automation;
- fake external platform simulator.

I want an MVP that works, not an architecture showcase.

## 9. GEMINI — NOT GROQ

Use Gemini as the AI provider.

Prefer `gemini-3.7-flash` if it is currently available on my free-tier account and official docs still support it.

If not, select the strongest current **free-tier Flash** model supporting:

- multimodal/document input;
- structured output;
- reasoning.

Do not silently use a paid-only model.

Use the current official Google Gen AI JavaScript/TypeScript SDK.

Use structured output + Zod for machine-consumed operations.

Keep AI operations simple:

- understand case;
- extract evidence;
- extract procedure;
- analyze case;
- answer case question;
- draft email;
- draft formal letter;
- analyze response.

Do not create a swarm.

## 10. GEMINI FREE-TIER PRIVACY

Current Google docs say Gemini free-tier submitted content may be used to improve products.

This product may handle sensitive documents.

Therefore:

- document the limitation honestly;
- use synthetic/non-sensitive fixtures in the public demo;
- add a concise consent/disclosure before a user's first AI processing of uploaded evidence;
- do not claim enterprise privacy/zero retention;
- do not log raw evidence unnecessarily.

Do not derail the whole UX with a scary wall of legal copy; make it clear and concise.

## 11. TAVILY FREE TIER

Current official Tavily docs give 1,000 free credits/month.

Optimize heavily:

- one focused basic search first;
- max around 5 results;
- extract only the top 1–3 promising sources;
- official sources first;
- cache successful procedure research;
- only perform another search when necessary;
- no Tavily Research endpoint;
- no site crawl by default.

Do not waste credits.

## 12. CLOUDINARY

I use Cloudinary for evidence uploads.

Use it instead of R2/S3.

Implement with current official Cloudinary Node SDK.

Requirements:

- secure server-side/signed upload;
- API secret never client-side;
- support PDFs/documents/images;
- correct resource type;
- store Cloudinary asset/public IDs in MongoDB;
- SHA-256/deduplicate where practical;
- validate MIME/size;
- delete Cloudinary assets when user permanently deletes evidence/case;
- understand private/authenticated delivery behavior from current docs.

## 13. EXISTING `.env`

An `.env` already exists from my deleted previous project.

Do NOT overwrite it blindly.

Process:

1. inspect variable names only;
2. never expose values;
3. reuse existing useful credentials;
4. implement typed env validation;
5. remove stale variables after you know they are not used;
6. add only actually required variables;
7. produce `.env.example`;
8. tell me which variable names you removed in the final handoff.

Remove obsolete old integration variables such as Groq/R2/Voyage/vector/Redis only if they are actually present and unused.

## 14. CASE DATA

Use MongoDB as durable truth.

The LLM is not the database.

Persist:

- original decision;
- user clarifications;
- procedural research;
- evidence metadata/extracted facts;
- analysis;
- drafts;
- actual submission;
- subsequent responses;
- recommendations;
- case status.

Keep schemas simple.

No evidence knowledge graph.

No vector store.

## 15. EVIDENCE

Support:

- text;
- PDF;
- screenshot/image;
- DOCX.

Use deterministic extraction where simple and Gemini multimodal understanding where helpful.

Classify factual information internally as things like:

- verified from document;
- external source;
- user asserted;
- inferred;
- unknown/contradicted.

Do not show technical enum names in ordinary UX.

If evidence conflicts with the user, show the discrepancy neutrally and ask for clarification if it matters.

Never fabricate evidence.

## 16. CASE-AWARE CHAT

This is a major feature.

The chat has bounded access to:

- decision;
- user clarifications;
- procedure;
- evidence analysis;
- actual submitted material;
- latest response.

It should be excellent for portal/form questions.

It should not answer unrelated general questions.

If asked for an unknown fact, say that the case does not contain enough information and invite the user to supply it.

Never invent an answer just to fill a portal field.

## 17. EMAIL DRAFT

Generate:

- subject;
- concise professional body;
- suggested attachments.

User can:

- copy;
- shorten;
- make more formal;
- regenerate.

Do not send.

## 18. FORMAL LETTER

Generate a polished formal letter based on case data.

Provide preview + PDF download.

If important identity/recipient fields are unknown, ask or use visible placeholders — never invent them.

## 19. LANDING + APP DESIGN

This is extremely important.

The landing page **and entire product UI** must look and feel like a high-end **Awwwards-caliber** digital product.

Follow `design.md` faithfully.

Do NOT give me:

- default shadcn dashboard;
- generic AI gradient site;
- boring CRUD admin;
- huge generic chatbot;
- dozens of identical cards.

I want:

- exceptional typography;
- editorial composition;
- tasteful motion;
- refined micro-interactions;
- sophisticated spacing;
- memorable landing-page storytelling;
- cohesive visual language across landing and product;
- premium upload/processing states;
- polished case transitions;
- beautiful mobile experience.

However, Recourse is used by stressed people.

UX clarity wins over visual gimmicks.

The user must always know:

- what happened;
- what Recourse found;
- what Recourse needs;
- what they can do next.

Hide technical details such as:

- model names;
- JSON;
- token counts;
- Tavily/Gemini traces;
- prompt text;
- provider scores;
- DB terminology.

Use plain language.

## 20. FULL UX STATES

Build real states for:

- new user;
- empty cases;
- new case;
- text upload;
- file upload;
- processing;
- missing-info question;
- research found;
- no process found;
- evidence missing;
- contradiction clarification;
- ready;
- Ask Recourse;
- email draft;
- formal letter;
- submission confirmation;
- waiting for response;
- response received;
- continued case;
- resolved/closed;
- provider quota/error;
- upload error.

No fake/demo-only runtime states.

## 21. PROVIDER ERRORS

Persist progress.

Handle gracefully:

- Gemini 429/quota;
- Gemini structured output failure;
- Tavily 429/quota;
- no Tavily source;
- Cloudinary upload/delete failure;
- Mongo failure.

No retry storms.

## 22. HIGH-STAKES CASES

Do not hardcode domains out of the product.

If case understanding indicates the matter is unusually high-stakes, Recourse may show a concise recommendation to consider qualified professional help while still helping with:

- understanding;
- organization;
- evidence;
- official procedural research;
- case-aware questions.

Do not claim to replace professional representation.

## 23. IMPLEMENT EVERYTHING — DO NOT STOP AT PHASES

Build the complete V1 now:

- monorepo;
- frontend;
- backend;
- auth;
- database;
- Cloudinary;
- Gemini;
- Tavily;
- case lifecycle;
- evidence;
- research;
- chat;
- email drafting;
- formal letter/PDF;
- submission confirmation;
- response continuation;
- errors;
- accessibility;
- tests;
- visual polish.

Do not ask me to approve each phase.

Ask only if a genuinely blocking unknown makes correct implementation impossible.

## 24. TEST IT LIKE A REAL PRODUCT

When code is complete:

1. install;
2. lint;
3. typecheck;
4. unit/integration tests;
5. build web/API;
6. start the app;
7. run Playwright E2E;
8. run live Gemini/Tavily/Cloudinary smoke tests if credentials exist;
9. manually walk through the product;
10. fix issues.

## 25. RIGOROUS VISUAL E2E — MANDATORY

Do not simply run selector assertions.

Use Playwright/browser tools to inspect and screenshot every meaningful step.

At minimum inspect:

- 1440×900 desktop;
- 1024×768;
- ~390×844 mobile.

Walk all critical states from landing through continued case.

Compare against `design.md`.

Look for and FIX:

- overflow;
- clipping;
- poor spacing;
- default-looking components;
- broken hierarchy;
- ugly loading states;
- low contrast;
- mobile issues;
- z-index bugs;
- broken dialogs;
- missing focus;
- awkward animations;
- inconsistent typography;
- console/hydration errors.

Repeat screenshots after fixes.

The job is not complete until the flow looks polished and works.

## 26. NON-TECHNICAL USER VALIDATION

Pretend you know nothing about AI or this codebase.

Ask:

- Can I understand what Recourse does from the landing page?
- Can I start without reading documentation?
- Do I know what is happening while it analyzes?
- Can I understand why evidence is missing?
- Is "Ask Recourse" obvious for portal questions?
- Can I find/copy the draft easily?
- Is it clear Recourse did NOT submit anything for me?
- Is "I've submitted" obvious?
- Is continuing after a response obvious?
- Is there technical jargon that should be removed?

Fix problems you find.

## 27. FINAL COMPLETION AUDIT

Reread every project document.

Ensure:

- no hardcoded domains;
- no Groq;
- no R2;
- no vector search;
- no external submission automation;
- Cloudinary used;
- Gemini used;
- free-tier awareness;
- case-aware chat works;
- email + letter generation works;
- actual-submission capture works;
- response continuation works;
- Awwwards-quality design;
- visual E2E performed.

## 28. FINAL HANDOFF TO ME

Your final response must contain:

### What you built
Plain-language summary.

### Repository structure
Important folders/files.

### Existing `.env` cleanup
List:
- variables kept;
- variables added;
- stale variable names removed.

Never reveal values.

### Every required env variable
Grouped logically.

### Provider setup
Exact steps for:
- Gemini
- Tavily
- MongoDB
- Cloudinary

Use current official docs.

### Free-tier notes
Tell me:
- practical Gemini limits/data-policy considerations;
- Tavily credit behavior;
- any Cloudinary/Mongo limits relevant to the MVP.

### How to run locally
Exact clean commands.

### How the product works
Full flow from case creation to response continuation.

### Manual test
Exact steps I should perform.

### Test results
List commands actually run and pass/fail results.

### Visual QA performed
Tell me which screens/viewports you inspected and what you fixed.

### Known limitations
Be explicit:
- Recourse does not submit for users;
- no automated external monitoring;
- procedure research can be incomplete;
- AI can be wrong;
- free Gemini privacy limitation;
- other genuine limitations.

Do not declare the project complete until it actually builds, runs and the required flow has been validated.

---

End of one-shot prompt.
