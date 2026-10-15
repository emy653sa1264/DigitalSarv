import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser, RequirePermissions, Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { PermissionsGuard } from '../../common/auth/permissions.guard.js';
import { CurrentProvider, ProviderScopeGuard } from '../centers/provider-scope.guard.js';
import { AdjustmentDto, BankAccountDto, CompensationDto, LedgerEntriesQueryDto, LedgerPageQueryDto, PayoutDto, ResolvePendingDto, StatementQueryDto, VoidPayoutDto, WalletQueryDto } from './dto/ledger.dto.js';
import { LedgerActionsService } from './ledger-actions.service.js';
import { LedgerWaitingService } from './ledger-waiting.service.js';
import { LedgerReadsService } from './ledger-reads.service.js';
import { PayoutsService } from './payouts.service.js';
import { WalletService } from './wallet.service.js';

/** «تسویه مجریان» (contract v4.3 «Admin endpoints»; D33 permissions). */
@Controller('admin/ledger')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('admin')
export class AdminLedgerController {
  constructor(private readonly reads: LedgerReadsService, private readonly actions: LedgerActionsService, private readonly payouts: PayoutsService, private readonly wallet: WalletService, private readonly waitingCredits: LedgerWaitingService) {}

  @Get('balances') @RequirePermissions('ledger_view')
  balances(@Query() q: LedgerPageQueryDto) { return this.reads.balances(q); }

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
  pending(@Query() q: LedgerPageQueryDto) { return this.reads.pending(q); }

  /** S12: delivered jobs whose credit still waits after a day (unpaid order or a failing write). */
  @Get('waiting') @RequirePermissions('ledger_view')
  waiting(@Query() q: LedgerPageQueryDto) { return this.waitingCredits.waiting(q); }

  @Post('entries/:id/resolve') @HttpCode(200) @RequirePermissions('ledger_adjust')
  resolve(@Param('id') id: string, @Body() dto: ResolvePendingDto, @CurrentUser() user: AuthUser) { return this.actions.resolve(id, dto, user.id); }

  @Get('compensation') @RequirePermissions('ledger_view')
  compensation(@Query() q: LedgerPageQueryDto) { return this.actions.compensationQueue(q); }

  @Post('compensation') @RequirePermissions('ledger_adjust')
  decideCompensation(@Body() dto: CompensationDto, @CurrentUser() user: AuthUser) { return this.actions.decideCompensation(dto, user.id); }

  @Post('adjustments') @RequirePermissions('ledger_adjust')
  adjust(@Body() dto: AdjustmentDto, @CurrentUser() user: AuthUser) { return this.actions.adjust(dto, user.id); }

  @Post('payouts') @RequirePermissions('payout_record')
  recordPayout(@Body() dto: PayoutDto, @CurrentUser() user: AuthUser) { return this.payouts.record(dto, user.id); }

  @Post('payouts/:id/void') @HttpCode(200) @RequirePermissions('payout_record')
  voidPayout(@Param('id') id: string, @Body() dto: VoidPayoutDto, @CurrentUser() user: AuthUser) { return this.payouts.void(id, dto.reason, user.id); }

  @Put('providers/:id/bank') @RequirePermissions('payout_record')
  setBank(@Param('id') id: string, @Body() dto: BankAccountDto, @CurrentUser() user: AuthUser) { return this.payouts.setBank(id, dto, user.id); }

  @Get('wallet') @RequirePermissions('ledger_view')
  walletReport(@Query() q: WalletQueryDto) { return this.wallet.report(q); }

  @Get('wallet/export') @RequirePermissions('ledger_view')
  async walletExport(@Query() q: WalletQueryDto, @Res({ passthrough: true }) res: Response): Promise<string> {
    const { filename, body } = await this.wallet.csv(q);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return body;
  }
}

/** «سرو مجری» → «تسویه» (contract v4.3 «Provider endpoints»): read-only, always the caller's own provider (§64). */
@Controller('provider/ledger')
@UseGuards(JwtAuthGuard, RolesGuard, ProviderScopeGuard)
@Roles('provider')
export class ProviderLedgerController {
  constructor(private readonly reads: LedgerReadsService) {}

  @Get() summary(@CurrentProvider() providerId: string) { return this.reads.providerSummary(providerId); }

  @Get('entries') entries(@CurrentProvider() providerId: string, @Query() q: LedgerPageQueryDto) { return this.reads.providerEntries(providerId, q); }
}
