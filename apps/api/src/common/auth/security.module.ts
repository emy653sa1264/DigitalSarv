import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { AppConfig } from '../../config/configuration.js';
import { JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard } from './guards.js';
import { TokenVerifier } from './token-verifier.service.js';

/** JWT + guards, available to every module. */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const app = config.getOrThrow<AppConfig>('app');
        return {
          secret: app.jwtSecret,
          // jsonwebtoken accepts "7d"-style strings; its typing is a template-literal type
          signOptions: { expiresIn: app.jwtExpiresIn as unknown as number },
        };
      },
    }),
  ],
  providers: [TokenVerifier, JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard],
  exports: [JwtModule, TokenVerifier, JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard],
})
export class SecurityModule {}
