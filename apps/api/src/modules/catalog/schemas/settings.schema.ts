import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import type { CourierPaySettings, OpsSettings, Prices, QcChecklists } from '../catalog.defaults.js';

/**
 * Singleton document `_id: 'main'` holding the price table, global switches and «تنظیمات» (v3.3).
 * Every section is merged over its defaults on read (`CatalogService.getSettings`), so documents saved
 * before a key existed read it as the default.
 */
@Schema({ collection: 'settings', timestamps: true })
export class Settings {
  @Prop({ type: String })
  _id: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  prices: Prices;

  @Prop({ type: Boolean, default: true })
  urgentEnabled: boolean;

  @Prop({ type: MongooseSchema.Types.Mixed })
  ops?: Partial<OpsSettings>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  courier?: Partial<CourierPaySettings>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  checklists?: { qc?: Partial<QcChecklists>; pickup?: string[] };
}

export type SettingsDocument = HydratedDocument<Settings>;
export const SettingsSchema = SchemaFactory.createForClass(Settings);
export const SETTINGS_ID = 'main';
