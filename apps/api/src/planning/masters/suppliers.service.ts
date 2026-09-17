import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Supplier, SupplierDocument } from '../schemas/supplier.schema.js';
import { CreateSupplierDto, UpdateSupplierDto } from '../dto/supplier.dto.js';

@Injectable()
export class SuppliersService {
  constructor(@InjectModel(Supplier.name) private model: Model<SupplierDocument>) {}

  findAll(includeInactive = false): Promise<SupplierDocument[]> {
    return this.model.find(includeInactive ? {} : { isActive: true }).sort({ name: 1 }).exec();
  }

  async findById(id: string): Promise<SupplierDocument> {
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException('Proveedor no encontrado');
    return doc;
  }

  findByName(name: string): Promise<SupplierDocument | null> {
    return this.model.findOne({ name }).exec();
  }

  async create(dto: CreateSupplierDto): Promise<SupplierDocument> {
    if (await this.model.findOne({ name: dto.name }).exec()) {
      throw new ConflictException(`Ya existe el proveedor ${dto.name}`);
    }
    return this.model.create(dto);
  }

  async update(id: string, dto: UpdateSupplierDto): Promise<SupplierDocument> {
    const doc = await this.findById(id);
    Object.assign(doc, dto);
    return doc.save();
  }

  /** Creates the supplier if it does not exist; used by the bulk import of planning items. */
  async ensure(name: string, defaults: Partial<CreateSupplierDto> = {}): Promise<SupplierDocument> {
    const existing = await this.findByName(name);
    if (existing) return existing;
    return this.model.create({ name, ...defaults });
  }
}
