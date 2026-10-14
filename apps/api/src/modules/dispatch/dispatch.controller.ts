import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { RequirePermissions, Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { PermissionsGuard } from '../../common/auth/permissions.guard.js';
import { DispatchService } from './dispatch.service.js';
import { DispatchQueryDto, EligibilityQueryDto } from './dto/dispatch.dto.js';

/** «مرکز تخصیص سفارش» (contract v4.2 «Admin endpoints»). */
@Controller('admin/dispatch')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('admin')
export class AdminDispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @Get('jobs') @RequirePermissions('dispatch_view')
  list(@Query() q: DispatchQueryDto) { return this.dispatch.list(q); }

  @Get('jobs/:id') @RequirePermissions('dispatch_view')
  get(@Param('id') id: string) { return this.dispatch.detail(id); }

  @Get('jobs/:id/eligibility') @RequirePermissions('dispatch_view')
  eligibility(@Param('id') id: string, @Query() q: EligibilityQueryDto) { return this.dispatch.eligibility(id, q.deliveryMethod); }
}
