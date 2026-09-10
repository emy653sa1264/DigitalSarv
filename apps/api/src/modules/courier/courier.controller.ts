import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser, Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { CourierService } from './courier.service.js';
import { CreateCourierDto, UpdateCourierDto, VerifyPickupDto } from './dto/courier.dto.js';

@Controller('courier')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('courier')
export class CourierController {
  constructor(private readonly courier: CourierService) {}

  @Get('me') me(@CurrentUser() user: AuthUser) { return this.courier.me(user); }

  @Get('tasks') tasks(@CurrentUser() user: AuthUser) { return this.courier.tasks(user); }

  @Post('orders/:id/verify') @HttpCode(200)
  verify(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VerifyPickupDto) {
    return this.courier.verify(user, id, dto);
  }

  @Post('orders/:id/delivered') @HttpCode(200)
  delivered(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.courier.delivered(user, id);
  }

  @Post('shift/end') @HttpCode(200)
  endShift(@CurrentUser() user: AuthUser) { return this.courier.endShift(user); }
}

@Controller('admin/couriers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminCouriersController {
  constructor(private readonly courier: CourierService) {}

  @Get() list() { return this.courier.adminList(); }
  @Post() create(@Body() dto: CreateCourierDto) { return this.courier.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateCourierDto) { return this.courier.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.courier.remove(id); }
}
