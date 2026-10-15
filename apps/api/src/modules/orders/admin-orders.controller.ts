import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser, Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { AdminOrdersQueryDto, AssignDto, QcDto, SetStatusDto } from './dto/orders.dto.js';
import { adminOrderJson } from './order-helpers.js';
import { OrdersService } from './orders.service.js';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get('orders')
  list(@Query() q: AdminOrdersQueryDto) {
    return this.orders.adminList(q);
  }

  @Get('orders/:id')
  get(@Param('id') id: string) {
    return this.orders.findById(id).then(adminOrderJson);
  }

  @Patch('orders/:id/status')
  setStatus(@Param('id') id: string, @Body() dto: SetStatusDto, @CurrentUser() user: AuthUser) {
    const confirm = { confirmCashCollected: dto.confirmCashCollected === true, ...(dto.expectedCash !== undefined ? { expectedCash: dto.expectedCash } : {}) };
    return this.orders.setStatus(id, dto.status, user.id, confirm).then(adminOrderJson);
  }

  @Patch('orders/:id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignDto, @CurrentUser() user: AuthUser) {
    return this.orders.assign(id, dto, user.id).then(adminOrderJson);
  }

  @Patch('orders/:id/qc')
  qc(@Param('id') id: string, @Body() dto: QcDto) {
    return this.orders.setQc(id, dto.index, dto.done).then(adminOrderJson);
  }

  @Get('production')
  production() {
    return this.orders.production();
  }
}
