import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { RequirePermissions, Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { PermissionsGuard } from '../../common/auth/permissions.guard.js';
import { ProviderDto, ProviderLoginDto } from './dto/provider.dto.js';
import { CurrentProvider, ProviderScopeGuard } from './provider-scope.guard.js';
import { ProvidersService } from './providers.service.js';

@Controller('admin/providers')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('admin')
export class AdminProvidersController {
  constructor(private readonly providers: ProvidersService) {}

  @Get() @RequirePermissions('provider_view') list() { return this.providers.list(); }
  @Get(':id') @RequirePermissions('provider_view') get(@Param('id') id: string) { return this.providers.get(id); }
  @Post() @RequirePermissions('provider_manage') create(@Body() dto: ProviderDto) { return this.providers.create(dto); }
  @Patch(':id') @RequirePermissions('provider_edit') update(@Param('id') id: string, @Body() dto: ProviderDto) { return this.providers.update(id, dto); }
  @Delete(':id') @RequirePermissions('provider_manage') remove(@Param('id') id: string) { return this.providers.remove(id); }
  @Put(':id/login') @RequirePermissions('provider_manage') link(@Param('id') id: string, @Body() dto: ProviderLoginDto) { return this.providers.linkLogin(id, dto.phone); }
  @Delete(':id/login') @RequirePermissions('provider_manage') unlink(@Param('id') id: string) { return this.providers.unlinkLogin(id); }
}

@Controller('provider')
@UseGuards(JwtAuthGuard, RolesGuard, ProviderScopeGuard)
@Roles('provider')
export class ProviderSelfController {
  constructor(private readonly providers: ProvidersService) {}

  @Get('me') me(@CurrentProvider() providerId: string) { return this.providers.self(providerId); }
}
