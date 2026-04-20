import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PickingLog, PickingLogDocument } from './schemas/picking-log.schema.js';

@Injectable()
export class PickingLogService {
  constructor(
    @InjectModel(PickingLog.name) private pickingLogModel: Model<PickingLogDocument>,
  ) {}

  async create(data: Partial<PickingLog>) {
    return this.pickingLogModel.create(data);
  }

  async findAll() {
    return this.pickingLogModel.find().populate('userId', 'name email').sort({ createdAt: -1 }).limit(100);
  }

  async findByOrderId(orderId: string) {
    return this.pickingLogModel.find({ orderId }).populate('userId', 'name email').sort({ createdAt: -1 });
  }
}
