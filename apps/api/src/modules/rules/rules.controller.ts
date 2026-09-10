import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { CreateRuleDto, ReorderRulesDto, UpdateRuleDto } from './dto/rules.dto.js';
import { RulesService } from './rules.service.js';

@Controller('admin/rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @Get() list() { return this.rules.list(); }
  @Post() create(@Body() dto: CreateRuleDto) { return this.rules.create(dto); }
  @Post('reorder') @HttpCode(200)
  reorder(@Body() dto: ReorderRulesDto) { return this.rules.reorder(dto.ids); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateRuleDto) { return this.rules.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.rules.remove(id); }
}
