import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { NotificationsService } from './notifications.service.js';

export class UpdateNotificationDto {
  @IsOptional() @IsString() @IsNotEmpty({ message: 'متن اعلان را وارد کنید' }) @MaxLength(300)
  text?: string;

  @IsOptional() @IsBoolean()
  on?: boolean;
}

@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get() list() { return this.notifications.list(); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateNotificationDto) { return this.notifications.update(id, dto); }
}
