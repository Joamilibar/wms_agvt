import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PlanningParams, PlanningParamsDocument } from '../schemas/planning-params.schema.js';

/**
 * Parameters are append-only: every save writes a new version, and the
 * current one is simply the highest. A planning run stores the version it
 * ran with, which is what makes a suggestion reproducible months later.
 */
@Injectable()
export class PlanningParamsService {
  constructor(@InjectModel(PlanningParams.name) private model: Model<PlanningParamsDocument>) {}

  async current(): Promise<PlanningParamsDocument> {
    const latest = await this.model.findOne().sort({ version: -1 }).exec();
    if (latest) return latest;
    return this.model.create({ version: 1, changedBy: 'system', changeNote: 'Valores iniciales' });
  }

  history(limit = 20): Promise<PlanningParamsDocument[]> {
    return this.model.find().sort({ version: -1 }).limit(limit).exec();
  }

  async update(patch: Partial<PlanningParams>, changedBy: string, changeNote = ''): Promise<PlanningParamsDocument> {
    const cur = await this.current();
    const { _id, version, createdAt, updatedAt, ...base } = cur.toObject() as Record<string, unknown>;
    void _id; void createdAt; void updatedAt;
    return this.model.create({
      ...base,
      ...patch,
      version: (version as number) + 1,
      changedBy,
      changeNote,
    });
  }
}
