import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import helmet from 'helmet';
import * as compression from 'compression';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  
  // Security
  app.use(helmet());
  app.use(compression());

  // CORS
  app.enableCors({
    origin: configService.get<string[]>('app.corsOrigin'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // Global prefix
  app.setGlobalPrefix(configService.get<string>('app.apiPrefix'));

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global rate limiting
  app.useGlobalGuards(
    new (class extends ThrottlerGuard {
      protected async handleRequest(
        context: any,
        limit: number,
        ttl: number,
      ): Promise<boolean> {
        // Custom rate limiting logic can be added here
        return super.handleRequest(context, limit, ttl);
      }
    })(),
  );

  // Swagger Documentation
  if (configService.get<string>('app.nodeEnv') !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Comment App API')
      .setDescription('Highly scalable comment application API')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Authentication endpoints')
      .addTag('comments', 'Comment management endpoints')
      .addTag('notifications', 'Notification endpoints')
      .addTag('users', 'User management endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });

    logger.log('📚 Swagger documentation available at /api/docs');
  }

  const port = configService.get<number>('port');
  await app.listen(port);

  logger.log(`🚀 Application is running on: http://localhost:${port}`);
  logger.log(`🏥 Health check available at: http://localhost:${port}/health`);
}

bootstrap().catch((error) => {
  Logger.error('❌ Error starting application', error);
  process.exit(1);
});