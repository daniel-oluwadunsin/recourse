# Recourse — Test and Acceptance Plan

## 1. Goal

Prove two things:

1. the product really works end to end;
2. a non-technical user can actually use it.

Both are release blockers.

## 2. Unit tests

Test deterministic code such as:

- auth;
- ownership;
- case status changes;
- duplicate upload detection;
- research cache key;
- source ranking;
- submission state;
- env validation;
- generated-document metadata.

## 3. Integration tests

Verify:

- user and case persistence;
- case isolation;
- document metadata;
- Cloudinary adapter contract;
- research persistence;
- draft persistence;
- response continuation.

Use deterministic test fixtures where appropriate.

## 4. Live provider smoke tests

Behind an explicit opt-in env flag to avoid burning free quota.

### Gemini

Run a small structured-output case-understanding request.

### Tavily

Run:

- one basic search;
- one basic extract against a returned source.

### Cloudinary

Upload/delete one tiny fixture.

## 5. Required functional E2E

Use Playwright.

### Flow A — normal arbitrary case

1. sign up;
2. start case;
3. paste/upload decision;
4. processing;
5. case understood;
6. procedure research;
7. evidence upload;
8. missing evidence;
9. case ready;
10. draft email;
11. Ask Recourse a portal-style question;
12. generate formal letter;
13. confirm submission;
14. waiting state;
15. add rejection/response;
16. new analysis;
17. next user-controlled action.

### Flow B — missing institution

1. upload ambiguous notice;
2. Recourse asks user;
3. user answers;
4. analysis continues.

### Flow C — no verified process

1. case research finds no reliable formal route;
2. UI says so plainly;
3. Draft Email / Formal Letter / Ask Recourse remain usable.

### Flow D — changed actual submission

1. generate email;
2. user clicks submitted;
3. says they edited it;
4. paste actual version;
5. later response analysis uses actual version.

### Flow E — case chat unknown answer

User asks a portal question that case data cannot answer.

Expected:

- Recourse does not invent;
- asks user for the missing fact;
- after user responds, produces an answer.

## 6. Grounding checks

### Procedure

Material procedural guidance should have a source internally.

### Draft

Material factual claims should be grounded in evidence or explicitly depend on user assertion.

### Fabrication test

Fixture asks the AI to invent a favorable fact.

Expected: it does not.

## 7. Security tests

At minimum:

- user A cannot access user B case;
- unauthenticated case route rejected;
- Cloudinary secret never exposed to frontend;
- upload MIME/size validation;
- duplicate upload behavior;
- XSS-like document text renders safely;
- prompt-injection instruction in document is ignored;
- deleted case deletes/queues deletion of Cloudinary assets.

## 8. Rigorous visual E2E audit

This is mandatory and is more than automated assertions.

### Viewports

Inspect screenshots at:

- 1440×900
- 1024×768
- 390×844

### Screens/states

- landing hero;
- landing lower sections;
- mobile nav;
- auth;
- dashboard empty;
- dashboard with cases;
- new case;
- upload;
- processing;
- missing information;
- research found;
- no process found;
- evidence missing;
- case ready;
- Ask Recourse chat;
- email draft;
- formal letter;
- submission confirmation;
- waiting;
- response received;
- continued case;
- resolved/closed;
- Gemini/Tavily/upload error states.

### Visual checklist

Codex must inspect and fix:

- horizontal overflow;
- text clipping;
- layout jumps;
- broken z-index/sticky elements;
- illegible gradients;
- poor contrast;
- inconsistent radius/shadows;
- cramped mobile spacing;
- awkward empty space;
- bad line lengths;
- CTA ambiguity;
- inconsistent typography;
- motion that delays tasks;
- excessive cards;
- default-looking shadcn styling;
- browser console errors;
- hydration issues.

### Interaction checklist

Test:

- keyboard tab order;
- visible focus;
- Enter/Space behavior;
- forms;
- upload cancellation/retry;
- copy buttons;
- mobile menus;
- dialogs;
- letter download;
- scroll restoration;
- back navigation;
- refresh persistence.

### Awwwards bar

The reviewer should experience:

> "This looks like a premium designed product."

But the UX should remain obvious without explanation.

## 9. Completion gate

All must pass:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

If live credentials exist, also run provider smoke tests.

Then manually complete the main flow.

Do not declare completion with known broken visual states.
