import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { MongooseModule } from "@nestjs/mongoose";

import { type EnvironmentConfig } from "@recourse/config";

import { AuditModule } from "../audit/audit.module";
import { UsersModule } from "../users/users.module";
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
  exports: [AccessTokenGuard, AuthService, JwtModule, StaffGuard, UsersModule],
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
    ]),
    AuditModule,
    UsersModule,
  ],
  providers: [
    AuthService,
    AuthTokenService,
    PasswordService,
    AccessTokenGuard,
    StaffGuard,
  ],
})
export class AuthModule {}
