import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, RequirePermissions, Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { PermissionsGuard } from '../../common/auth/permissions.guard.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentProvider, ProviderScopeGuard } from '../centers/provider-scope.guard.js';
import { QcDto } from '../orders/dto/orders.dto.js';
import { ProviderJobsService } from './provider-jobs.service.js';
import { DispatchService } from './dispatch.service.js';
import { ProviderJobStatusDto, ProviderJobsQueryDto, RejectJobDto, AdminJobStatusDto, AssignJobDto, DeliveryChangeDto, DispatchQueryDto, EligibilityQueryDto, ReasonDto, RespondDto, UpdateJobDto } from './dto/dispatch.dto.js';

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

  @Post('jobs/:id/assign') @HttpCode(200) @RequirePermissions('dispatch_assign')
  assign(@Param('id') id: string, @Body() dto: AssignJobDto, @CurrentUser() user: AuthUser) { return this.dispatch.assign(id, dto, user.id); }

  @Post('jobs/:id/reassign') @HttpCode(200) @RequirePermissions('dispatch_reassign')
  reassign(@Param('id') id: string, @Body() dto: AssignJobDto, @CurrentUser() user: AuthUser) { return this.dispatch.reassign(id, dto, user.id); }

  @Post('jobs/:id/unassign') @HttpCode(200) @RequirePermissions('dispatch_reassign')
  unassign(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthUser) { return this.dispatch.unassign(id, dto.reason, user.id); }

  @Patch('jobs/:id/delivery') @RequirePermissions('dispatch_assign')
  delivery(@Param('id') id: string, @Body() dto: DeliveryChangeDto, @CurrentUser() user: AuthUser) { return this.dispatch.updateDelivery(id, dto, user.id); }

  @Patch('jobs/:id') @RequirePermissions('dispatch_assign')
  update(@Param('id') id: string, @Body() dto: UpdateJobDto, @CurrentUser() user: AuthUser) { return this.dispatch.update(id, dto, user.id); }

  @Post('jobs/:id/respond') @HttpCode(200) @RequirePermissions('provider_order_accept')
  respond(@Param('id') id: string, @Body() dto: RespondDto, @CurrentUser() user: AuthUser) { return this.dispatch.respond(id, dto, user.id); }

  @Post('jobs/:id/status') @HttpCode(200) @RequirePermissions('provider_order_status')
  status(@Param('id') id: string, @Body() dto: AdminJobStatusDto, @CurrentUser() user: AuthUser) { return this.dispatch.setStatus(id, dto, user.id); }
}

/** «سرو مجری» orders — provider id only from ProviderScopeGuard (never URL/body, §64). */
@Controller('provider/jobs')
@UseGuards(JwtAuthGuard, RolesGuard, ProviderScopeGuard)
@Roles('provider')
export class ProviderJobsController {
  constructor(private readonly jobs: ProviderJobsService) {}

  @Get() list(@CurrentProvider() pid: string, @Query() q: ProviderJobsQueryDto) { return this.jobs.list(pid, q); }
  @Get(':id') detail(@CurrentProvider() pid: string, @Param('id') id: string, @CurrentUser() user: AuthUser) { return this.jobs.detail(pid, id, user.id); }

  @Post(':id/accept') @HttpCode(200)
  accept(@CurrentProvider() pid: string, @Param('id') id: string, @CurrentUser() user: AuthUser) { return this.jobs.accept(pid, id, user.id); }

  @Post(':id/reject') @HttpCode(200)
  reject(@CurrentProvider() pid: string, @Param('id') id: string, @Body() dto: RejectJobDto, @CurrentUser() user: AuthUser) { return this.jobs.reject(pid, id, dto, user.id); }

  @Post(':id/status') @HttpCode(200)
  status(@CurrentProvider() pid: string, @Param('id') id: string, @Body() dto: ProviderJobStatusDto, @CurrentUser() user: AuthUser) { return this.jobs.setStatus(pid, id, dto, user.id); }

  @Patch(':id/qc')
  qc(@CurrentProvider() pid: string, @Param('id') id: string, @Body() dto: QcDto, @CurrentUser() user: AuthUser) { return this.jobs.setQc(pid, id, dto.index, dto.done, user.id); }
}
