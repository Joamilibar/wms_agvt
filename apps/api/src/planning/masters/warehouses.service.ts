import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BsaleService } from '../../bsale/bsale.service.js';
import {
  Warehouse,
  WarehouseDocument,
  WarehouseRole,
  PlanningUse,
  DEFAULT_USES,
} from '../schemas/warehouse.schema.js';

/**
 * Roles for the offices BSale reports today (D5). Anything BSale adds later
 * is created as `sellable` and flagged for review.
 */
const KNOWN_ROLES: Record<string, WarehouseRole> = {
  'Bodega Virtual Tienda': 'sellable',
  'Casa Costanera': 'store',
  'Bodega Principal San Martin': 'project',
  'Showroom Alonso de Cordova': 'reserved',
  'Taller Sapru San Vicente': 'workshop',
  'Taller Santa Cruz Los Lirios': 'workshop',
  'Taller Antonia Abarzua Maximo': 'workshop',
  Reservas: 'reserved',
};

@Injectable()
export class WarehousesService {
  private readonly logger = new Logger(WarehousesService.name);

  constructor(
    @InjectModel(Warehouse.name) private model: Model<WarehouseDocument>,
    private bsaleService: BsaleService,
  ) {}

  findAll(): Promise<WarehouseDocument[]> {
    return this.model.find().sort({ name: 1 }).exec();
  }

  /** Names of the warehouses whose stock a given decision reads. */
  async namesFor(use: PlanningUse): Promise<string[]> {
    const docs = await this.model.find({ isActive: true, countsFor: use }, { name: 1 }).exec();
    return docs.map((d) => d.name);
  }

  /**
   * Creates one record per BSale office. Existing records keep their role:
   * the sync never overrides what someone set by hand.
   */
  async syncFromBsale(): Promise<{ created: string[]; existing: number }> {
    const data = await this.bsaleService.getOffices();
    const created: string[] = [];
    let existing = 0;
    for (const office of data.items || []) {
      const name: string = office.name;
      const found = await this.model.findOne({ name }).exec();
      if (found) {
        existing++;
        if (!found.bsaleOfficeId) {
          found.bsaleOfficeId = String(office.id);
          await found.save();
        }
        continue;
      }
      const role = KNOWN_ROLES[name] ?? 'sellable';
      await this.model.create({
        name,
        bsaleOfficeId: String(office.id),
        role,
        countsFor: DEFAULT_USES[role],
        isActive: office.state === 0,
        notes: KNOWN_ROLES[name] ? '' : 'Rol asignado por defecto: revisar',
      });
      created.push(name);
    }
    this.logger.log(`Warehouses synced: ${created.length} created, ${existing} existing`);
    return { created, existing };
  }

  async update(
    id: string,
    patch: { role?: WarehouseRole; countsFor?: PlanningUse[]; isActive?: boolean; notes?: string },
  ): Promise<WarehouseDocument> {
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException('Bodega no encontrada');
    if (patch.role && patch.role !== doc.role) {
      doc.role = patch.role;
      // A new role brings its default uses unless the caller sets them explicitly.
      doc.countsFor = patch.countsFor ?? DEFAULT_USES[patch.role];
    } else if (patch.countsFor) {
      doc.countsFor = patch.countsFor;
    }
    if (patch.isActive !== undefined) doc.isActive = patch.isActive;
    if (patch.notes !== undefined) doc.notes = patch.notes;
    return doc.save();
  }
}
