import {
  ArgumentsHost,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  Injectable,
  Param,
  PayloadTooLargeException,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AppConfig } from '../../config/configuration.js';
import { IsIn } from 'class-validator';
import type { Response } from 'express';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/decorators.js';
import { JwtAuthGuard } from '../../common/auth/guards.js';
import { UPLOAD_PURPOSES, type UploadPurpose } from '../../common/constants.js';
import { isImageKind, kindFromName } from './upload-rules.js';
import { UploadsService, type IncomingFile } from './uploads.service.js';

export class UploadQueryDto {
  @IsIn(UPLOAD_PURPOSES, { message: 'کاربرد فایل معتبر نیست' })
  purpose: UploadPurpose;
}

/** Multer's "File too large" → a Persian 413 with the configured limit. */
@Injectable()
@Catch(PayloadTooLargeException)
export class UploadTooLargeFilter implements ExceptionFilter {
  private readonly maxMb: number;

  constructor(config: ConfigService) {
    this.maxMb = config.getOrThrow<AppConfig>('app').storage.maxMb;
  }

  catch(_err: PayloadTooLargeException, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(413).json({
      statusCode: 413,
      message: `حجم فایل بیش از حد مجاز است (حداکثر ${this.maxMb.toLocaleString('fa-IR')} مگابایت)`,
      error: 'Payload Too Large',
    });
  }
}

/** RFC 6266 header that keeps non-ASCII (Persian) names intact. */
export function contentDisposition(type: 'inline' | 'attachment', name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  @UseFilters(UploadTooLargeFilter)
  @UseInterceptors(FileInterceptor('file'))
  upload(@CurrentUser() user: AuthUser, @Query() q: UploadQueryDto, @UploadedFile() file?: IncomingFile) {
    return this.uploads.create(user, q.purpose, file);
  }

  @Get(':id')
  async download(@Param('id') id: string, @CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    const { upload, stream } = await this.uploads.openForUser(id, user);
    const kind = kindFromName(upload.name);
    // images render inline; documents always download (never rendered from the API origin)
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    return new StreamableFile(stream, {
      type: upload.mime,
      length: upload.size,
      disposition: contentDisposition(kind && isImageKind(kind) ? 'inline' : 'attachment', upload.name),
    });
  }
}
