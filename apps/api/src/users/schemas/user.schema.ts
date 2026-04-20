import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true })
  password!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, enum: ['admin', 'supervisor', 'operator'], default: 'operator' })
  role!: string;

  @Prop({ required: true, default: 'Central' })
  warehouse!: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ type: Date, default: null })
  lastLogin!: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
