import { ForbiddenException, Injectable } from "@nestjs/common";
import { isValidObjectId, Types } from "mongoose";

@Injectable()
export class OwnershipAuthorizationService {
  withOwnerScope<T extends Record<string, unknown>>(
    userId: string,
    filter: T = {} as T,
  ): T & { ownerId: Types.ObjectId } {
    if (!isValidObjectId(userId)) {
      throw new ForbiddenException("Resource ownership could not be verified.");
    }

    return {
      ...filter,
      ownerId: new Types.ObjectId(userId),
    };
  }

  assertOwner(ownerId: Types.ObjectId | string, userId: string): void {
    if (ownerId.toString() !== userId) {
      throw new ForbiddenException("You do not have access to this resource.");
    }
  }
}
