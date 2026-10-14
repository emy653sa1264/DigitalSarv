import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser, Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { CurrentProvider, ProviderScopeGuard } from '../centers/provider-scope.guard.js';
import { ProviderHistoryQueryDto, ProviderPricesQueryDto, SubmitProviderPriceDto } from './dto/price-book.dto.js';
import { PriceBookService } from './price-book.service.js';

/** «قیمت‌های من» in the provider app — always scoped to the caller's provider (never a URL/body id). */
@Controller('provider/prices')
@UseGuards(JwtAuthGuard, RolesGuard, ProviderScopeGuard)
@Roles('provider')
export class ProviderPricesController {
  constructor(private readonly book: PriceBookService) {}

  @Get() list(@CurrentProvider() providerId: string, @Query() q: ProviderPricesQueryDto, @CurrentUser() user: AuthUser) {
    return this.book.providerPrices(providerId, q.service, user.id);
  }

  @Get('history') history(@CurrentProvider() providerId: string, @Query() q: ProviderHistoryQueryDto, @CurrentUser() user: AuthUser) {
    return this.book.providerHistory(providerId, q.comboKey, user.id);
  }

  @Post() submit(@CurrentProvider() providerId: string, @Body() dto: SubmitProviderPriceDto, @CurrentUser() user: AuthUser) {
    return this.book.submit(providerId, dto, user.id);
  }
}
