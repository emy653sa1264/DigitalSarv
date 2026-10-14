import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, RequirePermissions, Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { PermissionsGuard } from '../../common/auth/permissions.guard.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { DispatchService } from './dispatch.service.js';
import { DispatchQueryDto, EligibilityQueryDto } from './dto/dispatch.dto.js';

/** «مرکز تخصیص سفارش» (contract v4.2 «Admin endpoints»). Provider prices and fees need `provider_price_view` too (Q18). */
@Controller('admin/dispatch')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('admin')
export class AdminDispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @Get('jobs') @RequirePermissions('dispatch_view')
  list(@Query() q: DispatchQueryDto) { return this.dispatch.list(q); }

  @Get('jobs/:id') @RequirePermissions('dispatch_view')
  async get(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.dispatch.detail(id, await this.dispatch.canSeeProviderPrices(user.id)); }

  @Get('jobs/:id/eligibility') @RequirePermissions('dispatch_view')
  async eligibility(@Param('id') id: string, @Query() q: EligibilityQueryDto, @CurrentUser() user: AuthUser) {
    return this.dispatch.eligibility(id, q.deliveryMethod, await this.dispatch.canSeeProviderPrices(user.id));
  }
}
