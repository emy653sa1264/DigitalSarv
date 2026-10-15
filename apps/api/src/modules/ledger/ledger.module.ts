import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AdminLedgerController } from './ledger.controller.js';
import { LedgerActionsService } from './ledger-actions.service.js';
import { LedgerReadsService } from './ledger-reads.service.js';
import { LedgerNotifier } from './ledger-notifier.js';
import { LedgerService } from './ledger.service.js';
import { PayoutsService } from './payouts.service.js';
import { WalletService } from './wallet.service.js';

/** v4.3 provider ledger and settlement (M4). Uses the global models; imports nothing from dispatch/orders (no cycles). */
@Module({
  imports: [CatalogModule, NotificationsModule],
  controllers: [AdminLedgerController],
  providers: [LedgerService, LedgerReadsService, LedgerActionsService, LedgerNotifier, PayoutsService, WalletService],
  exports: [LedgerService],
})
export class LedgerModule {}
