import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RefreshTokenDocument = RefreshToken & Document;

/**
 * One row per issued refresh token.
 *
 * M-08: the session used to be a single 7-day JWT in localStorage with no
 * refresh and no way to revoke it — logging out only deleted the local copy
 * while the token stayed valid. Storing tokens server-side is what makes
 * revocation possible at all.
 *
 * Only the SHA-256 of the token is kept: a leaked database dump must not hand
 * anyone a working session.
 */
@Schema({ timestamps: true })
export class RefreshToken {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, unique: true })
  tokenHash!: string;

  /**
   * All tokens descended from one login share a family id. If a token that was
   * already rotated away is presented again, the whole family is revoked: either
   * it leaked, or someone is replaying it.
   */
  @Prop({ required: true, index: true })
  family!: string;

  @Prop({ required: true, type: Date })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  @Prop({ type: String, default: null })
  replacedByHash!: string | null;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);

// Expired rows are useless: let MongoDB reap them instead of growing forever.
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
