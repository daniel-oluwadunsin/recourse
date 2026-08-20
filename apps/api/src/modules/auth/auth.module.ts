import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { MongooseModule } from "@nestjs/mongoose";

import { type EnvironmentConfig } from "@recourse/config";

import { AuditModule } from "../audit/audit.module";
import { CasesModule } from "../cases/cases.module";
import { Case, CaseSchema } from "../cases/schemas/case.schema";
import { UsersModule } from "../users/users.module";
import { EmailModule } from "../email/email.module";
import { User, UserSchema } from "../users/schemas/user.schema";
import { AccountDeletionService } from "./account-deletion.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthToken } from "./schemas/auth-token.schema";
import { AuthTokenSchema } from "./schemas/auth-token.schema";
import { RefreshToken } from "./schemas/refresh-token.schema";
import { RefreshTokenSchema } from "./schemas/refresh-token.schema";
import { AccessTokenGuard } from "./guards/access-token.guard";
import { StaffGuard } from "./guards/staff.guard";
import { PasswordService } from "./password.service";
import { AuthTokenService } from "./token.service";

@Module({
  controllers: [AuthController],
  exports: [
    AccessTokenGuard,
    AccountDeletionService,
    AuthService,
    JwtModule,
    StaffGuard,
    UsersModule,
  ],
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentConfig>) => ({
        secret: config.getOrThrow("JWT_ACCESS_SECRET"),
      }),
    }),
    MongooseModule.forFeature([
      { name: RefreshToken.name, schema: RefreshTokenSchema },
      { name: AuthToken.name, schema: AuthTokenSchema },
      { name: User.name, schema: UserSchema },
      { name: Case.name, schema: CaseSchema },
    ]),
    AuditModule,
    forwardRef(() => EmailModule),
    forwardRef(() => CasesModule),
    UsersModule,
  ],
  providers: [
    AuthService,
    AccountDeletionService,
    AuthTokenService,
    PasswordService,
    AccessTokenGuard,
    StaffGuard,
  ],
})
export class AuthModule {}
