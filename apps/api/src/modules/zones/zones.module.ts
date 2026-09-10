import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Model } from 'mongoose';
import { Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { defined } from '../../common/utils/defined.js';
import { assertObjectId } from '../../common/utils/object-id.js';
import { Zone } from './zone.schema.js';

export class CreateZoneDto {
  @IsString() @IsNotEmpty({ message: 'نام منطقه را وارد کنید' }) @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(120) feeNote?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(500) feePct?: number;
  @IsOptional() @IsString() @MaxLength(40) sla?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) agentsCount?: number;
}

export class UpdateZoneDto {
  @IsOptional() @IsString() @IsNotEmpty({ message: 'نام منطقه را وارد کنید' }) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(120) feeNote?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(500) feePct?: number;
  @IsOptional() @IsString() @MaxLength(40) sla?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) agentsCount?: number;
}

@Injectable()
export class ZonesService {
  constructor(@InjectModel(Zone.name) private readonly zones: Model<Zone>) {}

  list() { return this.zones.find().sort({ _id: 1 }); }
  create(dto: CreateZoneDto) { return this.zones.create(defined(dto)); }

  async update(id: string, dto: UpdateZoneDto) {
    assertObjectId(id, 'منطقه');
    const doc = await this.zones.findByIdAndUpdate(id, { $set: dto }, { returnDocument: 'after' });
    if (!doc) throw new NotFoundException('منطقه یافت نشد');
    return doc;
  }

  async remove(id: string) {
    assertObjectId(id, 'منطقه');
    if (!(await this.zones.findByIdAndDelete(id))) throw new NotFoundException('منطقه یافت نشد');
    return { ok: true };
  }
}

@Controller('admin/zones')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class ZonesController {
  constructor(private readonly zones: ZonesService) {}

  @Get() list() { return this.zones.list(); }
  @Post() create(@Body() dto: CreateZoneDto) { return this.zones.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateZoneDto) { return this.zones.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.zones.remove(id); }
}

@Module({ controllers: [ZonesController], providers: [ZonesService] })
export class ZonesModule {}
