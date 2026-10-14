import { Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RequirePermissions, Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { PermissionsGuard } from '../../common/auth/permissions.guard.js';
import { Center } from './center.schema.js';
import { ProviderDto } from './dto/provider.dto.js';
import { centerListJson, type CenterListItem, type CenterRow } from './provider-json.js';
import { ProviderScopeGuard } from './provider-scope.guard.js';
import { AdminProvidersController, ProviderSelfController } from './providers.controller.js';
import { ProvidersService } from './providers.service.js';

/** v1 `/admin/centers` list — kept for the order assignment selects (any admin). */
@Injectable()
export class CentersService {
  constructor(@InjectModel(Center.name) private readonly centers: Model<Center>) {}

  async list(): Promise<CenterListItem[]> {
    return ((await this.centers.find().sort({ _id: 1 }).lean()) as CenterRow[]).map(centerListJson);
  }
}

/** v1 paths: the list stays open to every admin; writes are aliases of `/admin/providers` (same permissions). */
@Controller('admin/centers')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('admin')
export class CentersController {
  constructor(
    private readonly centers: CentersService,
    private readonly providers: ProvidersService,
  ) {}

  @Get() list() { return this.centers.list(); }
  @Post() @RequirePermissions('provider_manage') create(@Body() dto: ProviderDto) { return this.providers.create(dto); }
  @Patch(':id') @RequirePermissions('provider_edit') update(@Param('id') id: string, @Body() dto: ProviderDto) { return this.providers.update(id, dto); }
  @Delete(':id') @RequirePermissions('provider_manage') remove(@Param('id') id: string) { return this.providers.remove(id); }
}

@Module({
  controllers: [CentersController, AdminProvidersController, ProviderSelfController],
  providers: [CentersService, ProvidersService, ProviderScopeGuard],
  exports: [ProvidersService, ProviderScopeGuard],
})
export class CentersModule {}
