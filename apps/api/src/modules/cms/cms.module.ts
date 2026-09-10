import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Model } from 'mongoose';
import { Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { assertObjectId } from '../../common/utils/object-id.js';
import { CmsSection } from './cms-section.schema.js';

export class UpdateCmsSectionDto {
  @IsOptional() @IsString() @IsNotEmpty({ message: 'عنوان بخش را وارد کنید' }) @MaxLength(80)
  label?: string;

  @IsOptional() @IsBoolean()
  on?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  order?: number;
}

/**
 * Landing sections are fixed by the landing code (seeded by `seed:base`); admins switch, rename and
 * reorder them. There is no create (v3.2): an added section could never control anything.
 */
@Injectable()
export class CmsService {
  constructor(@InjectModel(CmsSection.name) private readonly sections: Model<CmsSection>) {}

  async publicList() {
    const all = await this.sections.find().sort({ order: 1 });
    return all.map((s) => ({ key: s.key, label: s.label, on: s.on, order: s.order }));
  }

  list() {
    return this.sections.find().sort({ order: 1 });
  }

  async update(id: string, dto: UpdateCmsSectionDto) {
    assertObjectId(id, 'بخش');
    const doc = await this.sections.findByIdAndUpdate(id, { $set: dto }, { returnDocument: 'after' });
    if (!doc) throw new NotFoundException('بخش محتوا یافت نشد');
    return doc;
  }
}

/** Public: which landing sections are on, in order. */
@Controller('cms')
export class CmsController {
  constructor(private readonly cms: CmsService) {}

  @Get() list() { return this.cms.publicList(); }
}

@Controller('admin/cms')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminCmsController {
  constructor(private readonly cms: CmsService) {}

  @Get() list() { return this.cms.list(); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateCmsSectionDto) { return this.cms.update(id, dto); }
}

@Module({ controllers: [CmsController, AdminCmsController], providers: [CmsService] })
export class CmsModule {}
