import { AppError } from '../common';

export const fakeAssets = new Map<string, Buffer>();

export const fakeCloudinary = {
  upload: async (
    bytes: Buffer,
    publicId: string,
    resourceType: 'image' | 'raw',
  ) => {
    fakeAssets.set(publicId, bytes);
    return {
      publicId,
      assetId: 'test-asset',
      resourceType,
      format: resourceType === 'raw' ? 'txt' : 'png',
      bytes: bytes.length,
      deliveryType: 'authenticated' as const,
    };
  },
  download: async (asset: { publicId: string }) =>
    fakeAssets.get(asset.publicId) ?? Buffer.alloc(0),
  delete: async (asset: { publicId: string }) => {
    fakeAssets.delete(asset.publicId);
  },
  ping: async () => true,
};

export const fakeGemini = {
  understandCase: async (input: string) => {
    if (input.toLowerCase().includes('quota pause')) {
      throw new AppError(
        'AI_QUOTA_REACHED',
        'We have reached the current AI usage limit. Nothing has been lost.',
        429,
        true,
      );
    }
    const missingInstitution =
      input.toLowerCase().includes('unknown institution') &&
      !input.includes('Northfield Council');
    const noProcess = input.includes('No Process Office');
    const contradiction = input.toLowerCase().includes('contradiction');
    return {
      institution: missingInstitution
        ? null
        : noProcess
          ? 'No Process Office'
          : 'Northfield Council',
      decision: 'A synthetic permit request was refused',
      statedReason: 'A required date was unclear',
      referenceNumber: 'SYN-1042',
      decisionDate: '2026-08-01',
      jurisdiction: 'Westborough',
      amountAffected: null,
      currency: null,
      summary: contradiction
        ? 'A contradiction in two synthetic dates needs clarification.'
        : `${missingInstitution ? 'An unknown institution' : noProcess ? 'No Process Office' : 'Northfield Council'} refused a synthetic permit request.`,
      desiredOutcome: 'reconsideration',
      criticalUnknowns: missingInstitution
        ? [
            {
              field: 'institution',
              questionForUser: 'Which institution made the decision?',
            },
          ]
        : [],
      highStakes: input.toLowerCase().includes('high stakes'),
      highStakesReason: input.toLowerCase().includes('high stakes')
        ? 'The circumstances may have serious consequences.'
        : null,
    };
  },
  extractEvidence: async ({ filename }: { filename: string }) => ({
    summary: `${filename} supports the stated date.`,
    language: 'English',
    readable: true,
    unreadableReason: null,
    facts: [
      {
        statement: 'A synthetic date is present.',
        source: 'VERIFIED_DOCUMENT',
        date: '2026-07-20',
        confidence: 'high',
      },
    ],
  }),
  analyzeCase: async (context: {
    evidence: Array<{ documentId: string }>;
    understanding?: { summary?: string };
  }) => ({
    summary: 'The decision and current process are understood.',
    usefulEvidence: context.evidence.map((document, index) => ({
      documentId: document.documentId,
      title: `Synthetic evidence ${index + 1}`,
      explanation: 'Supports the timeline.',
    })),
    missingEvidence:
      context.evidence.length === 0
        ? [
            {
              name: 'A dated supporting record',
              whyItMatters: 'It could address the reason given.',
              isOfficiallyRequired: false,
            },
          ]
        : [],
    contradictions: context.understanding?.summary
      ?.toLowerCase()
      .includes('contradiction')
      ? [
          {
            description: 'Two synthetic dates differ.',
            documentIds: [],
            needsUserClarification: true,
            questionForUser: 'Which date is correct?',
          },
        ]
      : [],
    timeline: [{ date: '2026-08-01', event: 'Decision received' }],
    readiness: context.evidence.length === 0 ? 'needs_evidence' : 'ready',
    recommendation:
      context.evidence.length === 0
        ? 'Add the dated record if you have it, or continue with the facts available.'
        : 'Prepare the response you want to submit.',
  }),
  answerCaseQuestion: async (_context: unknown, question: string) =>
    question.toLowerCase().includes('unknown fact')
      ? {
          answer: 'The case does not contain that fact.',
          caseRelated: true,
          needsFact: true,
          followUpQuestion: 'What is the missing account date?',
          referencedDocumentIds: [],
          referencedSourceIds: [],
          factsToRecord: [],
        }
      : {
          answer:
            'Explain that the dated synthetic evidence addresses the reason given. Keep the answer concise and use your own voice.',
          caseRelated: true,
          needsFact: false,
          followUpQuestion: null,
          referencedDocumentIds: [],
          referencedSourceIds: ['source-1'],
          factsToRecord: [],
        },
  draftEmail: async () => ({
    subject: 'Request for reconsideration — SYN-1042',
    body: 'I am asking you to reconsider the decision using the attached dated evidence.',
    suggestedAttachments: [],
    unresolvedFacts: [],
  }),
  draftFormalLetter: async () => ({
    sender: '[Your name and address]',
    recipient: '[Recipient name and address]',
    date: '2026-08-22',
    reference: 'SYN-1042',
    subject: 'Request for reconsideration',
    salutation: 'Dear decision maker,',
    paragraphs: [
      'I request reconsideration of the decision.',
      'The dated evidence addresses the stated concern.',
    ],
    closing: 'Yours faithfully,',
    signatory: '[Your name]',
    suggestedAttachments: ['Dated evidence'],
    unresolvedFacts: ['Your name and address', 'Recipient name and address'],
  }),
  analyzeResponse: async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return {
      outcome: 'rejected',
      responseSummary: 'The institution maintained its decision.',
      reasonGiven: 'The evidence was not accepted.',
      changedReasoning: null,
      pointsAddressed: ['The dated evidence'],
      pointsNotAddressed: ['Timing explanation'],
      newRequests: [],
      anotherRouteLikely: false,
      recommendation:
        'Ask for clarification or consider qualified help before choosing another action.',
    };
  },
};

export const fakeResearch = {
  research: async (understanding: { institution: string | null }) =>
    understanding.institution === 'No Process Office'
      ? {
          procedure: {
            status: 'NOT_FOUND',
            summary: 'No formal process could be verified.',
            procedureAvailable: false,
            deadline: null,
            steps: [],
            evidenceGuidance: [],
            nextRoute: null,
            sourceIds: [],
            uncertainty: 'No authoritative source supported a route.',
          },
          sources: [],
          researchedAt: new Date().toISOString(),
          cacheKey: 'none',
        }
      : {
          procedure: {
            status: 'VERIFIED',
            summary: 'A written reconsideration request is available.',
            procedureAvailable: true,
            deadline: 'Within 30 days of the decision',
            steps: [
              'Write to the review team',
              'Include the reference and supporting evidence',
            ],
            evidenceGuidance: ['Include dated evidence'],
            nextRoute: null,
            sourceIds: ['source-1'],
            uncertainty: null,
          },
          sources: [
            {
              id: 'source-1',
              title: 'Official review process',
              url: 'https://northfield.gov/review',
              domain: 'northfield.gov',
              excerpt: 'Synthetic official procedure fixture.',
              authority: 'official',
              accessedAt: new Date().toISOString(),
            },
          ],
          researchedAt: new Date().toISOString(),
          cacheKey: 'fixture',
        },
};
