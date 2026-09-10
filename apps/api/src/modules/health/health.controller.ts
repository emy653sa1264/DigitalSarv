import { Controller, Get, Res } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Response } from 'express';
import type { Connection } from 'mongoose';
import { RedisService } from '../../common/redis/redis.service.js';

@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly redis: RedisService,
  ) {}

  /** Liveness: always 200 while the process serves HTTP; reports dependency state. */
  @Get()
  async check() {
    const mongo = this.connection.readyState === 1 ? 'up' : 'down';
    const redis = (await this.redis.ping()) ? 'up' : 'down';
    return { ok: mongo === 'up' && redis === 'up', mongo, redis };
  }

  /** Readiness: 503 while MongoDB or Redis is down (load balancers stop routing here). */
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Pick<Response, 'status'>) {
    const state = await this.check();
    if (!state.ok) res.status(503);
    return state;
  }
}
