import { Module } from "@nestjs/common";

import { OwnershipAuthorizationService } from "./ownership.service";

@Module({
  exports: [OwnershipAuthorizationService],
  providers: [OwnershipAuthorizationService],
})
export class AuthorizationModule {}
