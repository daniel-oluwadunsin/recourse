import type { CaseStatus } from '@recourse/shared';

export interface User {
  id: string;
  email: string;
  hasAiConsent: boolean;
}
export interface ApiFailure {
  code: string;
  message: string;
  retryable: boolean;
}
export interface CaseFile {
  id: string;
  purpose: string;
  filename: string;
  mimeType: string;
  size: number;
  processingStatus: string;
  extraction: unknown;
  error: ApiFailure | null;
  createdAt: string;
}
export interface CaseItem {
  id: string;
  title: string;
  status: CaseStatus;
  decisionText: string;
  classification: null | {
    institution: string | null;
    decision: string;
    statedReason: string | null;
    summary: string;
    desiredOutcome: string | null;
    jurisdiction: string | null;
    decisionDate: string | null;
    highStakes: boolean;
    highStakesReason: string | null;
    criticalUnknowns: Array<{ field: string; questionForUser: string }>;
  };
  clarifications: Array<{
    field: string;
    answer: string;
    source: string;
    createdAt: string;
  }>;
  research: null | {
    procedure: {
      status: string;
      summary: string;
      procedureAvailable: boolean;
      deadline: string | null;
      steps: string[];
      evidenceGuidance: string[];
      uncertainty: string | null;
      nextRoute: string | null;
    };
    sources: Array<{
      id: string;
      title: string;
      url: string;
      domain: string;
      excerpt: string;
      authority: string;
    }>;
    researchedAt: string;
  };
  analysis: null | {
    summary: string;
    usefulEvidence: Array<{
      documentId: string;
      title: string;
      explanation: string;
    }>;
    missingEvidence: Array<{
      name: string;
      whyItMatters: string;
      isOfficiallyRequired: boolean | null;
    }>;
    contradictions: Array<{
      description: string;
      documentIds: string[];
      needsUserClarification: boolean;
      questionForUser: string | null;
    }>;
    timeline: Array<{ date: string | null; event: string }>;
    readiness: string;
    recommendation: string;
  };
  drafts: {
    email: Array<{
      id: string;
      subject: string;
      body: string;
      suggestedAttachments: Array<{ documentId: string; reason: string }>;
      unresolvedFacts: string[];
      createdAt: string;
    }>;
    letter: Array<{
      id: string;
      sender: string;
      recipient: string;
      date: string;
      reference: string | null;
      subject: string;
      salutation: string;
      paragraphs: string[];
      closing: string;
      signatory: string;
      suggestedAttachments: string[];
      unresolvedFacts: string[];
      createdAt: string;
    }>;
  };
  submission: null | Record<string, unknown>;
  responses: Array<{
    id: string;
    text: string;
    documentIds: string[];
    receivedAt: string;
    analysis: null | {
      outcome: string;
      responseSummary: string;
      reasonGiven: string | null;
      changedReasoning: string | null;
      pointsAddressed: string[];
      pointsNotAddressed: string[];
      newRequests: string[];
      anotherRouteLikely: boolean;
      recommendation: string;
    };
  }>;
  processing: { status: string; operation?: string; error?: ApiFailure };
  activity: Array<{ id?: string; type: string; label: string; at: string }>;
  deletion: null | { status: string; error?: ApiFailure };
  createdAt: string;
  updatedAt: string;
}
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: null | {
    needsFact?: boolean;
    followUpQuestion?: string | null;
    referencedSourceIds?: string[];
  };
  createdAt: string;
}
