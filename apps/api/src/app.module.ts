import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Controller, Get, Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthController, AuthService, AccessGuard } from './auth';
import { CasesController, CasesService } from './cases.service';
import { RequestIdMiddleware } from './common';
import { Environment } from './config';
import {
  CaseRecord,
  CaseSchema,
  ChatMessageRecord,
  ChatMessageSchema,
  DocumentRecord,
  DocumentSchema,
  RefreshSessionRecord,
  RefreshSessionSchema,
  ResearchCacheRecord,
  ResearchCacheSchema,
  UserRecord,
  UserSchema,
} from './database.schemas';
import { DatabaseMaintenanceService } from './database-maintenance.service';
import { DocumentsController, DocumentsService } from './documents.service';
import {
  CloudinaryService,
  DocumentExtractionService,
  LetterPdfService,
} from './documents.providers';
import { GeminiService } from './gemini.service';
import { ResearchService } from './research.service';

@Global()
@Module({ providers: [Environment], exports: [Environment] })
class EnvironmentModule {}

@Controller('health')
class HealthController {
  @Get()
  health() {
    return { ok: true };
  }
}

@Module({
  imports: [
    EnvironmentModule,
    JwtModule.register({}),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    MongooseModule.forRootAsync({
      inject: [Environment],
      useFactory: (environment: Environment) => ({
        uri: environment.MONGODB_URI,
        dbName: environment.MONGODB_DB_NAME,
        maxPoolSize: 10,
        minPoolSize: 0,
        serverSelectionTimeoutMS: 10_000,
      }),
    }),
    MongooseModule.forFeature([
      { name: UserRecord.name, schema: UserSchema },
      { name: RefreshSessionRecord.name, schema: RefreshSessionSchema },
      { name: CaseRecord.name, schema: CaseSchema },
      { name: DocumentRecord.name, schema: DocumentSchema },
      { name: ChatMessageRecord.name, schema: ChatMessageSchema },
      { name: ResearchCacheRecord.name, schema: ResearchCacheSchema },
    ]),
  ],
  controllers: [
    HealthController,
    AuthController,
    CasesController,
    DocumentsController,
  ],
  providers: [
    AccessGuard,
    AuthService,
    CasesService,
    DatabaseMaintenanceService,
    DocumentsService,
    CloudinaryService,
    DocumentExtractionService,
    LetterPdfService,
    GeminiService,
    ResearchService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
