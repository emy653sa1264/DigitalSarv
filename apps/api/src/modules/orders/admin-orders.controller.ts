import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { AdminOrdersQueryDto, AssignDto, QcDto, SetStatusDto } from './dto/orders.dto.js';
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
    return this.orders.findById(id);
  }

  @Patch('orders/:id/status')
  setStatus(@Param('id') id: string, @Body() dto: SetStatusDto) {
    return this.orders.setStatus(id, dto.status);
  }

  @Patch('orders/:id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignDto) {
    return this.orders.assign(id, dto);
  }

  @Patch('orders/:id/qc')
  qc(@Param('id') id: string, @Body() dto: QcDto) {
    return this.orders.setQc(id, dto.index, dto.done);
  }

  @Get('production')
  production() {
    return this.orders.production();
  }
}
