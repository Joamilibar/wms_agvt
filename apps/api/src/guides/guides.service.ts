import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Guide, GuideDocument } from './schemas/guide.schema.js';

@Injectable()
export class GuidesService {
  constructor(@InjectModel(Guide.name) private guideModel: Model<GuideDocument>) {}

  private async generateGuideId(): Promise<string> {
    const count = await this.guideModel.countDocuments().exec();
    const num = String(count + 1).padStart(3, '0');
    return `GD-${new Date().getFullYear()}-${num}`;
  }

  async create(data: Partial<Guide> & { emittedBy: string }): Promise<GuideDocument> {
    const guideId = await this.generateGuideId();
    return this.guideModel.create({
      ...data,
      guideId,
      emittedBy: new Types.ObjectId(data.emittedBy),
    });
  }

  async findAll(query: { type?: string; status?: string; page?: number; limit?: number }) {
    const filter: Record<string, unknown> = {};
    if (query.type) filter.type = query.type;
    if (query.status) filter.status = query.status;

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.guideModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.guideModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string): Promise<GuideDocument> {
    const guide = await this.guideModel.findById(id).exec();
    if (!guide) throw new NotFoundException('Guide not found');
    return guide;
  }

  async emit(id: string): Promise<GuideDocument> {
    const guide = await this.findById(id);
    if (guide.status !== 'draft') throw new BadRequestException('Only draft guides can be emitted');
    guide.status = 'emitted';
    guide.emittedAt = new Date();
    return guide.save();
  }

  async receive(id: string): Promise<GuideDocument> {
    const guide = await this.findById(id);
    if (!['emitted', 'in_transit'].includes(guide.status)) {
      throw new BadRequestException('Guide must be emitted or in transit to receive');
    }
    guide.status = 'received';
    guide.receivedAt = new Date();
    return guide.save();
  }

  async cancel(id: string): Promise<GuideDocument> {
    const guide = await this.findById(id);
    if (['received', 'cancelled'].includes(guide.status)) {
      throw new BadRequestException('Cannot cancel a received or already cancelled guide');
    }
    guide.status = 'cancelled';
    return guide.save();
  }

  async updateBsaleStatus(id: string, status: string, data?: Partial<Guide>): Promise<GuideDocument> {
    const guide = await this.findById(id);
    guide.bsaleStatus = status as Guide['bsaleStatus'];
    if (data) Object.assign(guide, data);
    return guide.save();
  }
}
