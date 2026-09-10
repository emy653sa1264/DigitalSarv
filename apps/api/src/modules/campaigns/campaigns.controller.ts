import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { CampaignsService } from './campaigns.service.js';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaigns.dto.js';

@Controller('admin/campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get() list() { return this.campaigns.list(); }
  @Post() create(@Body() dto: CreateCampaignDto) { return this.campaigns.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateCampaignDto) { return this.campaigns.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.campaigns.remove(id); }
}
