import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { CatalogService } from './catalog.service.js';
import {
  CreateBindColorDto,
  CreateColorDto,
  CreateExtraDto,
  CreateGradeDto,
  CreatePaperDto,
  ReorderDto,
  ToggleAllDto,
  UpdateBindColorDto,
  UpdateColorDto,
  UpdateExtraDto,
  UpdateGradeDto,
  UpdatePaperDto,
  UpdatePlanDto,
  UpdatePricesDto,
} from './dto/catalog.dto.js';
import { UpdateSettingsDto } from './dto/settings.dto.js';

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
  @Post('colors/reorder') @HttpCode(200)
  reorderColors(@Body() dto: ReorderDto) { return this.catalog.reorderColors(dto.ids); }
  @Patch('colors/:id') updateColor(@Param('id') id: string, @Body() dto: UpdateColorDto) { return this.catalog.updateColor(id, dto); }
  @Delete('colors/:id') deleteColor(@Param('id') id: string) { return this.catalog.deleteColor(id); }

  // bind colours (v3.3 «رنگ جلد»)
  @Get('bind-colors') listBindColors() { return this.catalog.listBindColors(); }
  @Post('bind-colors') createBindColor(@Body() dto: CreateBindColorDto) { return this.catalog.createBindColor(dto); }
  @Post('bind-colors/toggle-all') @HttpCode(200)
  toggleBindColors(@Body() dto: ToggleAllDto) { return this.catalog.toggleAllBindColors(dto.on); }
  @Post('bind-colors/reorder') @HttpCode(200)
  reorderBindColors(@Body() dto: ReorderDto) { return this.catalog.reorderBindColors(dto.ids); }
  @Patch('bind-colors/:id') updateBindColor(@Param('id') id: string, @Body() dto: UpdateBindColorDto) { return this.catalog.updateBindColor(id, dto); }
  @Delete('bind-colors/:id') deleteBindColor(@Param('id') id: string) { return this.catalog.deleteBindColor(id); }

  // extras
  @Get('extras') listExtras() { return this.catalog.listExtras(); }
  @Post('extras') createExtra(@Body() dto: CreateExtraDto) { return this.catalog.createExtra(dto); }
  @Post('extras/toggle-all') @HttpCode(200)
  toggleExtras(@Body() dto: ToggleAllDto) { return this.catalog.toggleAllExtras(dto.on); }
  @Post('extras/reorder') @HttpCode(200)
  reorderExtras(@Body() dto: ReorderDto) { return this.catalog.reorderExtras(dto.ids); }
  @Patch('extras/:id') updateExtra(@Param('id') id: string, @Body() dto: UpdateExtraDto) { return this.catalog.updateExtra(id, dto); }
  @Delete('extras/:id') deleteExtra(@Param('id') id: string) { return this.catalog.deleteExtra(id); }

  // grades
  @Get('grades') listGrades() { return this.catalog.listGrades(); }
  @Post('grades') createGrade(@Body() dto: CreateGradeDto) { return this.catalog.createGrade(dto); }
  @Post('grades/toggle-all') @HttpCode(200)
  toggleGrades(@Body() dto: ToggleAllDto) { return this.catalog.toggleAllGrades(dto.on); }
  @Post('grades/reorder') @HttpCode(200)
  reorderGrades(@Body() dto: ReorderDto) { return this.catalog.reorderGrades(dto.ids); }
  @Patch('grades/:id') updateGrade(@Param('id') id: string, @Body() dto: UpdateGradeDto) { return this.catalog.updateGrade(id, dto); }
  @Delete('grades/:id') deleteGrade(@Param('id') id: string) { return this.catalog.deleteGrade(id); }

  // papers (v3 «نوع کاغذ»)
  @Get('papers') listPapers() { return this.catalog.listPapers(); }
  @Post('papers') createPaper(@Body() dto: CreatePaperDto) { return this.catalog.createPaper(dto); }
  @Post('papers/toggle-all') @HttpCode(200)
  togglePapers(@Body() dto: ToggleAllDto) { return this.catalog.toggleAllPapers(dto.on); }
  @Post('papers/reorder') @HttpCode(200)
  reorderPapers(@Body() dto: ReorderDto) { return this.catalog.reorderPapers(dto.ids); }
  @Patch('papers/:id') updatePaper(@Param('id') id: string, @Body() dto: UpdatePaperDto) { return this.catalog.updatePaper(id, dto); }
  @Delete('papers/:id') deletePaper(@Param('id') id: string) { return this.catalog.deletePaper(id); }

  // prices
  @Get('prices') getPrices() { return this.catalog.getPrices(); }
  @Put('prices') updatePrices(@Body() dto: UpdatePricesDto) { return this.catalog.updatePrices(dto); }
  @Post('prices/reset') @HttpCode(200)
  resetPrices() { return this.catalog.resetPrices(); }

  // «تنظیمات» (v3.3)
  @Get('settings') getSettings() { return this.catalog.getAdminSettings(); }
  @Put('settings') updateSettings(@Body() dto: UpdateSettingsDto) { return this.catalog.updateSettings(dto); }

  // plans
  @Get('plans') listPlans() { return this.catalog.listPlans(); }
  @Patch('plans/:id') updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) { return this.catalog.updatePlan(id, dto); }
}
