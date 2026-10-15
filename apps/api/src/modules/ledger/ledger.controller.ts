import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser, RequirePermissions, Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { PermissionsGuard } from '../../common/auth/permissions.guard.js';
import { PageQueryDto } from '../../common/utils/pagination.js';
import { AdjustmentDto, CompensationDto, LedgerEntriesQueryDto, ResolvePendingDto, StatementQueryDto } from './dto/ledger.dto.js';
import { LedgerActionsService } from './ledger-actions.service.js';
import { LedgerReadsService } from './ledger-reads.service.js';

/** «تسویه مجریان» (contract v4.3 «Admin endpoints»; D33 permissions). */
@Controller('admin/ledger')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('admin')
export class AdminLedgerController {
  constructor(private readonly reads: LedgerReadsService, private readonly actions: LedgerActionsService) {}

  @Get('balances') @RequirePermissions('ledger_view')
  balances(@Query() q: PageQueryDto) { return this.reads.balances(q); }

  /** The full Sheba is shown only to `payout_record`; `ledger_view` alone sees it masked. */
  @Get('providers/:id') @RequirePermissions('ledger_view')
  async provider(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.reads.provider(id, user ? await this.reads.canSeeFullBank(user.id) : false);
  }

  @Get('providers/:id/entries') @RequirePermissions('ledger_view')
  entries(@Param('id') id: string, @Query() q: LedgerEntriesQueryDto) { return this.reads.entries(id, q); }

  @Get('providers/:id/statement') @RequirePermissions('ledger_view')
  statement(@Param('id') id: string, @Query() q: StatementQueryDto) { return this.reads.statement(id, q.cutoff); }

  @Get('pending') @RequirePermissions('ledger_view')
  pending(@Query() q: PageQueryDto) { return this.reads.pending(q); }

  @Post('entries/:id/resolve') @HttpCode(200) @RequirePermissions('ledger_adjust')
  resolve(@Param('id') id: string, @Body() dto: ResolvePendingDto, @CurrentUser() user: AuthUser) { return this.actions.resolve(id, dto, user.id); }

  @Get('compensation') @RequirePermissions('ledger_view')
  compensation(@Query() q: PageQueryDto) { return this.actions.compensationQueue(q); }

  @Post('compensation') @RequirePermissions('ledger_adjust')
  decideCompensation(@Body() dto: CompensationDto, @CurrentUser() user: AuthUser) { return this.actions.decideCompensation(dto, user.id); }

  @Post('adjustments') @RequirePermissions('ledger_adjust')
  adjust(@Body() dto: AdjustmentDto, @CurrentUser() user: AuthUser) { return this.actions.adjust(dto, user.id); }
}
