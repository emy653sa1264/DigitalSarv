import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { createValidationPipe } from './common/validation.js';
import type { AppConfig } from './config/configuration.js';

async function bootstrap() {
  // bodyParser off: re-registered below with an explicit size limit
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const config = app.get(ConfigService).getOrThrow<AppConfig>('app');

  // one reverse proxy (nginx) in front: req.ip / throttling use the real client address
  app.set('trust proxy', 1);
  app.use(
    helmet({
      // uploads (images) may be embedded by the web app on a sibling origin
      crossOriginResourcePolicy: { policy: 'same-site' },
      contentSecurityPolicy: {
        // the mock gateway page is served over plain http in dev
        directives: { upgradeInsecureRequests: config.isProduction ? [] : null },
      },
    }),
  );
  app.use(compression());
  app.useBodyParser('json', { limit: config.bodyLimit });
  app.useBodyParser('urlencoded', { extended: true, limit: config.bodyLimit });

  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.corsOrigin, credentials: true });
  app.useGlobalPipes(createValidationPipe());
  app.enableShutdownHooks();

  await app.listen(config.port);
  Logger.log(`API listening on http://localhost:${config.port}/api (${config.nodeEnv})`, 'Bootstrap');
  if (config.isProduction && config.sms.driver === 'log') {
    Logger.warn('SMS_DRIVER=log in production: OTP codes are written to the log instead of being sent', 'Bootstrap');
  }
}
await bootstrap();
