import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser, Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { ORDER_STATUSES, type OrderStatus } from '../../common/constants.js';
import { PageQueryDto } from '../../common/utils/pagination.js';
import { NotificationsService } from './notifications.service.js';

const textMsg = { message: 'متن اعلان را وارد کنید' };

export class CreateNotificationDto {
  @IsIn(ORDER_STATUSES, { message: 'وضعیت سفارش معتبر نیست' })
  event: OrderStatus;

  @IsString(textMsg) @IsNotEmpty(textMsg) @MaxLength(300, { message: 'متن اعلان حداکثر ۳۰۰ کاراکتر است' })
  text: string;

  @IsOptional() @IsBoolean()
  on?: boolean;
}

export class UpdateNotificationDto {
  @IsOptional() @IsString(textMsg) @IsNotEmpty(textMsg) @MaxLength(300, { message: 'متن اعلان حداکثر ۳۰۰ کاراکتر است' })
  text?: string;

  @IsOptional() @IsBoolean()
  on?: boolean;
}

export class ReadNotificationsDto {
  /** Omitted = all. */
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsMongoId({ each: true, message: 'شناسه اعلان معتبر نیست' })
  ids?: string[];
}

const subMsg = { message: 'اشتراک اعلان مرورگر معتبر نیست' };

export class PushKeysDto {
  @IsString(subMsg) @IsNotEmpty(subMsg) @MaxLength(200, subMsg)
  p256dh: string;

  @IsString(subMsg) @IsNotEmpty(subMsg) @MaxLength(100, subMsg)
  auth: string;
}

export class PushSubscribeDto {
  @IsString(subMsg) @Matches(/^https:\/\/\S+$/, subMsg) @MaxLength(1000, subMsg)
  endpoint: string;

  @IsObject(subMsg) @ValidateNested() @Type(() => PushKeysDto)
  keys: PushKeysDto;
}

export class PushUnsubscribeDto {
  @IsString(subMsg) @IsNotEmpty(subMsg) @MaxLength(1000, subMsg)
  endpoint: string;
}

/** Admin notification templates (channel always `push`; SMS is only for the login OTP). */
@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get() list() { return this.notifications.list(); }
  @Post() create(@Body() dto: CreateNotificationDto) { return this.notifications.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateNotificationDto) { return this.notifications.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.notifications.remove(id); }
}

/** Customer inbox and Web Push subscriptions (v3.3). */
@Controller('notifications')
export class CustomerNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('customer')
  mine(@CurrentUser() user: AuthUser, @Query() q: PageQueryDto) {
    return this.notifications.mine(user.id, q);
  }

  @Post('mine/read') @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('customer')
  read(@CurrentUser() user: AuthUser, @Body() dto: ReadNotificationsDto) {
    return this.notifications.markRead(user.id, dto.ids);
  }

  /** Public: the VAPID public key (`null` = web push is off). */
  @Get('push/key')
  key() {
    return this.notifications.publicKey();
  }

  @Post('push/subscribe') @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('customer')
  subscribe(@CurrentUser() user: AuthUser, @Body() dto: PushSubscribeDto) {
    return this.notifications.subscribe(user.id, dto);
  }

  @Post('push/unsubscribe') @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('customer')
  unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: PushUnsubscribeDto) {
    return this.notifications.unsubscribe(user.id, dto.endpoint);
  }
}
