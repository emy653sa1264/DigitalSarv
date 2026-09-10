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
import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { HydratedDocument, Model, Types } from 'mongoose';
import { Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { defined } from '../../common/utils/defined.js';
import { assertObjectId } from '../../common/utils/object-id.js';
import { Courier } from '../courier/courier.schema.js';
import { Zone } from './zone.schema.js';

// `agentsCount` is computed from the couriers on read (v3.2) — not accepted on write (the whitelist strips it)
export class CreateZoneDto {
  @IsString() @IsNotEmpty({ message: 'نام منطقه را وارد کنید' }) @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(120) feeNote?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(500) feePct?: number;
  @IsOptional() @IsString() @MaxLength(40) sla?: string;
}

export class UpdateZoneDto {
  @IsOptional() @IsString() @IsNotEmpty({ message: 'نام منطقه را وارد کنید' }) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(120) feeNote?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(500) feePct?: number;
  @IsOptional() @IsString() @MaxLength(40) sla?: string;
}

@Injectable()
export class ZonesService {
  constructor(
    @InjectModel(Zone.name) private readonly zones: Model<Zone>,
    @InjectModel(Courier.name) private readonly couriers: Model<Courier>,
  ) {}

  /** Zone JSON with `agentsCount` = couriers whose `zoneId` is that zone (the stored value is ignored). */
  private async withAgents(zones: HydratedDocument<Zone>[]) {
    const ids = zones.map((z) => z._id);
    const couriers = ids.length ? await this.couriers.find({ zoneId: { $in: ids } }, { zoneId: 1 }) : [];
    const counts = new Map<string, number>();
    for (const c of couriers) counts.set(String(c.zoneId), (counts.get(String(c.zoneId)) ?? 0) + 1);
    return zones.map((z) => ({ ...z.toJSON(), agentsCount: counts.get(String(z._id)) ?? 0 }));
  }

  async list() {
    return this.withAgents(await this.zones.find().sort({ _id: 1 }));
  }

  async create(dto: CreateZoneDto) {
    const [zone] = await this.withAgents([await this.zones.create(defined(dto))]);
    return zone;
  }

  async update(id: string, dto: UpdateZoneDto) {
    assertObjectId(id, 'منطقه');
    const doc = await this.zones.findByIdAndUpdate(id, { $set: dto }, { returnDocument: 'after' });
    if (!doc) throw new NotFoundException('منطقه یافت نشد');
    const [zone] = await this.withAgents([doc]);
    return zone;
  }

  /** Also unsets `zoneId` on the zone's couriers (they fall back to their free-text `zoneName`). */
  async remove(id: string) {
    assertObjectId(id, 'منطقه');
    if (!(await this.zones.findByIdAndDelete(id))) throw new NotFoundException('منطقه یافت نشد');
    await this.couriers.updateMany({ zoneId: new Types.ObjectId(id) }, { $unset: { zoneId: 1 } });
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
