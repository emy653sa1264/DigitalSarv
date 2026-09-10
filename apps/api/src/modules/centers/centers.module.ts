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
import { Center } from './center.schema.js';

export class CreateCenterDto {
  @IsString() @IsNotEmpty({ message: 'نام مرکز چاپ را وارد کنید' }) @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(80) zone?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) capacityPerDay?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) processingHours?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) commissionPct?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(5) rating?: number;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
}

export class UpdateCenterDto {
  @IsOptional() @IsString() @IsNotEmpty({ message: 'نام مرکز چاپ را وارد کنید' }) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(80) zone?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) capacityPerDay?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) processingHours?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) commissionPct?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(5) rating?: number;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
}

@Injectable()
export class CentersService {
  constructor(@InjectModel(Center.name) private readonly centers: Model<Center>) {}

  list() { return this.centers.find().sort({ _id: 1 }); }
  create(dto: CreateCenterDto) { return this.centers.create(defined(dto)); }

  async update(id: string, dto: UpdateCenterDto) {
    assertObjectId(id, 'مرکز چاپ');
    const doc = await this.centers.findByIdAndUpdate(id, { $set: dto }, { returnDocument: 'after' });
    if (!doc) throw new NotFoundException('مرکز چاپ یافت نشد');
    return doc;
  }

  async remove(id: string) {
    assertObjectId(id, 'مرکز چاپ');
    if (!(await this.centers.findByIdAndDelete(id))) throw new NotFoundException('مرکز چاپ یافت نشد');
    return { ok: true };
  }
}

@Controller('admin/centers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class CentersController {
  constructor(private readonly centers: CentersService) {}

  @Get() list() { return this.centers.list(); }
  @Post() create(@Body() dto: CreateCenterDto) { return this.centers.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateCenterDto) { return this.centers.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.centers.remove(id); }
}

@Module({ controllers: [CentersController], providers: [CentersService] })
export class CentersModule {}
