import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AppModule } from '../apps/api/src/app.module';
import { AppExceptionFilter } from '../apps/api/src/common';
import { Environment } from '../apps/api/src/config';
import { CloudinaryService } from '../apps/api/src/documents.providers';
import { GeminiService } from '../apps/api/src/gemini.service';
import { ResearchService } from '../apps/api/src/research.service';
import {
  fakeCloudinary,
  fakeGemini,
  fakeResearch,
} from '../apps/api/src/testing/fakes';

async function main(): Promise<void> {
  const mongo = await MongoMemoryServer.create();
  const environment = new Environment({
    NODE_ENV: 'test',
    MONGODB_URI: mongo.getUri(),
    MONGODB_DB_NAME: 'recourse_e2e',
    JWT_ACCESS_SECRET: 'e'.repeat(32),
    JWT_REFRESH_SECRET: 'r'.repeat(32),
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '30d',
    PORT: 4000,
    WEB_URL: 'http://127.0.0.1:3000',
  });
  const testingModule = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Environment)
    .useValue(environment)
    .overrideProvider(GeminiService)
    .useValue(fakeGemini)
    .overrideProvider(ResearchService)
    .useValue(fakeResearch)
    .overrideProvider(CloudinaryService)
    .useValue(fakeCloudinary)
    .compile();
  const application = testingModule.createNestApplication();
  application.setGlobalPrefix('api/v1');
  application.use(cookieParser());
  application.enableCors({
    origin: environment.WEB_URL,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
  });
  application.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  application.useGlobalFilters(new AppExceptionFilter());
  await application.listen(4000, '127.0.0.1');
  async function stop(): Promise<void> {
    await application.close();
    await mongo.stop();
    process.exit(0);
  }
  process.on('SIGTERM', () => {
    void stop();
  });
  process.on('SIGINT', () => {
    void stop();
  });
}

void main();
