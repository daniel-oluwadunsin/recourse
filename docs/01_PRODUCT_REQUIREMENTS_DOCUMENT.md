# Recourse — Product Requirements Document

## 1. Product overview

Recourse is an autonomous case-intelligence agent that helps people navigate consequential decisions made against them.

A user brings the decision. Recourse:

1. understands the situation;
2. asks the user for critical missing information when necessary;
3. researches the current official procedure;
4. analyzes the user's evidence;
5. identifies gaps, contradictions and useful facts;
6. helps the user prepare whatever communication they choose;
7. waits for the user to perform the external action;
8. continues the same case when a response arrives.

Recourse is intended to work across **many domains without hardcoded domain workflows**.

## 2. Core problem

People regularly receive messages such as:

- "Your account has been suspended."
- "Your application has been refused."
- "Your claim has been denied."
- "Your scholarship has been terminated."
- "Your payment has been held."
- "Your benefits have been stopped."
- "Your appeal has been rejected."
- "Your access has been revoked."
- "Your request was unsuccessful."

The institution usually has:

- policies;
- decision systems;
- internal knowledge;
- process expertise.

The individual usually has:

- a notice;
- scattered evidence;
- limited time;
- no idea what to do next.

Recourse reduces this procedural asymmetry.

## 3. Product category

- Autonomous Consumer Advocacy
- Agentic Case Management
- Digital Contestability / Procedural Intelligence

Do not market the MVP as an "AI lawyer".

## 4. Target users

Any individual or small business dealing with an adverse institutional decision.

The product must not require the user to choose from a fixed set of domains.

### Example users only

- student;
- driver;
- creator;
- seller;
- employee;
- applicant;
- policyholder;
- taxpayer;
- tenant;
- merchant;
- customer;
- business owner.

These are examples, not code-level categories.

## 5. Product principles

### 5.1 Domain-agnostic

The application receives a case, not a domain adapter.

### 5.2 Evidence before persuasion

Do not immediately draft a persuasive response.

First understand:

- the decision;
- the process;
- the evidence;
- what is missing.

### 5.3 User controls external action

Recourse does not send email, submit forms, navigate portals, call institutions or claim that a submission was made.

### 5.4 User decides the communication format

When ready, the user chooses what they need:

- draft email;
- formal letter;
- case-aware answer assistance.

Recourse does not force the user into an email/letter/portal workflow.

### 5.5 Sources for procedural claims

Current process facts should be grounded in retrieved sources, preferably authoritative/official sources.

### 5.6 Truthful evidence handling

Never invent:

- invoices;
- certificates;
- events;
- dates;
- screenshots;
- signatures;
- correspondence;
- policy rights.

### 5.7 Honest uncertainty

If Recourse does not know, it says so or asks the user.

## 6. Main user journey

### Stage A — Start a case

CTA:

> **Bring your case**

User can provide:

- text;
- screenshot/image;
- PDF;
- DOCX;
- multiple files as needed.

The intake should be exceptionally simple.

Suggested initial prompt:

> **What happened?**
>
> Paste the decision or upload what you received.

Do not make the user choose "insurance", "platform", "university", etc.

### Stage B — Understand the decision

Gemini extracts generic fields:

- institution/organization;
- decision/action;
- stated reason;
- date;
- reference/case number;
- jurisdiction/location if relevant and supported;
- amount/value affected if visible;
- what the user appears to want;
- unknown critical details.

The UI shows a human summary.

Example:

> **Your seller account was suspended because the marketplace says it could not verify the authenticity of three products.**

Allow user correction.

### Stage C — Missing critical information

If essential context is missing:

> **I need one thing before I can continue**
>
> Which organization sent this decision?

User answers.

Case enters `NEEDS_INFO` until the answer is supplied.

Then analysis resumes.

Ask only necessary questions, one focused group at a time.

### Stage D — Research the current process

Recourse uses Tavily to research the user's actual:

- institution;
- decision;
- relationship;
- jurisdiction/context where relevant.

It attempts to determine:

- whether a formal review/appeal/complaint process exists;
- where official guidance lives;
- deadline if verified;
- evidence/document expectations;
- important steps;
- any meaningful next route.

The UI translates this into plain language.

Do not display:

> "Tavily retrieved 5 chunks."

Display:

> **We found the current review process.**

### Stage E — No process found

If no formal process can be verified:

> **I couldn't verify a formal review process for this decision.**

Then still allow:

- Draft email
- Generate formal letter
- Ask Recourse

Do not invent an appeal.

### Stage F — Evidence

User uploads relevant files.

Recourse identifies:

- useful evidence;
- relevant facts;
- dates;
- entities;
- contradictions;
- missing evidence;
- questions it cannot answer.

Example:

> **One important piece is still missing**
>
> Your invoices show who supplied the products, but nothing currently confirms that supplier was authorized for this product line.

### Stage G — User clarification

If a contradiction requires explanation:

> **I found a date mismatch**
>
> Your message says June 3, but the uploaded confirmation shows June 7. Was June 3 an earlier submission?

Wait for user input when the answer materially affects the case.

### Stage H — Case ready

Use plain status labels:

- Needs information
- Building your case
- Needs evidence
- Ready

Avoid fake precision such as "97.4% ready" in the primary UI.

When ready:

> **Your case is ready**
>
> I couldn't find any unresolved critical evidence gap based on the information currently available.

Then show user-controlled actions:

1. **Draft email**
2. **Generate formal letter**
3. **Ask Recourse**

### Stage I — Draft email

Generate:

- suggested subject;
- body;
- suggested attachments;
- important reference number(s).

Buttons:

- Copy subject
- Copy email
- Regenerate
- Make shorter
- Make more formal
- Ask about this draft

Do not send the email.

### Stage J — Formal letter

Generate a professional letter from the case.

If required identity/address fields are absent, ask the user or leave explicit placeholders.

Allow:

- preview;
- download PDF;
- download DOCX if implementation remains simple enough;
- copy text.

The formal letter is a **derived document**, not evidence.

### Stage K — Case-aware intelligence chat

The case chat is core functionality.

It has access to the current:

- decision;
- user clarifications;
- evidence analysis;
- procedure research;
- prior submitted material;
- responses.

Example:

User:

> The portal asks "Why should this decision be reconsidered?" What should I write?

Recourse:

- answers from the case;
- does not invent unknown information;
- calls out if an answer requires a fact the case does not contain.

If user supplies a missing fact, store it as `USER_ASSERTED`.

Example:

> I don't have reliable information in your case to answer how many prior warnings you received. If you know the answer, tell me and I'll help phrase it.

### Stage L — User submits externally

After preparing material, show:

> **I've submitted**

Recourse asks:

**How did you submit it?**

- Email
- Online portal/form
- Formal letter/document
- In person
- Other

Then:

- submission date;
- reference number optional.

Then ask:

**What did you actually submit?**

- I used Recourse's draft unchanged
- I changed it
- I submitted something different

If changed/different, allow upload/paste of actual submitted content.

This is necessary because future reasoning must use what the institution actually received.

### Stage M — Waiting for response

Case now shows:

> **Waiting for a response**

Do not pretend Recourse is automatically monitoring external systems.

CTA:

> **I received a response**

### Stage N — Continue case

User uploads/pastes the response.

Recourse compares it with:

- original decision;
- actual submission;
- evidence;
- prior response(s);
- current procedural research.

It extracts:

- outcome;
- new reasons;
- issues addressed;
- issues not addressed;
- new evidence requested;
- changed institutional reasoning;
- next possible route.

Then the user can again choose:

- Draft email
- Generate formal letter
- Ask Recourse

The loop repeats.

### Stage O — Closing

User controls closure.

Possible product states:

- Resolved
- Closed by user
- No verified next route found
- Professional help recommended

If the institution provides partial relief, ask whether the user wants to close or continue.

## 7. Important edge cases for the MVP

### Cannot identify institution/context

Ask user and wait.

### No formal procedure

Say so; communication tools remain available.

### Conflicting official sources

Silently select the most credible applicable source internally for the MVP.

If the conflict cannot be responsibly resolved, say procedure is uncertain.

### Deadline appears passed

Research whether another verified route exists.

Do not invent extensions.

### User already submitted before using Recourse

Allow the case to start at that stage.

Capture:

- original decision;
- what they submitted;
- when;
- response if any.

### Multiple prior submissions

Maintain a chronological case history.

### Evidence contradicts user

Do not accuse the user of lying.

Show the discrepancy and ask for clarification if material.

### User asks Recourse to lie

Refuse to state a known falsehood as fact.

Help present truthful context instead.

### Evidence is unreadable

Say what could not be read and request a clearer version.

### Huge documents

Extract locally where possible and narrow relevant content before Gemini analysis.

### Multiple languages

Gemini may interpret/translate, but preserve the original content and clearly distinguish translations.

### Multiple decisions in one notice

Recourse may identify multiple issues but keep them in one case unless the user chooses otherwise.

### Institution changes its stated reason

Highlight the changed basis and reconsider the case.

### No response from institution

When user returns and says no response, research any verified follow-up procedure.

### Phone/in-person response

Allow user to describe it; mark as user-reported/unverified.

### Evidence unavailable

Allow the user to mark a requested item unavailable and ask Recourse about alternatives.

### User only wants understanding

Do not force them to challenge the decision.

### User changes their mind

Allow closing at any point.

### Case appears high-stakes

Recourse may continue with organization, evidence and official procedural research while clearly suggesting qualified professional help where appropriate.

Do not hardcode domain denial lists into normal case routing.

## 8. Evidence model

Every important factual item should have an internal source status:

- `VERIFIED_DOCUMENT`
- `VERIFIED_EXTERNAL`
- `USER_ASSERTED`
- `INFERRED`
- `CONTRADICTED`
- `UNKNOWN`

The user does not need to see these enum names.

## 9. Procedure research source priority

Prefer:

1. official institution/platform;
2. official government/regulator;
3. official ombudsman/dispute body;
4. strong professional/consumer guidance;
5. community sources only as discovery clues.

For MVP conflict resolution, rank internally and show the best supported answer.

## 10. Case-aware chat behavior

Chat is scoped to the case.

It should answer:

- what the decision means;
- what the evidence says;
- what information is missing;
- how to answer portal questions;
- what to attach;
- what an official procedure says;
- why Recourse recommends something;
- what changed in the latest response.

For unrelated questions:

> **I can help with questions related to this case.**

## 11. Formal/generated artifacts

Recourse may generate:

- email draft;
- formal letter;
- case summary;
- evidence list;
- simple chronology if useful.

It must never generate fabricated source evidence.

## 12. UX and visual direction

### Visual bar

The whole experience — including landing page and app — should feel like a premium **Awwwards-caliber** product.

Avoid:

- generic shadcn dashboard;
- left-sidebar enterprise CRUD look unless `design.md` calls for it;
- generic gradient AI landing page;
- giant chat box as the whole product;
- excessive cards;
- exposed technical traces.

Prefer:

- refined editorial layouts;
- confident typography;
- visual storytelling;
- tasteful motion;
- subtle depth;
- premium micro-interactions;
- generous whitespace;
- responsive composition;
- memorable transitions;
- case information that feels calm and trustworthy.

### UX bar

A stressed person should know what to do without reading documentation.

Every major screen should answer:

1. What is happening?
2. What did Recourse find?
3. What do you need from me?
4. What can I do now?

### Awwwards without sacrificing usability

Do not use animation that:

- delays critical actions;
- causes motion sickness;
- obscures text;
- makes mobile unusable;
- causes layout instability.

Respect reduced-motion preferences.

## 13. Free-tier constraints

### Gemini

Use one capable Flash model rather than complicated model routing unless current limits make another choice materially better.

Current default target:
`gemini-3.7-flash`

Use:

- structured outputs;
- multimodal understanding;
- bounded prompts;
- local text extraction for very large documents when practical.

Codex must verify current model availability and free limits before implementation.

### Tavily

Current official docs state:

- 1,000 free credits/month;
- Basic Search = 1 credit;
- Advanced Search = 2 credits;
- Basic Extract = 1 credit per 5 successful URLs.

Therefore:

- basic search by default;
- small result count;
- extract only best sources;
- cache procedure research.

### Cloudinary

Use Cloudinary for all evidence uploads.

Prefer secure signed/backend-controlled upload behavior rather than exposing the API secret.

Support raw files such as PDFs/documents using appropriate Cloudinary resource types.

## 14. Privacy

Gemini free-tier content policy must be acknowledged.

Before real sensitive uploads are processed with Gemini free tier, the user should receive a concise disclosure/consent step.

Public hackathon demo data should be synthetic/non-sensitive.

## 15. MVP non-goals

Do not build:

- external submission automation;
- Gmail sending;
- portal automation;
- case monitoring;
- vector search;
- embeddings;
- cross-user collective intelligence;
- policy change monitoring;
- institutional adapters;
- legal filing;
- browser-control agents;
- mobile native apps;
- teams/organizations;
- payments/subscriptions;
- elaborate case knowledge graphs.

## 16. MVP success criteria

A reviewer can bring an arbitrary case and complete the full loop without any domain being preconfigured.

The product should visibly prove:

- flexible case understanding;
- live procedure research;
- evidence reasoning;
- missing-info questioning;
- case-aware intelligence;
- truthful drafting;
- continuity after submission and response.
