import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Model, Types, type QueryFilter, type UpdateQuery } from 'mongoose';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser, Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { TokenVerifier } from '../../common/auth/token-verifier.service.js';
import { PERMISSIONS, type Permission } from '../../common/permissions.js';
import { assertObjectId } from '../../common/utils/object-id.js';
import { normalizePhone } from '../../common/utils/phone.js';
import type { AppConfig } from '../../config/configuration.js';
import { User } from '../users/user.schema.js';
import { makeReferralCode } from '../users/users.service.js';

const DENIED = 'به این بخش دسترسی ندارید';
const LAST_SUPER = 'حداقل یک مدیر کل باید باقی بماند';
const BOOTSTRAP = 'این مدیر از تنظیمات سرور (ADMIN_PHONES) تعیین شده و همیشه مدیر کل است';

export interface StaffMember { id: string; name: string; phone: string; superAdmin: boolean; bootstrap: boolean; permissions: Permission[] | null; createdAt: string }

export class CreateStaffDto {
  @IsString() @MaxLength(20) phone: string;
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  /** Omitted = no granular permission (`[]`); `null` = super-admin. */
  @IsOptional() @IsArray() @ArrayMaxSize(PERMISSIONS.length * 2) @IsIn(PERMISSIONS, { each: true }) permissions?: Permission[] | null;
}
export class UpdateStaffDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  /** `null` = super-admin; omitted = unchanged. */
  @IsOptional() @IsArray() @ArrayMaxSize(PERMISSIONS.length * 2) @IsIn(PERMISSIONS, { each: true }) permissions?: Permission[] | null;
}

type UserRow = User & { _id: Types.ObjectId; createdAt?: Date };

/** §81 staff screen: who is an admin and with which permissions. Super-admins only. */
@Injectable()
export class StaffService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly config: ConfigService,
    private readonly sessions: TokenVerifier,
  ) {}

  async assertSuperAdmin(userId: string): Promise<void> {
    const u = Types.ObjectId.isValid(userId) ? await this.users.findById(userId, { role: 1, permissions: 1 }).lean() : null;
    if (!u || u.role !== 'admin' || u.permissions) throw new ForbiddenException(DENIED);
  }

  async list(): Promise<StaffMember[]> {
    const boot = this.bootstrapPhones();
    return ((await this.users.find({ role: 'admin' }).sort({ createdAt: 1 }).lean()) as UserRow[]).map((u) => this.json(u, boot));
  }

  async create(dto: CreateStaffDto): Promise<StaffMember> {
    const phone = normalizePhone(dto.phone);
    if (!phone) throw new BadRequestException('شماره موبایل معتبر نیست');
    const existing = await this.users.findOne({ phone }).lean();
    if (existing?.role === 'admin') throw new ConflictException('این شماره قبلاً مدیر است');
    if (existing?.role === 'courier') throw new ConflictException('این شماره متعلق به یک پیک است');
    if (existing?.role === 'provider') throw new ConflictException('این شماره متعلق به یک مجری است');
    const permissions = dto.permissions === undefined ? [] : dto.permissions;
    const perm = permissions === null ? {} : { permissions: [...new Set(permissions)] };
    const name = dto.name?.trim();
    let id: Types.ObjectId;
    if (existing) {
      id = existing._id as Types.ObjectId;
      await this.users.updateOne({ _id: id, role: 'customer' }, { $set: { role: 'admin', ...perm, ...(name ? { name } : {}) } });
      await this.sessions.revokeUser(String(id)); // the customer token's role claim is stale now
    } else {
      id = (await this.users.create({ phone, name: name ?? '', role: 'admin', planId: 'bronze', referralCode: makeReferralCode(), ...perm }))._id as Types.ObjectId;
    }
    return this.get(String(id));
  }

  async update(id: string, dto: UpdateStaffDto): Promise<StaffMember> {
    const target = await this.find(id);
    if (dto.permissions !== undefined) {
      if (this.bootstrapPhones().has(target.phone)) throw new BadRequestException(BOOTSTRAP);
      if (dto.permissions === null) {
        await this.users.updateOne({ _id: target._id, role: 'admin' }, { $unset: { permissions: 1 } });
      } else {
        if (!target.permissions) await this.assertAnotherSuper(target._id);
        const written = [...new Set(dto.permissions)];
        await this.users.updateOne({ _id: target._id, role: 'admin' }, { $set: { permissions: written } });
        // undo only while the row still holds exactly what we wrote
        if (!target.permissions) await this.ensureSuperRemains({ _id: target._id, role: 'admin', permissions: written }, { $unset: { permissions: 1 } });
      }
    }
    if (typeof dto.name === 'string') await this.users.updateOne({ _id: target._id }, { $set: { name: dto.name.trim() } });
    return this.get(id);
  }

  /** Demotes to customer (permissions removed, sessions revoked). */
  async remove(id: string): Promise<{ ok: true }> {
    const target = await this.find(id);
    if (this.bootstrapPhones().has(target.phone)) throw new BadRequestException(BOOTSTRAP);
    if (!target.permissions) await this.assertAnotherSuper(target._id);
    // revoke before AND after the demotion: a token minted in between would otherwise outlive the role change
    await this.sessions.revokeUser(String(target._id));
    await this.users.updateOne({ _id: target._id, role: 'admin' }, { $set: { role: 'customer' }, $unset: { permissions: 1 } });
    if (!target.permissions) await this.ensureSuperRemains({ _id: target._id, role: 'customer', permissions: { $exists: false } }, { $set: { role: 'admin' } });
    await this.sessions.revokeUser(String(target._id));
    return { ok: true };
  }

  // ------------------------------------------------------------ helpers

  private bootstrapPhones(): Set<string> {
    return new Set(this.config.getOrThrow<AppConfig>('app').adminPhones);
  }

  private async find(id: string): Promise<UserRow> {
    assertObjectId(id, 'مدیر');
    const u = (await this.users.findById(id).lean()) as UserRow | null;
    if (!u || u.role !== 'admin') throw new NotFoundException('مدیر یافت نشد');
    return u;
  }

  private async get(id: string): Promise<StaffMember> {
    return this.json(await this.find(id), this.bootstrapPhones());
  }

  private async assertAnotherSuper(excludeId: Types.ObjectId) {
    const others = await this.users.countDocuments({ role: 'admin', permissions: { $exists: false }, _id: { $ne: excludeId } });
    if (!others) throw new ConflictException(LAST_SUPER);
  }

  /** Two concurrent demotions can both pass the pre-check: re-count after writing and undo ours when none is left. */
  private async ensureSuperRemains(written: QueryFilter<User>, undo: UpdateQuery<User>) {
    if (await this.users.countDocuments({ role: 'admin', permissions: { $exists: false } })) return;
    await this.users.updateOne(written, undo);
    throw new ConflictException(LAST_SUPER);
  }

  private json(u: UserRow, boot: Set<string>): StaffMember {
    return {
      id: String(u._id), name: u.name ?? '', phone: u.phone, superAdmin: !u.permissions, bootstrap: boot.has(u.phone),
      permissions: u.permissions ? [...u.permissions] : null, createdAt: new Date(u.createdAt ?? 0).toISOString(),
    };
  }
}

@Controller('admin/staff')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get() async list(@CurrentUser() user: AuthUser) {
    await this.staff.assertSuperAdmin(user.id);
    return this.staff.list();
  }
  @Post() async create(@CurrentUser() user: AuthUser, @Body() dto: CreateStaffDto) {
    await this.staff.assertSuperAdmin(user.id);
    return this.staff.create(dto);
  }
  @Patch(':id') async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateStaffDto) {
    await this.staff.assertSuperAdmin(user.id);
    return this.staff.update(id, dto);
  }
  @Delete(':id') async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.staff.assertSuperAdmin(user.id);
    return this.staff.remove(id);
  }
}

@Module({ controllers: [StaffController], providers: [StaffService] })
export class StaffModule {}
