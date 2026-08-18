import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import {
  queueNameValues,
  queueRetryCategoryValues,
  type QueueName,
  type QueueRetryCategory,
} from "@recourse/contracts";

@Schema({
  collection: "job_failures",
  timestamps: { createdAt: true, updatedAt: false },
})
export class JobFailure {
  @Prop({ enum: [...queueNameValues], required: true, type: String })
  queue!: QueueName;

  @Prop({ required: true, type: String })
  jobId!: string;

  @Prop({ required: true, type: String })
  jobName!: string;

  @Prop({ enum: [...queueRetryCategoryValues], required: true, type: String })
  category!: QueueRetryCategory;

  @Prop({ required: true, type: String })
  code!: string;

  @Prop({ required: true, maxlength: 500, type: String })
  message!: string;

  @Prop({ required: true, min: 0, type: Number })
  attemptsMade!: number;

  @Prop({ default: null, ref: "Case", type: SchemaTypes.ObjectId })
  caseId!: Types.ObjectId | null;

  @Prop({ default: null, ref: "Evidence", type: SchemaTypes.ObjectId })
  evidenceId!: Types.ObjectId | null;

  @Prop({ default: null, type: String })
  correlationId!: string | null;

  createdAt!: Date;
}

export type JobFailureDocument = HydratedDocument<JobFailure>;

export const JobFailureSchema = SchemaFactory.createForClass(JobFailure);

JobFailureSchema.index(
  { queue: 1, jobId: 1, attemptsMade: 1 },
  { name: "job_failures_job_attempt_unique", unique: true },
);
JobFailureSchema.index(
  { createdAt: -1 },
  { name: "job_failures_created_desc" },
);
JobFailureSchema.index(
  { category: 1, createdAt: -1 },
  { name: "job_failures_category_created" },
);
