import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { CatalogService } from './catalog.service.js';
import {
  CreateColorDto,
  CreateExtraDto,
  CreateGradeDto,
  ToggleAllDto,
  UpdateColorDto,
  UpdateExtraDto,
  UpdateGradeDto,
  UpdatePlanDto,
  UpdatePricesDto,
} from './dto/catalog.dto.js';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  // colors
  @Get('colors') listColors() { return this.catalog.listColors(); }
  @Post('colors') createColor(@Body() dto: CreateColorDto) { return this.catalog.createColor(dto); }
  @Post('colors/toggle-all') @HttpCode(200)
  toggleColors(@Body() dto: ToggleAllDto) { return this.catalog.toggleAllColors(dto.on); }
  @Patch('colors/:id') updateColor(@Param('id') id: string, @Body() dto: UpdateColorDto) { return this.catalog.updateColor(id, dto); }
  @Delete('colors/:id') deleteColor(@Param('id') id: string) { return this.catalog.deleteColor(id); }

  // extras
  @Get('extras') listExtras() { return this.catalog.listExtras(); }
  @Post('extras') createExtra(@Body() dto: CreateExtraDto) { return this.catalog.createExtra(dto); }
  @Post('extras/toggle-all') @HttpCode(200)
  toggleExtras(@Body() dto: ToggleAllDto) { return this.catalog.toggleAllExtras(dto.on); }
  @Patch('extras/:id') updateExtra(@Param('id') id: string, @Body() dto: UpdateExtraDto) { return this.catalog.updateExtra(id, dto); }
  @Delete('extras/:id') deleteExtra(@Param('id') id: string) { return this.catalog.deleteExtra(id); }

  // grades
  @Get('grades') listGrades() { return this.catalog.listGrades(); }
  @Post('grades') createGrade(@Body() dto: CreateGradeDto) { return this.catalog.createGrade(dto); }
  @Post('grades/toggle-all') @HttpCode(200)
  toggleGrades(@Body() dto: ToggleAllDto) { return this.catalog.toggleAllGrades(dto.on); }
  @Patch('grades/:id') updateGrade(@Param('id') id: string, @Body() dto: UpdateGradeDto) { return this.catalog.updateGrade(id, dto); }
  @Delete('grades/:id') deleteGrade(@Param('id') id: string) { return this.catalog.deleteGrade(id); }

  // prices
  @Get('prices') getPrices() { return this.catalog.getPrices(); }
  @Put('prices') updatePrices(@Body() dto: UpdatePricesDto) { return this.catalog.updatePrices(dto); }
  @Post('prices/reset') @HttpCode(200)
  resetPrices() { return this.catalog.resetPrices(); }

  // plans
  @Get('plans') listPlans() { return this.catalog.listPlans(); }
  @Patch('plans/:id') updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) { return this.catalog.updatePlan(id, dto); }
}
