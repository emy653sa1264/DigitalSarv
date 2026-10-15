import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { AdminLedgerController } from './ledger.controller.js';
import { LedgerReadsService } from './ledger-reads.service.js';
import { LedgerService } from './ledger.service.js';

/** v4.3 provider ledger and settlement (M4). Uses the global models; imports nothing from dispatch/orders (no cycles). */
@Module({
  imports: [CatalogModule],
  controllers: [AdminLedgerController],
  providers: [LedgerService, LedgerReadsService],
  exports: [LedgerService],
})
export class LedgerModule {}
