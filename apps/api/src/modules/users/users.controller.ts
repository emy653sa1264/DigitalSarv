import { Body, Controller, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/decorators.js';
import { JwtAuthGuard } from '../../common/auth/guards.js';
import { SetPlanDto, UpdateMeDto } from './dto/users.dto.js';
import { UsersService } from './users.service.js';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.users.updateName(user.id, dto.name);
  }

  @Post('me/plan')
  setPlan(@CurrentUser() user: AuthUser, @Body() dto: SetPlanDto) {
    return this.users.setPlan(user.id, dto.planId);
  }
}
