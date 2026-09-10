import { BadRequestException, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import multer from 'multer';
import { UPLOAD_PURPOSES, type UploadPurpose } from '../../common/constants.js';
import type { AppConfig } from '../../config/configuration.js';
import { allowedLabel, kindFromName, PURPOSE_KINDS } from './upload-rules.js';
import { UploadsController, UploadTooLargeFilter } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';
import { LocalStorageDriver, STORAGE_DRIVER } from './storage.js';

/** Holds the storage driver so both the multer options factory and the service can inject it. */
@Module({
  providers: [
    {
      provide: STORAGE_DRIVER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const { storage } = config.getOrThrow<AppConfig>('app');
        const driver = new LocalStorageDriver(storage.uploadDir);
        mkdirSync(driver.tmpDir, { recursive: true });
        new Logger('Uploads').log(`storage: ${driver.name} (${driver.root}), max ${storage.maxMb} MB`);
        return driver;
      },
    },
  ],
  exports: [STORAGE_DRIVER],
})
export class UploadsStorageModule {}

@Module({
  imports: [
    UploadsStorageModule,
    MulterModule.registerAsync({
      imports: [UploadsStorageModule],
      inject: [ConfigService, STORAGE_DRIVER],
      useFactory: (config: ConfigService, driver: LocalStorageDriver) => {
        const { storage } = config.getOrThrow<AppConfig>('app');
        return {
          storage: multer.diskStorage({
            destination: (_req, _file, cb) => {
              mkdirSync(driver.tmpDir, { recursive: true });
              cb(null, driver.tmpDir);
            },
            filename: (_req, _file, cb) => cb(null, randomUUID()),
          }),
          limits: { fileSize: storage.maxMb * 1024 * 1024, files: 1, fields: 5, parts: 6 },
          // cheap early rejection before anything is written; the content is sniffed after the upload
          fileFilter: (req, file, cb) => {
            const purpose = (req.query as Record<string, unknown>).purpose as UploadPurpose;
            if (!UPLOAD_PURPOSES.includes(purpose)) return cb(new BadRequestException('کاربرد فایل معتبر نیست'), false);
            const kind = kindFromName(file.originalname);
            if (!kind || !PURPOSE_KINDS[purpose].includes(kind)) {
              return cb(new BadRequestException(`نوع فایل مجاز نیست؛ فرمت‌های مجاز: ${allowedLabel(purpose)}`), false);
            }
            cb(null, true);
          },
        };
      },
    }),
  ],
  controllers: [UploadsController],
  providers: [
    UploadsService,
    UploadTooLargeFilter,
    {
      provide: 'UPLOAD_RETENTION_DAYS',
      inject: [ConfigService],
      useFactory: (c: ConfigService) => c.getOrThrow<AppConfig>('app').storage.retentionDays,
    },
  ],
  exports: [UploadsService],
})
export class UploadsModule {}
