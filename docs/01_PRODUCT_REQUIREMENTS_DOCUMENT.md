# Recourse — Product Requirements Document (PRD)

**Version:** 1.0  
**Date:** 2026-08-16  
**Audience:** Product, engineering, design, AI/agent engineering, security, QA, operations, and coding agents with no prior project context  
**Status:** Build specification

---

# 1. Executive summary

Recourse is an autonomous case agent for people and businesses who receive consequential adverse decisions from digital platforms or institutions.

Examples include:

- a marketplace seller account being suspended;
- a gig worker being deactivated;
- a creator being demonetized or terminated;
- a merchant's funds being placed on hold;
- an advertising account being disabled;
- an account being restricted after an identity-verification issue;
- a platform rejecting an internal appeal.

Today, a person who receives one of these decisions is usually forced to manually decode a fragmented process spread across help-center pages, emails, terms, policy documents, authenticated portals, regulator pages, and support messages. They often do not know:

- what exactly the institution decided;
- why it says it made the decision;
- what challenge or review procedure applies;
- whether there is a deadline;
- what evidence the institution expects;
- which evidence they already possess;
- what evidence is missing;
- whether the institution's messages contradict one another;
- whether their first appeal actually addressed the stated reason;
- what to do after rejection;
- which legitimate remedy remains.

Recourse turns that fragmented process into a persistent, auditable case.

The product ingests the adverse decision, classifies it, retrieves the current applicable procedure from live authoritative sources, structures and verifies that procedure, ingests and analyzes evidence, builds a case graph and chronology, identifies evidence gaps, prepares a grounded challenge, tracks the case, analyzes new responses, and recommends or performs the next legitimate action where technically supported.

The central product promise is:

> **Recourse helps a user understand, prepare, and navigate a legitimate challenge to a consequential decision using live procedures and evidence-grounded reasoning.**

Recourse is intentionally not positioned as an AI lawyer and must never fabricate legal rights, procedural routes, evidence, or successful submissions.

---

# 2. Product vision

## 2.1 Long-term vision

Institutions increasingly use automated systems, risk models, moderation systems, fraud systems, ranking systems, and AI agents to make decisions at enormous scale. The person affected by a decision generally has far less procedural knowledge, data organization, time, and institutional leverage.

Recourse exists to become the **contestability layer for the algorithmic economy**: infrastructure that gives an individual or small business an intelligent, persistent agent capable of understanding and navigating the process for challenging a consequential decision.

The long-term abstraction is:

```text
Adverse decision
      ↓
Understand what happened
      ↓
Determine applicable procedure
      ↓
Understand what must be established
      ↓
Collect and organize evidence
      ↓
Identify gaps / contradictions
      ↓
Prepare challenge
      ↓
Submit or guide submission
      ↓
Observe response
      ↓
Re-evaluate case state
      ↓
Take next legitimate procedural action
      ↓
Resolved / exhausted / human escalation
```

## 2.2 Initial wedge

The first production scope is **platform livelihood and business enforcement decisions**.

Primary case families:

1. **Marketplace seller suspension/restriction**
   - seller account suspended;
   - listings removed;
   - payouts held;
   - authenticity/compliance concerns;
   - merchant verification failures.

2. **Gig-worker deactivation**
   - driver/courier deactivation;
   - identity/account-sharing allegations;
   - safety/compliance enforcement;
   - payment or access restrictions.

3. **Creator/business-platform enforcement**
   - demonetization;
   - channel/account termination;
   - business account restriction;
   - content/account enforcement affecting livelihood.

The architecture must be generic enough to support other case types later, but V1 must not claim universal coverage.

---

# 3. Product category and positioning

## 3.1 Market category

Recourse sits at the intersection of:

- autonomous consumer advocacy;
- agentic case management;
- LegalTech/access-to-justice infrastructure;
- digital contestability;
- procedural intelligence;
- consumer/business dispute tooling.

The preferred product category language is:

> **Autonomous Consumer Advocacy**

and the more technical category is:

> **Agentic Case Management / Contestability Infrastructure**

## 3.2 What Recourse is not

Recourse is **not**:

- a generic chat assistant;
- a generic legal chatbot;
- a guaranteed reinstatement service;
- a lawyer replacement;
- a system that fabricates arguments or documents;
- a browser bot that blindly submits forms;
- a static database of appeal procedures;
- a letter template generator;
- an outcome prediction system presented as certainty;
- a system that claims knowledge of hidden platform signals;
- a system that invents rights or deadlines when sources are unavailable.

---

# 4. Product principles

## 4.1 Evidence before persuasion

Recourse should not optimize first for sounding persuasive. It should optimize for understanding whether the user's case is factually and procedurally ready.

A high-quality Recourse interaction may tell the user:

> “Do not submit yet. A critical evidence requirement is still unaddressed.”

That is a feature, not a failure.

## 4.2 Provenance over confidence theater

Every important claim should answer:

- Where did this fact come from?
- Is it verified or merely asserted?
- What source supports this procedural rule?
- How current is the source?
- Is there disagreement between sources?

The user must not be shown arbitrary “AI confidence” that has no interpretable basis.

## 4.3 Live procedures over model memory

Procedures change. Recourse should retrieve and verify current authoritative sources rather than rely on model training data.

## 4.4 Honest capability boundaries

If Recourse cannot submit to a platform, it must say so and provide the precise official handoff.

If Recourse cannot determine why an institution rejected evidence, it must say the reason is unknown rather than invent a hidden rationale.

## 4.5 Persistent case state over chat history

The unit of work is a **case**, not a conversation.

Chat can help users interact with the case, but the system of record is structured case state.

## 4.6 Human authorization for consequential action

Recourse may automatically research, classify, analyze, and organize. Outward-facing actions with consequences require appropriate confirmation.

## 4.7 Safety and truthfulness are product features

Recourse must not help a user knowingly fabricate evidence, misrepresent facts, impersonate another person, bypass authentication controls, or abuse complaint processes.

---

# 5. Target users

## 5.1 Primary personas

### Persona A — Marketplace seller

A small or medium-sized online seller whose account, listings, or payouts are restricted.

Pain:

- revenue stops immediately;
- platform messages are vague;
- evidence is scattered across invoices, purchase orders, supplier documents, emails, shipping records, and account notices;
- the seller may waste an appeal attempt by submitting too early.

Goal:

- understand what must be proven;
- assemble the strongest truthful case;
- avoid missing deadlines;
- navigate review/escalation correctly.

### Persona B — Gig worker

A driver/courier whose income depends on platform access.

Pain:

- sudden deactivation;
- unclear allegations;
- difficulty understanding what evidence is accepted;
- confusing review workflow;
- limited time and procedural expertise.

Goal:

- understand the decision;
- gather relevant records;
- present an accurate chronology;
- pursue legitimate review options.

### Persona C — Creator/small digital business

A creator or business dependent on a social/video/advertising platform.

Pain:

- demonetization, account restriction, or removal affects revenue/audience access;
- support channels are fragmented;
- responses may be generic;
- policy language is difficult to map to the user's facts.

Goal:

- identify applicable policy and review route;
- prove context/compliance where possible;
- track the case across multiple responses.

## 5.2 Secondary personas

Later versions may support:

- payment processor disputes;
- chargeback evidence cases;
- warranty/consumer disputes;
- education administrative decisions;
- government administrative decisions;
- regulated financial decisions;
- insurance disputes.

These are not V1 promises.

---

# 6. Core user stories

## 6.1 Intake

As a user, I can create a case by:

- uploading a screenshot;
- uploading a PDF/document;
- pasting the text of the decision;
- forwarding an email to a case-specific address;
- manually entering decision details when necessary.

The system should extract the institution, decision type, stated reason, date, financial exposure where available, and likely relationship type.

## 6.2 Procedure discovery

As a user, I can see what current review/challenge process Recourse found, where it found it, when it was verified, and what remains uncertain.

## 6.3 Evidence collection

As a user, I can upload files and correspondence, and Recourse organizes them into structured facts rather than presenting an unstructured pile of documents.

## 6.4 Evidence gap analysis

As a user, I can see:

- which procedural/evidentiary requirements appear satisfied;
- which remain missing;
- which are only supported by my assertion;
- what evidence conflicts.

## 6.5 Case readiness

As a user, I can understand whether Recourse recommends filing now, gathering more evidence, requesting clarification, waiting, or escalating.

## 6.6 Grounded challenge drafting

As a user, I can receive a challenge/appeal whose factual statements can be traced back to case evidence and whose procedural references can be traced back to live sources.

## 6.7 Response tracking

As a user, I can forward/upload a new institutional response and have Recourse automatically associate it with the case, update status, analyze the response, and determine the next procedural step.

## 6.8 Deadlines

As a user, I can see deadlines, their source, their triggering event, and warnings before they expire.

## 6.9 Case export

As a user, I can export a structured case packet containing:

- decision summary;
- chronology;
- evidence index;
- claims and support;
- correspondence;
- procedures relied upon;
- challenges submitted;
- responses;
- unresolved issues.

---

# 7. End-to-end case lifecycle

## 7.1 State model

A case can move through the following application-controlled states:

```text
INTAKE
  ↓
CLASSIFYING
  ↓
PROCEDURE_RESOLUTION
  ↓
EVIDENCE_COLLECTION
  ↓
CASE_ANALYSIS
  ↓
READY_TO_APPEAL
  ↓
AWAITING_USER_APPROVAL
  ↓
SUBMITTED
  ↓
AWAITING_RESPONSE
  ↓
RESPONSE_RECEIVED
  ↓
REPLANNING
  ↓
  ├────────────→ EVIDENCE_COLLECTION
  ├────────────→ READY_TO_APPEAL
  ├────────────→ AWAITING_USER_APPROVAL
  ├────────────→ RESOLVED
  ├────────────→ EXHAUSTED
  └────────────→ NEEDS_HUMAN
```

The AI must never freely invent statuses.

## 7.2 Case outcome states

### RESOLVED

The desired issue has been verified as resolved based on a real external response or verified user confirmation.

### EXHAUSTED

Recourse has verified that the currently supported/known internal procedural routes are exhausted and there is no safe automated next action.

### NEEDS_HUMAN

The case requires qualified legal/professional review, manual interaction, disputed jurisdiction, inaccessible authenticated information, or another issue beyond Recourse's safe product boundary.

---

# 8. Functional requirements

# 8.1 Authentication and account management

Recourse must support:

- account creation;
- secure login;
- session refresh;
- logout;
- email verification if enabled for production;
- password reset;
- data export;
- account deletion request;
- explicit consent before processing sensitive case documents.

V1 should prioritize email/password authentication with secure refresh-token handling. Social sign-in is optional and should not block the core build.

# 8.2 Case creation

A user must be able to create a case from:

- plain text;
- screenshot/image;
- PDF;
- document;
- email;
- manual structured form.

Required behavior:

1. persist the original submission;
2. compute integrity hash for uploaded evidence;
3. queue processing;
4. extract structured case classification;
5. show uncertain fields to the user rather than silently guessing;
6. allow user correction;
7. preserve both original extraction and user correction history.

Classification fields include:

- institution name;
- institution domain if known;
- user relationship (`seller`, `driver`, `creator`, `merchant`, `consumer`, etc.);
- decision family;
- decision date;
- notification date if different;
- stated reason;
- monetary amount/currency if explicit;
- account/claim/reference identifiers;
- country/account jurisdiction candidates;
- source evidence IDs.

# 8.3 Jurisdiction resolution

Recourse must never assume jurisdiction solely from IP geolocation.

It should consider:

- account registration country;
- institution/contracting entity when available;
- decision document references;
- user confirmation;
- relevant service territory.

If jurisdiction materially changes the procedure and remains uncertain, the case must enter an explicit `NEEDS_USER_INPUT` substate/action rather than guessing.

# 8.4 Live procedural retrieval

This is a core system feature.

Given a structured case classification, Recourse must attempt to identify the current challenge procedure.

The retrieval layer must:

1. check whether a previously verified compatible procedure exists;
2. verify freshness and source availability;
3. formulate targeted queries if retrieval is required;
4. prioritize authoritative sources;
5. retrieve the underlying source pages rather than relying solely on search snippets;
6. extract candidate procedural claims into a strict schema;
7. independently verify each material claim against the source text;
8. identify conflicting sources;
9. assign source/claim/procedure confidence using deterministic rules plus model-assisted semantic verification;
10. store immutable source snapshots and version the procedure;
11. expose provenance to the UI.

### Source authority tiers

**Tier 1 — primary/authoritative**

- official platform policy/help center;
- official regulator;
- official government source;
- official ombudsman/ADR provider;
- statutory/regulatory text.

**Tier 2 — strong secondary**

- recognized consumer organizations;
- reputable professional/legal guidance used only to explain or discover, not override official procedure.

**Tier 3 — discovery only**

- forums;
- social media;
- Reddit;
- personal blogs;
- videos;
- unofficial guides.

A Tier 3 source must never be the sole basis for a material procedural claim.

### Procedure data

The structured procedure should include, where known:

- eligibility for internal review;
- submission channel;
- authentication requirement;
- deadline(s);
- triggering event for deadline;
- accepted/required evidence;
- procedure steps;
- response timing if officially stated;
- second-level review;
- external escalation route;
- jurisdiction constraints;
- official URLs;
- last verified timestamp;
- source claims and passages;
- known conflicts/uncertainty.

Unknown values remain explicitly unknown.

# 8.5 Procedure versioning and change monitoring

A procedure must not be overwritten when sources change.

Recourse must retain:

- procedure version;
- prior version reference;
- source snapshots;
- observed change date;
- changed claims;
- semantic change summary;
- potentially affected active cases.

Background verification may periodically re-fetch high-value procedures.

If a material procedure changes, active affected cases should be re-evaluated.

# 8.6 Evidence ingestion

Supported evidence types should include:

- PDF;
- screenshot/image;
- common document formats such as DOCX;
- email/EML;
- plain text;
- common image formats;
- externally retrieved official web sources as a separate source class.

Each evidence item stores:

- owner/case;
- original filename where necessary for display;
- opaque storage key;
- MIME type;
- size;
- SHA-256 hash;
- processing status;
- extraction method;
- extracted text/blocks;
- page/section coordinates where available;
- created time;
- user label/type;
- provenance.

The original binary must live in encrypted object storage, not as a MongoDB document payload.

# 8.7 Evidence claim extraction

Recourse must transform evidence into atomic case claims.

Examples:

- `Supplier invoice is dated 2026-07-17.`
- `The invoice seller name is Apex Distribution Holdings Ltd.`
- `The supplier registration number is RC-813027.`
- `The platform notice states “suspected counterfeit inventory”.`

Each claim must include:

- claim text;
- normalized semantic type where possible;
- entity references;
- source evidence ID;
- source page/block/location;
- evidence status;
- confidence;
- extraction timestamp;
- model/prompt version.

# 8.8 Evidence statuses

At minimum:

- `VERIFIED_DOCUMENT` — directly supported by a supplied artifact;
- `VERIFIED_EXTERNAL` — directly supported by an authoritative external source;
- `USER_ASSERTED` — user said it, no independent evidence yet;
- `INFERRED` — reasoned inference, not direct evidence;
- `CONTRADICTED` — materially conflicts with another source/claim;
- `UNKNOWN` — cannot be established.

The interface must visually distinguish these categories.

# 8.9 Case graph

The product must maintain a persistent graph representing relationships among:

Node types:

- decision;
- allegation/reason;
- claim;
- evidence;
- entity;
- procedural requirement;
- policy/procedure claim;
- appeal/challenge;
- response;
- deadline;
- recommended action.

Edge types include:

- supports;
- contradicts;
- derives from;
- requires;
- satisfies;
- addresses;
- fails to address;
- governs;
- supersedes;
- triggers;
- references.

The graph must be persisted as application data, not generated only for visualization.

# 8.10 Timeline reconstruction

Recourse must build a chronology from evidence and case events.

Every timeline item should include:

- timestamp/date;
- uncertainty if exact time unknown;
- event type;
- description;
- evidence/response/action source;
- source confidence.

Conflicting dates must be surfaced.

# 8.11 Evidence requirement matching

Recourse must compare procedural requirements and case theories against evidence.

For each requirement:

- requirement status: `SATISFIED`, `PARTIAL`, `MISSING`, `NOT_APPLICABLE`, `UNCERTAIN`;
- linked evidence;
- reason;
- confidence;
- user-facing recommended next step.

# 8.12 Case readiness

Readiness must be computed from structured factors, not invented by the LLM.

Inputs may include:

- completion of critical requirements;
- evidence quality;
- unresolved contradictions;
- jurisdiction certainty;
- procedure confidence;
- chronology completeness;
- unresolved facts central to the allegation.

The exact formula may evolve, but must be deterministic, testable, versioned, and explainable.

The UI should show both the score and the reasons.

# 8.13 Contradiction detection

Recourse must identify potential contradictions such as:

- institution gives different reasons in different messages;
- invoice/entity names differ;
- dates do not line up;
- user assertion conflicts with documents;
- appeal claims conflict with prior correspondence.

The system must distinguish a true contradiction from an explainable discrepancy.

Example:

`Apex Distribution Ltd` vs `Apex Distribution Holdings Ltd` may be a contradiction until corporate-name evidence resolves it.

# 8.14 Recommendation engine

The case reasoner can recommend only from a controlled action taxonomy.

Examples:

- `COLLECT_EVIDENCE`;
- `REQUEST_CLARIFICATION`;
- `WAIT_FOR_RESPONSE`;
- `FOLLOW_UP`;
- `GENERATE_APPEAL`;
- `SUBMIT_APPEAL`;
- `SUBMIT_SECOND_REVIEW`;
- `USE_EXTERNAL_REMEDY`;
- `ESCALATE_TO_HUMAN`;
- `CLOSE_RESOLVED`;
- `CLOSE_EXHAUSTED`.

The model must not create arbitrary action types in production.

# 8.15 Challenge/appeal generation

The generator must produce an evidence-grounded draft.

Every factual proposition should link to one or more case claims/evidence items.

Every procedural/policy proposition should link to one or more verified procedural claims.

The system must calculate:

- factual grounding coverage;
- procedural grounding coverage;
- unsupported assertion count;
- unresolved contradictory claim count.

A draft with unsupported material assertions must be blocked or clearly flagged before outward submission.

# 8.16 Action capability model

Each institution/route can declare one of the following:

- `AUTO_API` — supported official API can perform action;
- `EMAIL` — official/procedurally valid email channel;
- `ASSISTED_PORTAL` — user must complete authenticated portal action; Recourse prepares data and guides them;
- `MANUAL` — manual/offline action required;
- `UNSUPPORTED` — no safe supported mechanism known.

Recourse must never present `ASSISTED_PORTAL` or `MANUAL` as automatically submitted.

# 8.17 Human approval gates

Actions that may create external consequences require explicit approval.

Examples requiring confirmation:

- send an email;
- submit an appeal;
- submit evidence;
- file a regulator/ADR complaint;
- contact a third party;
- withdraw/close a case.

The audit trail must record:

- proposed action;
- user approval;
- action payload/hash;
- execution result;
- external confirmation/reference;
- verification status.

# 8.18 External action verification

If Recourse performs a real external action, success must be verified.

Examples:

- API response contains a valid case/reference ID;
- email provider confirms accepted message ID;
- platform API confirms new status;
- user portal handoff requires user confirmation plus uploaded acknowledgement if no API exists.

Recourse must never infer success from the absence of an error alone.

# 8.19 Response ingestion

A response can enter a case via:

- forwarded email;
- uploaded screenshot;
- uploaded PDF;
- copied text;
- supported webhook/API integration.

Recourse should determine:

- whether the response belongs to the case;
- outcome (`APPROVED`, `REJECTED`, `PARTIAL`, `REQUEST_MORE_INFO`, `UNKNOWN`);
- reason given;
- previous claims/evidence explicitly addressed;
- evidence ignored/not discussed;
- new issues introduced;
- new evidence requested;
- changed deadlines;
- recommended next action.

# 8.20 Replanning

After any material case event, especially a rejection, the orchestrator should invoke the case reasoner with the updated structured state.

The reasoner should compare:

- original decision;
- submitted challenge;
- evidence submitted;
- response received;
- current procedure;
- remaining routes;
- deadlines;
- unresolved gaps.

It should produce a bounded recommendation with reasons and references.

# 8.21 Deadline management

Deadlines must have:

- source claim;
- date or relative duration;
- trigger event;
- calculation timezone/business-day rules when known;
- confidence/status;
- due date;
- reminders;
- change history.

If the source is ambiguous, the UI must say so.

Recourse should prefer a conservative earlier deadline when two authoritative sources conflict, while clearly presenting the conflict and requesting verification.

# 8.22 Notifications

V1 should support:

- in-app notifications;
- transactional email.

Triggers:

- procedure resolved;
- evidence processing complete;
- critical evidence gap found;
- case becomes ready;
- user action required;
- response received;
- deadline approaching;
- procedure materially changed;
- case resolved;
- case requires human review.

# 8.23 Ask Recourse

The case workspace may provide a conversational assistant, but it must be case-grounded.

Allowed examples:

- “Why do you think I need this document?”
- “Which evidence supports claim 4?”
- “What happens if I submit now?”
- “Why did the readiness score drop?”
- “What did the rejection actually address?”

The assistant should not become the authoritative state store.

# 8.24 Case activity feed

The user should see real agent activity:

- decision classified;
- source search started;
- official source found;
- source verified;
- procedure extracted;
- evidence processed;
- gap discovered;
- graph updated;
- draft generated;
- response received;
- replanning started/completed.

This feed must reflect persisted events, not fake frontend animation.

# 8.25 Case export

Exports should support at minimum a structured PDF/ZIP or document package containing:

- case summary;
- decision notice;
- timeline;
- evidence index;
- claim table;
- procedure sources;
- appeal drafts/submissions;
- responses;
- open issues.

The export must distinguish verified facts from user assertions/inferences.

---

# 9. User experience specification

# 9.1 Main navigation

Suggested primary product navigation:

- Dashboard
- Cases
- New Case
- Notifications
- Settings

# 9.2 Dashboard

Dashboard shows:

- active cases;
- cases awaiting user action;
- upcoming deadlines;
- recent responses;
- cases ready to submit;
- resolved cases.

Do not over-index on vanity analytics.

# 9.3 New Case

The primary CTA is:

> **What happened?**

Input options:

- upload decision;
- paste text;
- screenshot;
- forward email.

After upload, show a processing activity view, then a reviewable structured classification.

# 9.4 Case workspace

Recommended tabs:

- Overview
- Decision
- Evidence
- Case Graph
- Procedure
- Timeline
- Appeals/Actions
- Sources
- Activity

Persistent right-side case health panel:

- current stage;
- readiness;
- procedure confidence;
- next deadline;
- critical gaps;
- contradictions;
- next recommended action.

# 9.5 Overview

Shows:

- institution;
- decision;
- stated reason;
- monetary/livelihood impact;
- current case status;
- next action;
- simplified case graph;
- latest activity.

# 9.6 Evidence page

Supports:

- drag-and-drop upload;
- evidence list;
- processing states;
- extracted claims;
- source viewer with page highlight;
- requirement mapping;
- conflicts.

# 9.7 Procedure page

Shows:

- procedure summary;
- internal review availability;
- steps;
- deadlines;
- evidence requirements;
- escalation routes;
- confidence;
- source provenance;
- current version;
- last verified;
- conflicts.

The user must be able to click any material procedural field and inspect the source basis.

# 9.8 Case Graph

Interactive graph should allow filtering by:

- claims;
- evidence;
- procedure;
- actions;
- responses.

The graph is not decoration; node/edge content comes from persisted graph records.

# 9.9 Appeals/Actions

Shows:

- drafts;
- grounding coverage;
- attachment checklist;
- user approvals;
- submission capability;
- submission receipt/reference;
- outcome.

# 9.10 Activity

Chronological system events with human-readable messages and optional technical detail.

---

# 10. Trust, safety, and legal-product boundaries

# 10.1 No fabrication

Recourse must reject instructions to:

- invent invoices;
- forge documents;
- fabricate an event;
- misstate what evidence says;
- knowingly make a false factual claim;
- impersonate another person;
- bypass platform authentication/security;
- spam complaint channels.

It may help the user present an unverified statement as a clearly labeled assertion.

# 10.2 No guaranteed legal conclusions

Legal/regulatory content must be framed based on verified sources and jurisdiction.

If a matter crosses into legal representation, litigation, regulated professional advice, or another high-risk area outside product scope, Recourse should surface a human-review requirement.

# 10.3 Hidden institutional reasoning

The system must clearly distinguish:

- what the institution explicitly stated;
- what the evidence suggests;
- what Recourse infers;
- what remains unknowable.

# 10.4 Prompt injection

All external content is untrusted. Documents and web pages must never be allowed to change system instructions or directly trigger tools/actions.

# 10.5 Sensitive data

The product must follow data-minimization principles:

- send only relevant excerpts to AI providers when feasible;
- avoid logging raw sensitive documents;
- redact secrets from logs;
- use short-lived signed file URLs;
- encrypt data in transit and at rest;
- maintain audit logs for access and actions;
- provide deletion mechanisms.

---

# 11. Non-functional requirements

## 11.1 Reliability

- all long-running jobs are durable and retryable;
- provider failures do not corrupt case state;
- idempotent job/action handling;
- case transitions are transactional where practical;
- failed jobs are observable and recoverable;
- outward actions use idempotency where supported.

## 11.2 Performance

Initial target experience:

- API CRUD responses: p95 < 500 ms excluding provider latency;
- file upload acknowledgement: immediate after secure upload initialization/completion;
- case classification: target seconds, delivered asynchronously;
- activity events stream in near real time;
- procedure resolution may take longer but should stream progress;
- case pages should load from persisted state rather than recompute expensive AI work.

## 11.3 Scalability

API and worker must scale independently.

Avoid storing process-local state required for correctness.

Use:

- queue concurrency controls;
- provider rate limits;
- caching;
- procedure reuse;
- vector/metadata indexes;
- object storage;
- paginated APIs.

## 11.4 Auditability

Material AI operations should record:

- operation name;
- model;
- prompt version;
- schema version;
- input/source hashes or references;
- output;
- latency;
- token/cost metadata where available;
- status/error.

## 11.5 Accessibility

Core UI should meet sensible WCAG accessibility practices:

- semantic controls;
- keyboard navigation;
- sufficient contrast;
- accessible form labels;
- graph information also available in textual/table form.

---

# 12. Scope for V1

## 12.1 Must have

- user auth;
- case creation;
- upload/text/screenshot intake;
- asynchronous classification;
- live Tavily procedure discovery;
- original-source extraction;
- structured procedure extraction;
- claim-level procedure verification;
- source snapshots/provenance;
- procedure cache/versioning;
- evidence processing;
- atomic claim extraction;
- evidence statuses;
- case graph;
- timeline;
- evidence requirements/gaps;
- deterministic readiness;
- contradiction analysis;
- grounded challenge generation;
- action capability model;
- user confirmation gate;
- manual/assisted portal handoff;
- email or supported real action when valid;
- response ingestion;
- rejection analysis;
- replanning;
- deadlines;
- activity stream;
- case export;
- audit logs;
- comprehensive testing and production deployment instructions.

## 12.2 Nice to have after core V1

- Gmail/Outlook direct account connectors;
- automated monitoring of case inboxes;
- advanced regulator/ADR adapters;
- team/business workspaces;
- collaborative case access;
- billing;
- encrypted per-tenant key management enhancements;
- multilingual UI;
- automatic procedure-change impact analysis at scale;
- anonymized aggregate procedural intelligence.

## 12.3 Explicit non-goals for first release

- “appeal anything” universal coverage;
- automatic submission into websites that expose no supported interface;
- CAPTCHA circumvention;
- credential harvesting;
- representing users in court;
- creating legal filings without human/legal review;
- predicting guaranteed success rates;
- claiming access to institution-private risk signals;
- scraping authenticated pages in ways that violate user/platform rules;
- autonomous money movement;
- blockchain/Web3 functionality solely for novelty.

---

# 13. Edge cases and expected behavior

## 13.1 Institution cannot be identified

- keep case in intake/clarification;
- show extracted candidates;
- ask user to identify institution;
- do not start authoritative procedure resolution until sufficiently identified.

## 13.2 Decision reason is vague

Example: “Terms violation.”

- preserve exact wording;
- classify reason as unspecified/general;
- retrieve review procedure;
- recommend clarification where available;
- do not invent likely reason as fact.

## 13.3 Multiple conflicting decision reasons

- create separate claims for each stated reason;
- mark procedural inconsistency;
- preserve chronology showing who said what and when.

## 13.4 No appeal process found

- show retrieval coverage;
- say no verified route was found;
- do not infer absence as proof that no route exists;
- optionally request additional jurisdiction/account context;
- route to human review where appropriate.

## 13.5 Search finds only unofficial advice

- retain as discovery metadata if useful;
- continue looking for authoritative confirmation;
- do not establish procedural claims from it alone.

## 13.6 Official sources conflict

- show both;
- mark conflict;
- choose conservative action only if safe;
- require manual verification for high-impact conflict.

## 13.7 User submits altered/forged-looking document

Recourse is not a forensic certification service. It may:

- identify internal inconsistencies;
- avoid labeling authenticity as verified unless independently supported;
- request original/source confirmation;
- refuse to help intentionally fabricate or alter evidence.

## 13.8 Evidence is unreadable

- preserve original;
- mark extraction failure/low confidence;
- request clearer upload;
- do not silently infer missing values.

## 13.9 Duplicate upload

- detect by content hash;
- avoid duplicate processing/storage when appropriate;
- allow user to retain a logical second reference only if needed.

## 13.10 Same case receives unrelated email

- classify association confidence;
- do not automatically merge low-confidence response;
- ask user to confirm.

## 13.11 Deadline cannot be computed

- keep relative/source wording;
- show `UNRESOLVED` due date;
- ask for triggering date or professional verification.

## 13.12 Procedure changes during active case

- create new procedure version;
- run impact check;
- notify user only if materially relevant;
- preserve procedure version used for any prior submission.

## 13.13 User wants Recourse to lie

- refuse the false statement/action;
- preserve truthful supported alternatives.

## 13.14 Provider outage

- queue retries;
- preserve case state;
- do not mark processing complete;
- notify user if the outage materially blocks an urgent deadline.

## 13.15 User deletes case while jobs are active

- cancel or mark pending jobs as non-applicable;
- revoke access to files;
- respect retention/deletion policy;
- prevent late worker results from resurrecting deleted state.

---

# 14. Product metrics

## 14.1 Core quality metrics

### Procedural grounding coverage

Percentage of material procedural claims shown to users that have verified authoritative source support.

Target: as close to 100% as practical; unsupported material procedural claims must not be presented as facts.

### Factual grounding coverage

Percentage of material factual statements in generated appeals mapped to case evidence or explicitly marked user assertion.

### Unsupported assertion rate

Target: zero unsupported material assertions in outward-facing drafts unless explicitly labeled and approved.

### Procedure resolution success

Percentage of in-scope cases where a current authoritative internal review procedure is successfully structured.

### Evidence-gap usefulness

Human-reviewed rate at which identified critical gaps are relevant and actionable.

### Response analysis accuracy

Correct extraction of outcome/reason/requested evidence from institution responses.

## 14.2 Product outcome metrics

- user time saved;
- cases successfully prepared;
- appeals/challenges submitted;
- user-reported resolution;
- median time from intake to case-ready;
- deadline misses prevented;
- percentage of cases requiring manual clarification;
- percentage of cases escalating to human review.

Outcome/reinstatement rates can be tracked, but must not be misrepresented as guaranteed causal effects of Recourse.

---

# 15. Administration and operations

Internal admin capabilities should eventually support:

- view system health, not arbitrary private case content by default;
- provider health;
- failed jobs;
- retrieval failure analytics;
- procedure conflicts;
- model/schema error rates;
- cost/usage metrics;
- abuse flags;
- user-reported bad procedure/source;
- manual procedure review when needed.

Any staff access to private case content must be tightly controlled and audited.

---

# 16. Security/privacy requirements

- HTTPS everywhere;
- secure auth/session model;
- rate limiting and abuse protection;
- strict object ownership checks;
- encrypted managed database/storage;
- no secrets in client bundle;
- no raw evidence in application logs;
- environment-specific secrets;
- signed URLs for file access;
- short TTL for sensitive URLs;
- malware/file validation strategy;
- input size/type limits;
- prompt-injection defense;
- model output validation;
- action approval gates;
- audit trail;
- account/case deletion;
- PII minimization in model requests;
- provider retention controls reviewed before launch;
- security scan before release.

---

# 17. Product roadmap

## Phase A — Core contestability engine

- platform livelihood decisions;
- case intake;
- live procedure retrieval;
- evidence intelligence;
- challenge generation;
- response/replanning.

## Phase B — Communication and external action adapters

- inbound/outbound email;
- real official APIs where available;
- guided authenticated portal handoffs;
- response monitoring.

## Phase C — Broader procedural intelligence

- payment processors;
- chargeback disputes;
- consumer/warranty cases;
- selected regulated domains with stronger safeguards.

## Phase D — Institutional intelligence

Subject to privacy and legal review:

- aggregate anonymized procedural patterns;
- procedure change detection;
- systemic anomaly detection;
- aggregate evidence insights;
- collective issue detection without exposing individual private data.

---

# 18. Definition of done for the initial live product

The initial product is not “done” merely because it can produce a letter.

A release candidate should demonstrate, with real providers and live data sources:

1. a user can register/login;
2. user can create a case from a real decision document;
3. original artifact is securely persisted;
4. case classification is generated and editable;
5. Recourse uses Tavily to discover live authoritative procedure sources;
6. original pages are extracted and snapshot-stored;
7. material procedural claims are structured and verified against source passages;
8. user can inspect provenance;
9. user can upload multiple evidence documents;
10. claims and chronology are extracted with provenance;
11. case graph persists relationships;
12. evidence requirements are matched to evidence;
13. missing/contradictory evidence is surfaced;
14. deterministic readiness updates;
15. a grounded challenge can be generated;
16. unsupported claims are blocked/flagged;
17. a real supported outward action can be performed only after user confirmation **or** the product truthfully performs an assisted handoff when no official automated channel exists;
18. a response can be ingested;
19. response analysis updates case state;
20. Recourse replans using current evidence/procedure;
21. deadlines/notifications function;
22. all major operations appear in the audit/activity trail;
23. failures/retries do not corrupt the case;
24. tests, security checks, monitoring, and deployment documentation exist;
25. no production feature depends on fake platform behavior.

---

# 19. One-sentence product definition for every engineer/LLM

> **Recourse is a production-grade autonomous case-management agent that helps users challenge consequential platform decisions by combining live procedural retrieval, evidence-grounded case reasoning, persistent case state, and safe human-authorized actions.**

