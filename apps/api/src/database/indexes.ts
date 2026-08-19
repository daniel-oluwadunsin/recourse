import "reflect-metadata";

import mongoose from "mongoose";

import { parseEnvironment } from "@recourse/config";

import {
  AuthToken,
  AuthTokenSchema,
} from "../modules/auth/schemas/auth-token.schema";
import {
  RefreshToken,
  RefreshTokenSchema,
} from "../modules/auth/schemas/refresh-token.schema";
import {
  AuditLog,
  AuditLogSchema,
} from "../modules/audit/schemas/audit-log.schema";
import {
  CaseEvent,
  CaseEventSchema,
} from "../modules/cases/schemas/case-event.schema";
import { Case, CaseSchema } from "../modules/cases/schemas/case.schema";
import {
  Deadline,
  DeadlineSchema,
} from "../modules/cases/schemas/deadline.schema";
import {
  Decision,
  DecisionSchema,
} from "../modules/cases/schemas/decision.schema";
import {
  Institution,
  InstitutionSchema,
} from "../modules/cases/schemas/institution.schema";
import { User, UserSchema } from "../modules/users/schemas/user.schema";
import {
  Evidence,
  EvidenceSchema,
} from "../modules/evidence/schemas/evidence.schema";
import {
  EvidenceBlock,
  EvidenceBlockSchema,
} from "../modules/evidence/schemas/evidence-block.schema";
import {
  JobFailure,
  JobFailureSchema,
} from "../modules/queues/schemas/job-failure.schema";
import {
  WorkflowDispatch,
  WorkflowDispatchSchema,
} from "../modules/queues/schemas/workflow-dispatch.schema";
import { AIRun, AIRunSchema } from "../modules/ai/schemas/ai-run.schema";
import {
  RetrievalRun,
  RetrievalRunSchema,
} from "../modules/retrieval/schemas/retrieval-run.schema";
import {
  SourceSnapshot,
  SourceSnapshotSchema,
} from "../modules/retrieval/schemas/source-snapshot.schema";
import {
  Procedure,
  ProcedureSchema,
} from "../modules/procedure/schemas/procedure.schema";
import {
  ProcedureVersion,
  ProcedureVersionSchema,
} from "../modules/procedure/schemas/procedure-version.schema";
import {
  ProceduralClaim,
  ProceduralClaimSchema,
} from "../modules/procedure/schemas/procedural-claim.schema";
import {
  ProcedureSourceChunk,
  ProcedureSourceChunkSchema,
} from "../modules/procedure/schemas/procedure-source-chunk.schema";
import {
  Claim,
  ClaimSchema,
} from "../modules/intelligence/schemas/claim.schema";
import {
  Contradiction,
  ContradictionSchema,
} from "../modules/intelligence/schemas/contradiction.schema";
import {
  EvidenceRequirementMatch,
  EvidenceRequirementMatchSchema,
} from "../modules/intelligence/schemas/evidence-requirement-match.schema";
import {
  GraphEdge,
  GraphEdgeSchema,
} from "../modules/intelligence/schemas/graph-edge.schema";
import {
  GraphNode,
  GraphNodeSchema,
} from "../modules/intelligence/schemas/graph-node.schema";
import {
  TimelineEvent,
  TimelineEventSchema,
} from "../modules/intelligence/schemas/timeline-event.schema";
import { Appeal, AppealSchema } from "../modules/appeals/schemas/appeal.schema";
import {
  CaseAction,
  CaseActionSchema,
} from "../modules/appeals/schemas/case-action.schema";
import {
  CaseEmailToken,
  CaseEmailTokenSchema,
} from "../modules/email/schemas/case-email-token.schema";
import {
  CaseResponse,
  CaseResponseSchema,
} from "../modules/email/schemas/case-response.schema";
import {
  InboundEmail,
  InboundEmailSchema,
} from "../modules/email/schemas/inbound-email.schema";
import {
  Notification,
  NotificationSchema,
} from "../modules/email/schemas/notification.schema";
import {
  OutboundEmail,
  OutboundEmailSchema,
} from "../modules/email/schemas/outbound-email.schema";

const environment = parseEnvironment();

async function createAndVerifyIndexes(): Promise<void> {
  const uri = environment.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI must be set before running db:indexes");
  }

  const connection = await mongoose
    .createConnection(uri, {
      autoIndex: false,
      connectTimeoutMS: environment.MONGODB_CONNECT_TIMEOUT_MS,
      dbName: environment.MONGODB_DATABASE,
      maxPoolSize: environment.MONGODB_MAX_POOL_SIZE,
      minPoolSize: environment.MONGODB_MIN_POOL_SIZE,
      serverSelectionTimeoutMS: environment.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
      socketTimeoutMS: environment.MONGODB_SOCKET_TIMEOUT_MS,
    })
    .asPromise();

  try {
    const definitions = [
      { collection: "cases", name: Case.name, schema: CaseSchema },
      {
        collection: "decisions",
        name: Decision.name,
        schema: DecisionSchema,
      },
      {
        collection: "case_events",
        name: CaseEvent.name,
        schema: CaseEventSchema,
      },
      {
        collection: "institutions",
        name: Institution.name,
        schema: InstitutionSchema,
      },
      {
        collection: "deadlines",
        name: Deadline.name,
        schema: DeadlineSchema,
      },
      { collection: "users", name: User.name, schema: UserSchema },
      { collection: "evidence", name: Evidence.name, schema: EvidenceSchema },
      {
        collection: "evidence_blocks",
        name: EvidenceBlock.name,
        schema: EvidenceBlockSchema,
      },
      {
        collection: "refresh_tokens",
        name: RefreshToken.name,
        schema: RefreshTokenSchema,
      },
      {
        collection: "auth_tokens",
        name: AuthToken.name,
        schema: AuthTokenSchema,
      },
      {
        collection: "audit_logs",
        name: AuditLog.name,
        schema: AuditLogSchema,
      },
      {
        collection: "workflow_dispatches",
        name: WorkflowDispatch.name,
        schema: WorkflowDispatchSchema,
      },
      {
        collection: "job_failures",
        name: JobFailure.name,
        schema: JobFailureSchema,
      },
      { collection: "ai_runs", name: AIRun.name, schema: AIRunSchema },
      {
        collection: "retrieval_runs",
        name: RetrievalRun.name,
        schema: RetrievalRunSchema,
      },
      {
        collection: "source_snapshots",
        name: SourceSnapshot.name,
        schema: SourceSnapshotSchema,
      },
      {
        collection: "procedures",
        name: Procedure.name,
        schema: ProcedureSchema,
      },
      {
        collection: "procedure_versions",
        name: ProcedureVersion.name,
        schema: ProcedureVersionSchema,
      },
      {
        collection: "procedural_claims",
        name: ProceduralClaim.name,
        schema: ProceduralClaimSchema,
      },
      {
        collection: "procedure_source_chunks",
        name: ProcedureSourceChunk.name,
        schema: ProcedureSourceChunkSchema,
      },
      { collection: "claims", name: Claim.name, schema: ClaimSchema },
      {
        collection: "timeline_events",
        name: TimelineEvent.name,
        schema: TimelineEventSchema,
      },
      {
        collection: "contradictions",
        name: Contradiction.name,
        schema: ContradictionSchema,
      },
      {
        collection: "evidence_requirement_matches",
        name: EvidenceRequirementMatch.name,
        schema: EvidenceRequirementMatchSchema,
      },
      {
        collection: "graph_nodes",
        name: GraphNode.name,
        schema: GraphNodeSchema,
      },
      {
        collection: "graph_edges",
        name: GraphEdge.name,
        schema: GraphEdgeSchema,
      },
      { collection: "appeals", name: Appeal.name, schema: AppealSchema },
      {
        collection: "case_actions",
        name: CaseAction.name,
        schema: CaseActionSchema,
      },
      {
        collection: "case_email_tokens",
        name: CaseEmailToken.name,
        schema: CaseEmailTokenSchema,
      },
      {
        collection: "case_responses",
        name: CaseResponse.name,
        schema: CaseResponseSchema,
      },
      {
        collection: "inbound_emails",
        name: InboundEmail.name,
        schema: InboundEmailSchema,
      },
      {
        collection: "notifications",
        name: Notification.name,
        schema: NotificationSchema,
      },
      {
        collection: "outbound_emails",
        name: OutboundEmail.name,
        schema: OutboundEmailSchema,
      },
    ];

    for (const definition of definitions) {
      const model = connection.model(
        definition.name,
        definition.schema,
        definition.collection,
      );
      await model.createIndexes();

      const actualIndexes = await model.collection.listIndexes().toArray();
      const actualNames = new Set(actualIndexes.map((index) => index.name));
      const expectedNames = definition.schema
        .indexes()
        .map(([, options]) => options.name)
        .filter((name): name is string => Boolean(name));
      const missingNames = expectedNames.filter(
        (name) => !actualNames.has(name),
      );

      if (missingNames.length > 0) {
        throw new Error(
          `${definition.collection} is missing indexes: ${missingNames.join(", ")}`,
        );
      }

      process.stdout.write(
        `${definition.collection}: verified ${expectedNames.length} indexes\n`,
      );
    }
  } finally {
    await connection.close();
  }
}

void createAndVerifyIndexes().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
