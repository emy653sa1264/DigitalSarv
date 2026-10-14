import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, RequirePermissions, Roles } from '../../common/auth/decorators.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { PermissionsGuard } from '../../common/auth/permissions.guard.js';
import { PageQueryDto, pageParams } from '../../common/utils/pagination.js';
import { BulkApplyDto, BulkDto, CompareQueryDto, ConfirmReasonDto, CreateVersionDto, HistoryQueryDto, MatrixQueryDto, PreviewVersionDto, RangeDto, ReasonDto, UpdateRangeDto } from './dto/price-book.dto.js';
import { layerPermission } from './price-book.constants.js';
import { PriceBookService } from './price-book.service.js';

/** Reads check `<layer>_price_view` here; writes check their own per-layer permissions in the service. */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('admin')
export class AdminPriceBookController {
  constructor(private readonly book: PriceBookService) {}

  @Get('price-book')
  async matrix(@Query() q: MatrixQueryDto, @CurrentUser() user: AuthUser) {
    await this.book.assertCan(user.id, layerPermission(q.layer, 'view'));
    return this.book.matrix(q.layer, q.service, new Date(), q.providerId ?? null);
  }

  @Get('price-book/history')
  async history(@Query() q: HistoryQueryDto, @CurrentUser() user: AuthUser) {
    await this.book.assertCan(user.id, layerPermission(q.layer, 'view'));
    return this.book.history(q.layer, q.comboKey, new Date(), q.providerId ?? null);
  }

  @Get('price-book/compare') @RequirePermissions('provider_price_view', 'customer_price_view')
  compare(@Query() q: CompareQueryDto) { return this.book.compare(q.service, q.providerId); }

  @Get('price-book/audit')
  async audit(@Query() q: PageQueryDto, @CurrentUser() user: AuthUser) {
    const { page, limit } = pageParams(q);
    return this.book.auditLog(page, limit, await this.book.viewableLayers(user.id));
  }

  @Post('price-book/preview') @HttpCode(200)
  async preview(@Body() dto: PreviewVersionDto, @CurrentUser() user: AuthUser) {
    await this.book.assertCan(user.id, layerPermission(dto.layer ?? 'customer', 'view'));
    return this.book.preview(dto);
  }

  @Post('price-book/versions')
  create(@Body() dto: CreateVersionDto, @CurrentUser() user: AuthUser) { return this.book.create(dto, user.id); }

  @Post('price-book/versions/:id/publish') @HttpCode(200)
  publish(@Param('id') id: string, @Body() dto: ConfirmReasonDto, @CurrentUser() user: AuthUser) { return this.book.publish(id, dto.reason, user.id, !!dto.confirmNegativeMargin); }

  @Post('price-book/versions/:id/disable') @HttpCode(200)
  disable(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthUser) { return this.book.disable(id, dto.reason, user.id); }

  @Post('price-book/versions/:id/rollback') @HttpCode(200)
  rollback(@Param('id') id: string, @Body() dto: ConfirmReasonDto, @CurrentUser() user: AuthUser) { return this.book.rollback(id, dto.reason, user.id, !!dto.confirmNegativeMargin); }

  @Post('price-book/bulk/preview') @HttpCode(200) @RequirePermissions('customer_price_bulk_update')
  bulkPreview(@Body() dto: BulkDto) { return this.book.bulkPreview(dto); }

  @Post('price-book/bulk/apply') @HttpCode(200) @RequirePermissions('customer_price_bulk_update', 'customer_price_publish')
  bulkApply(@Body() dto: BulkApplyDto, @CurrentUser() user: AuthUser) { return this.book.bulkApply(dto, user.id); }

  @Get('binding-ranges') @RequirePermissions('customer_price_view')
  ranges() { return this.book.listRanges(); }

  @Post('binding-ranges') @RequirePermissions('customer_price_edit')
  createRange(@Body() dto: RangeDto, @CurrentUser() user: AuthUser) { return this.book.createRange(dto, user.id); }

  @Patch('binding-ranges/:id') @RequirePermissions('customer_price_edit')
  updateRange(@Param('id') id: string, @Body() dto: UpdateRangeDto, @CurrentUser() user: AuthUser) { return this.book.updateRange(id, dto, user.id); }

  @Delete('binding-ranges/:id') @RequirePermissions('customer_price_edit')
  deleteRange(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.book.deleteRange(id, user.id); }
}
