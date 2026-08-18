import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { isValidObjectId, Model, Types } from "mongoose";

import { queueFailureMetadataSchema } from "@recourse/contracts";

import {
  JobFailure,
  type JobFailureDocument,
} from "./schemas/job-failure.schema";
import { type QueueFailureInput } from "./queue-errors";

@Injectable()
export class JobFailureService {
  constructor(
    @InjectModel(JobFailure.name)
    private readonly jobFailureModel: Model<JobFailure>,
  ) {}

  async record(input: QueueFailureInput): Promise<void> {
    const metadata = queueFailureMetadataSchema.parse({
      attemptsMade: input.attemptsMade,
      caseId: input.caseId ?? null,
      code: input.code,
      evidenceId: input.evidenceId ?? null,
      jobId: input.jobId,
      jobName: input.jobName,
      message: input.message,
      queue: input.queue,
      category: input.category,
    });

    await this.jobFailureModel.updateOne(
      {
        attemptsMade: metadata.attemptsMade,
        jobId: metadata.jobId,
        queue: metadata.queue,
      },
      {
        $setOnInsert: {
          attemptsMade: metadata.attemptsMade,
          caseId: objectIdOrNull(metadata.caseId),
          code: metadata.code,
          correlationId: input.correlationId ?? null,
          evidenceId: objectIdOrNull(metadata.evidenceId),
          jobId: metadata.jobId,
          jobName: metadata.jobName,
          message: metadata.message,
          queue: metadata.queue,
          category: metadata.category,
        },
      },
      { upsert: true },
    );
  }

  async list(limit = 100): Promise<JobFailureDocument[]> {
    return this.jobFailureModel
      .find()
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 200))
      .exec();
  }
}

function objectIdOrNull(value: string | null): Types.ObjectId | null {
  return value && isValidObjectId(value) ? new Types.ObjectId(value) : null;
}
