import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'شماره صفحه معتبر نیست' })
  @Min(1, { message: 'شماره صفحه معتبر نیست' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'تعداد در صفحه معتبر نیست' })
  @Min(1, { message: 'تعداد در صفحه معتبر نیست' })
  @Max(100, { message: 'حداکثر ۱۰۰ مورد در هر صفحه' })
  limit?: number;

  @IsOptional()
  @IsString()
  q?: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export function pageParams(q: { page?: number; limit?: number }) {
  const page = q.page && q.page > 0 ? q.page : 1;
  const limit = q.limit && q.limit > 0 ? Math.min(q.limit, 100) : 20;
  return { page, limit, skip: (page - 1) * limit };
}

/** Escapes a user string for use inside a RegExp. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
