import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { UsersService } from '../users/users.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { RefreshToken, RefreshTokenDocument } from './schemas/refresh-token.schema.js';
import type { UserDocument } from '../users/schemas/user.schema.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectModel(RefreshToken.name)
    private refreshTokenModel: Model<RefreshTokenDocument>,
  ) {}

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    await this.usersService.updateLastLogin(user._id!.toString());

    // A fresh login starts a new token family.
    return this.issueSession(user, randomUUID());
  }

  async register(registerDto: RegisterDto) {
    const existing = await this.usersService.findByEmail(registerDto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 12);
    // Role is pinned server-side; self-registration can never grant privileges.
    const user = await this.usersService.create({
      email: registerDto.email,
      name: registerDto.name,
      password: hashedPassword,
      role: 'operator',
    });

    return this.issueSession(user, randomUUID());
  }

  /**
   * Exchanges a refresh token for a new pair, rotating the old one away.
   *
   * Presenting a token that was already rotated (or revoked) is treated as a
   * compromise, not a mistake: the entire family is revoked, which logs out
   * both the legitimate holder and whoever replayed it.
   */
  async refresh(refreshToken: string) {
    const tokenHash = this.hash(refreshToken);
    const stored = await this.refreshTokenModel.findOne({ tokenHash }).exec();

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      this.logger.warn(
        `Reuse of a revoked/expired refresh token for user ${stored.userId.toString()}; ` +
        `revoking family ${stored.family}`,
      );
      await this.revokeFamily(stored.family);
      throw new UnauthorizedException('Refresh token no longer valid; please sign in again');
    }

    const user = await this.usersService.findById(stored.userId.toString());
    if (!user || !user.isActive) {
      await this.revokeFamily(stored.family);
      throw new UnauthorizedException('User not found or inactive');
    }

    const session = await this.issueSession(user, stored.family);

    stored.revokedAt = new Date();
    stored.replacedByHash = this.hash(session.refresh_token);
    await stored.save();

    return session;
  }

  /** Revokes the presented token's whole family, so logout actually logs out. */
  async logout(refreshToken?: string) {
    if (!refreshToken) return { revoked: 0 };

    const stored = await this.refreshTokenModel.findOne({ tokenHash: this.hash(refreshToken) }).exec();
    if (!stored) return { revoked: 0 };

    const revoked = await this.revokeFamily(stored.family);
    return { revoked };
  }

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    return {
      id: user._id!.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      warehouse: user.warehouse,
    };
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async revokeFamily(family: string): Promise<number> {
    const res = await this.refreshTokenModel
      .updateMany({ family, revokedAt: null }, { $set: { revokedAt: new Date() } })
      .exec();
    return res.modifiedCount;
  }

  private async issueSession(user: UserDocument, family: string) {
    const payload = { sub: user._id!.toString(), email: user.email, role: user.role };

    // Opaque and random, not a JWT: a refresh token has to be revocable, and a
    // self-contained token cannot be.
    const refreshToken = randomBytes(48).toString('base64url');
    const ttlDays = this.refreshTtlDays();

    await this.refreshTokenModel.create({
      userId: new Types.ObjectId(user._id!.toString()),
      tokenHash: this.hash(refreshToken),
      family,
      expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
    });

    return {
      access_token: this.jwtService.sign(payload),
      refresh_token: refreshToken,
      user: {
        id: user._id!.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        warehouse: user.warehouse,
      },
    };
  }

  private refreshTtlDays(): number {
    const raw = this.configService.get<string>('jwt.refreshExpiresIn') || '7d';
    const days = parseInt(raw, 10);
    return Number.isFinite(days) && days > 0 ? days : 7;
  }
}
