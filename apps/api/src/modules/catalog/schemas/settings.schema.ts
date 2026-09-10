import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import type { Prices } from '../catalog.defaults.js';

/** Singleton document `_id: 'main'` holding the price table and global switches. */
@Schema({ collection: 'settings', timestamps: true })
export class Settings {
  @Prop({ type: String })
  _id: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  prices: Prices;

  @Prop({ type: Boolean, default: true })
  urgentEnabled: boolean;
}

export type SettingsDocument = HydratedDocument<Settings>;
export const SettingsSchema = SchemaFactory.createForClass(Settings);
export const SETTINGS_ID = 'main';
