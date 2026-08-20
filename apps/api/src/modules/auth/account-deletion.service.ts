import {
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import { Connection, Model } from "mongoose";

import { Case } from "../cases/schemas/case.schema";
import { CasesService } from "../cases/cases.service";
import {
  AuditEventType,
  AuditOutcome,
} from "../audit/schemas/audit-log.schema";
import { AuditLogService } from "../audit/audit.service";
import { User, UserStatus } from "../users/schemas/user.schema";
import { AuthTokenService } from "./token.service";
import { PasswordService } from "./password.service";

const caseCollections = [
  "decisions",
  "case_events",
  "deadlines",
  "evidence",
  "evidence_blocks",
  "workflow_dispatches",
  "job_failures",
  "ai_runs",
  "retrieval_runs",
  "appeals",
  "case_actions",
  "claims",
  "contradictions",
  "evidence_requirement_matches",
  "graph_edges",
  "graph_nodes",
  "timeline_events",
  "case_responses",
  "inbound_emails",
  "notifications",
  "outbound_emails",
  "case_email_tokens",
] as const;

@Injectable()
export class AccountDeletionService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    @Inject(forwardRef(() => CasesService))
    private readonly cases: CasesService,
    private readonly tokens: AuthTokenService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditLogService,
  ) {}

  async deleteAccount(
    userId: string,
    password: string,
    context: { requestId?: string; correlationId?: string },
  ): Promise<void> {
    const user = await this.userModel
      .findOne({ _id: userId, status: UserStatus.ACTIVE })
      .select("+passwordHash")
      .exec();
    if (!user) throw new NotFoundException("Account not found.");

    if (!(await this.passwords.verify(password, user.passwordHash))) {
      await this.audit.record(
        AuditEventType.ACCOUNT_DELETION_FAILED,
        { ...context, userId },
        AuditOutcome.FAILURE,
        { action: "delete_account" },
        "REAUTHENTICATION_FAILED",
      );
      throw new UnauthorizedException(
        "Account deletion requires re-authentication.",
      );
    }

    await this.userModel
      .updateOne(
        { _id: user._id, status: UserStatus.ACTIVE },
        { $set: { status: UserStatus.DELETION_PENDING } },
      )
      .exec();

    try {
      const cases = await this.caseModel
        .find({ ownerId: user._id })
        .select({ _id: 1 })
        .exec();
      const caseIds = cases.map((item) => item._id);
      for (const caseDocument of cases) {
        await this.cases.remove(userId, caseDocument._id.toString(), {
          actorId: userId,
          actorType: "USER",
          correlationId: context.correlationId,
        });
      }

      const database = this.connection.db;
      if (!database) {
        throw new Error("Database is unavailable during account deletion.");
      }
      if (caseIds.length > 0) {
        for (const collectionName of caseCollections) {
          await database.collection(collectionName).deleteMany({
            caseId: { $in: caseIds },
          });
        }
      }

      await database
        .collection("notifications")
        .deleteMany({ ownerId: user._id });
      await database
        .collection("outbound_emails")
        .deleteMany({ ownerId: user._id });
      await database
        .collection("refresh_tokens")
        .deleteMany({ userId: user._id });
      await database.collection("auth_tokens").deleteMany({ userId: user._id });
      await this.userModel
        .deleteOne({ _id: user._id, status: UserStatus.DELETION_PENDING })
        .exec();

      await this.audit.record(
        AuditEventType.ACCOUNT_DELETED,
        { ...context, userId },
        AuditOutcome.SUCCESS,
        { caseCount: caseIds.length },
      );
    } catch (error: unknown) {
      // Keep the account locked if cleanup was interrupted. This prevents a
      // partially deleted account from issuing new private data or actions.
      await this.tokens.revokeAllForUser(userId);
      throw error;
    }
  }
}
