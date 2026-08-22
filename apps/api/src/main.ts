import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AppExceptionFilter } from './common';
import { Environment } from './config';

async function bootstrap(): Promise<void> {
  const application = await NestFactory.create(AppModule, { bufferLogs: true });
  const environment = application.get(Environment);
  application.setGlobalPrefix('api/v1');
  application.use(
    helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }),
  );
  application.use(cookieParser());
  application.enableCors({
    origin: environment.WEB_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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
  application.enableShutdownHooks();
  await application.listen(environment.PORT, '0.0.0.0');
}

void bootstrap();
