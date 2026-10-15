import { Global, Module } from '@nestjs/common';
import { WalletCreditsService } from './wallet-credits.service.js';

/** v4.4 (D34): every automatic wallet movement; models come from the global DatabaseModule. */
@Global()
@Module({ providers: [WalletCreditsService], exports: [WalletCreditsService] })
export class WalletCreditsModule {}
