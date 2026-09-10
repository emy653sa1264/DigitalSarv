import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { PricingService } from './pricing.service.js';

@Module({
  imports: [CatalogModule],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
