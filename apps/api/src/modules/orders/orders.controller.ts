import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser, Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { OrderDraftDto } from './dto/orders.dto.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Auth optional: uses the caller's plan unless `planId` is given. */
  @Post('quote')
  @HttpCode(200)
  @UseGuards(OptionalJwtAuthGuard)
  quote(@Body() dto: OrderDraftDto, @CurrentUser() user?: AuthUser) {
    return this.orders.quote(dto, user);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  create(@CurrentUser() user: AuthUser, @Body() dto: OrderDraftDto) {
    return this.orders.create(user, dto);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  mine(@CurrentUser() user: AuthUser) {
    return this.orders.mine(user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.orders.getForUser(id, user);
  }

  @Post(':id/reorder')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  reorder(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.orders.reorder(id, user);
  }

  /** New gateway attempt for an unpaid (`pending_payment`) order → `{ paymentUrl }`. */
  @Post(':id/pay')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  pay(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.orders.pay(id, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.orders.cancel(id, user);
  }
}
