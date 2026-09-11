import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './schemas/user.schema.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: string;
  warehouse: string;
  isActive: boolean;
  lastLogin: Date | null;
}

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async create(data: Partial<User>): Promise<UserDocument> {
    return this.userModel.create(data);
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findAll(): Promise<UserDocument[]> {
    return this.userModel.find().select('-password').exec();
  }

  async updateLastLogin(id: string) {
    return this.userModel.findByIdAndUpdate(id, { lastLogin: new Date() }).exec();
  }

  async update(id: string, data: Partial<User>): Promise<UserDocument | null> {
    return this.userModel.findByIdAndUpdate(id, data, { new: true }).select('-password').exec();
  }

  async remove(id: string): Promise<UserDocument | null> {
    return this.userModel.findByIdAndUpdate(id, { isActive: false }, { new: true }).exec();
  }

  // ── Administration API ─────────────────────────────────────────────────────

  private toPublic(user: UserDocument): PublicUser {
    return {
      id: user._id!.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      warehouse: user.warehouse,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
    };
  }

  async findAllPublic(): Promise<PublicUser[]> {
    const users = await this.userModel.find().sort({ name: 1 }).exec();
    return users.map((u) => this.toPublic(u));
  }

  async findPublicById(id: string): Promise<PublicUser> {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('User not found');
    return this.toPublic(user);
  }

  async createUser(dto: CreateUserDto): Promise<PublicUser> {
    const existing = await this.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    const user = await this.userModel.create({
      email: dto.email,
      name: dto.name,
      role: dto.role,
      warehouse: dto.warehouse || 'Central',
      password: await bcrypt.hash(dto.password, 12),
    });

    return this.toPublic(user);
  }

  async updateUser(id: string, dto: UpdateUserDto, actingUserId: string): Promise<PublicUser> {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('User not found');

    const losingAdmin =
      user.role === 'admin' && ((dto.role && dto.role !== 'admin') || dto.isActive === false);

    if (losingAdmin) {
      await this.assertNotSelf(id, actingUserId, 'No puedes quitarte tu propio acceso de administrador');
      await this.assertNotLastAdmin(id);
    }

    if (dto.name !== undefined) user.name = dto.name;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.warehouse !== undefined) user.warehouse = dto.warehouse;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.password !== undefined) user.password = await bcrypt.hash(dto.password, 12);

    await user.save();
    return this.toPublic(user);
  }

  async deactivateUser(id: string, actingUserId: string): Promise<PublicUser> {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('User not found');

    await this.assertNotSelf(id, actingUserId, 'No puedes desactivar tu propia cuenta');
    if (user.role === 'admin') await this.assertNotLastAdmin(id);

    user.isActive = false;
    await user.save();
    return this.toPublic(user);
  }

  /** Locking yourself out is never the intent behind one of these calls. */
  private async assertNotSelf(id: string, actingUserId: string, message: string) {
    if (id === actingUserId) throw new BadRequestException(message);
  }

  /** An installation with no active admin cannot be recovered through the API. */
  private async assertNotLastAdmin(id: string) {
    const otherAdmins = await this.userModel
      .countDocuments({ role: 'admin', isActive: true, _id: { $ne: id } })
      .exec();
    if (otherAdmins === 0) {
      throw new BadRequestException(
        'Es el ultimo administrador activo: asigna otro antes de degradarlo o desactivarlo',
      );
    }
  }
}
