import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { AdminPriceBookController } from './admin-price-book.controller.js';
import { PriceBookService } from './price-book.service.js';

@Module({ imports: [CatalogModule], controllers: [AdminPriceBookController], providers: [PriceBookService], exports: [PriceBookService] })
export class PriceBookModule {}
