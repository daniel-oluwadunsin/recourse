import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { createHash, randomBytes } from "node:crypto";
import { Model, Types } from "mongoose";

import { type EnvironmentConfig } from "@recourse/config";

import { Case } from "../cases/schemas/case.schema";
import { CaseEmailToken } from "./schemas/case-email-token.schema";

@Injectable()
export class CaseEmailTokenService {
  constructor(
    @InjectModel(CaseEmailToken.name)
    private readonly tokenModel: Model<CaseEmailToken>,
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    private readonly config: ConfigService<EnvironmentConfig>,
  ) {}

  async create(ownerId: string, caseId: string): Promise<string> {
    if (!Types.ObjectId.isValid(ownerId) || !Types.ObjectId.isValid(caseId)) {
      throw new NotFoundException("Case not found.");
    }
    const activeCase = await this.caseModel
      .findOne({
        _id: new Types.ObjectId(caseId),
        deletedAt: null,
        ownerId: new Types.ObjectId(ownerId),
      })
      .select({ _id: 1 })
      .exec();
    if (!activeCase) throw new NotFoundException("Case not found.");
    const address = this.config.get("GMAIL_EMAIL");
    if (!address?.includes("@")) {
      throw new NotFoundException(
        "A configured Gmail address is required for case reply routing.",
      );
    }
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
    const opaqueAddress = `case+${token}@${address.split("@")[1]}`;
    await this.tokenModel.create({
      active: true,
      caseId: new Types.ObjectId(caseId),
      expiresAt,
      opaqueAddress,
      ownerId: new Types.ObjectId(ownerId),
      tokenHash: this.hash(token),
    });
    return opaqueAddress;
  }

  async resolve(addresses: string[]): Promise<{
    caseId: string;
    ownerId: string;
  } | null> {
    for (const address of addresses) {
      const match = /^case\+([a-z0-9_-]{20,})@/iu.exec(address.trim());
      if (!match?.[1]) continue;
      const token = await this.tokenModel
        .findOne({
          active: true,
          expiresAt: { $gt: new Date() },
          tokenHash: this.hash(match[1]),
        })
        .select({ caseId: 1, ownerId: 1 })
        .exec();
      if (token) {
        return {
          caseId: token.caseId.toString(),
          ownerId: token.ownerId.toString(),
        };
      }
    }
    return null;
  }

  private hash(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }
}
