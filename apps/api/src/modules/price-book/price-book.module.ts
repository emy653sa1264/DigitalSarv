import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { CentersModule } from '../centers/centers.module.js';
import { AdminPriceBookController } from './admin-price-book.controller.js';
import { PriceBookService } from './price-book.service.js';
import { ProviderPricesController } from './provider-prices.controller.js';

@Module({ imports: [CatalogModule, CentersModule], controllers: [AdminPriceBookController, ProviderPricesController], providers: [PriceBookService], exports: [PriceBookService] })
export class PriceBookModule {}
