import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from './schemas/order.schema.js';
import { StockService } from '../stock/stock.service.js';
import { BsaleService } from '../bsale/bsale.service.js';
import { PickingLogService } from '../picking-log/picking-log.service.js';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    private stockService: StockService,
    private bsaleService: BsaleService,
    private pickingLogService: PickingLogService,
  ) {}

  private async generateOrderId(): Promise<string> {
    const count = await this.orderModel.countDocuments().exec();
    const num = String(count + 1).padStart(3, '0');
    return `ORD-${new Date().getFullYear()}-${num}`;
  }

  async create(data: {
    client: string;
    originType?: string;
    bsaleDocumentId?: string;
    bsaleDocumentNumber?: string;
    bsaleOfficeId?: number;
    type?: string;
    priority?: string;
    warehouse?: string;
    destinationType?: string;
    generateGuide?: boolean;
    bsaleClientId?: number;
    bsaleDestinationOfficeId?: number;
    items: { sku: string; name: string; requestedQty: number }[];
    notes?: string;
    createdBy: string;
  }): Promise<OrderDocument> {
    const orderId = await this.generateOrderId();
    return this.orderModel.create({
      orderId,
      type: data.type || 'picking',
      status: 'pending',
      priority: data.priority || 'normal',
      client: data.client,
      destinationType: data.destinationType || 'client',
      generateGuide: data.generateGuide || false,
      bsaleClientId: data.bsaleClientId || null,
      bsaleDestinationOfficeId: data.bsaleDestinationOfficeId || null,
      originType: data.originType || 'manual',
      bsaleDocumentId: data.bsaleDocumentId || null,
      bsaleDocumentNumber: data.bsaleDocumentNumber || null,
      bsaleOfficeId: data.bsaleOfficeId || null,
      warehouse: data.warehouse || 'Central',
      items: data.items.map((i) => ({
        sku: i.sku,
        name: i.name,
        requestedQty: i.requestedQty,
        pickedQty: 0,
        lots: [],
        status: 'pending',
      })),
      notes: data.notes || '',
      createdBy: new Types.ObjectId(data.createdBy),
    });
  }

  async findAll(query: { status?: string; warehouse?: string; page?: number; limit?: number }) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.warehouse) filter.warehouse = query.warehouse;

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.orderModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.orderModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string): Promise<OrderDocument> {
    const order = await this.orderModel.findById(id).exec();
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async startOrder(id: string, userId: string): Promise<OrderDocument> {
    const order = await this.findById(id);
    if (order.status !== 'pending') {
      throw new BadRequestException('Order can only be started from pending status');
    }

    // Pre-allocate FIFO lots for the Picking Sheet
    for (const item of order.items) {
      if (item.requestedQty <= 0) continue;
      const { reserved } = await this.stockService.reserveFIFO(item.sku, item.requestedQty, order.warehouse);
      item.lots = reserved.map((r) => ({
        lotId: new Types.ObjectId(r.lotId),
        lot: r.lot,
        entryDate: r.entryDate,
        qty: r.qty,
        location: '',
        rack: r.rack || '',
        col: r.col || '',
        row: r.row || '',
        pallet: r.pallet || '',
      }));
    }

    order.status = 'in_progress';
    order.startedAt = new Date();
    order.assignedTo = new Types.ObjectId(userId);
    return order.save();
  }

  async processFIFO(id: string, pickedItems: { sku: string; qty: number }[], userId: string): Promise<OrderDocument> {
    const order = await this.findById(id);
    if (order.status !== 'in_progress') {
      throw new BadRequestException('Order must be in_progress to process FIFO');
    }

    const session = await this.stockService.startSession();
    const logItems: any[] = [];

    // Guard against BSale issues before mutating internal inventory if Factura/Boleta
    let generatedGuide = null;
    if ((order.originType === 'bsale_factura' || order.originType === 'bsale_boleta') && !order.guideId) {
      if (!this.bsaleService.isConfigured()) {
        throw new BadRequestException('BSale no está configurado para emitir guías. Picking detenido.');
      }
      
      try {
        generatedGuide = await this.bsaleService.generateGuide({
          documentTypeId: 7, // Guía de Despacho
          officeId: order.bsaleOfficeId || 1, 
          declareSii: 0, // Dev env default
          emissionDate: Math.floor(Date.now() / 1000),
          references: [
            {
              number: order.bsaleDocumentNumber || '0',
              referenceDate: Math.floor(Date.now() / 1000),
              reason: 'Picking WMS PRO',
              codeSii: order.originType === 'bsale_factura' ? 33 : 39,
            }
          ],
          details: pickedItems.filter(pi => pi.qty > 0).map((pi) => ({
             variantId: parseInt(pi.sku.replace(/\D/g, '') || '0') || null, 
             quantity: pi.qty, 
          })).filter(pi => pi.variantId !== null)
        });
      } catch (e: any) {
        throw new BadRequestException(`Fallo en BSale al autogenerar Guía de Despacho. Detalles: ${e.response?.data?.message || e.message}. La orden permanece Abierta.`);
      }
    }

    try {
      await session.withTransaction(async () => {
        for (const input of pickedItems) {
          const item = order.items.find((i) => i.sku === input.sku);
          if (!item) continue;
          if (input.qty <= 0) continue;

          // Process WMS internally
          const result = await this.stockService.processFIFO(item.sku, input.qty, order.warehouse, session);

          // Traceability array for order
          item.pickedQty += result.consumed.reduce((sum, c) => sum + c.qty, 0);

          if (item.pickedQty >= item.requestedQty) {
            item.status = 'completed';
          } else if (item.pickedQty > 0) {
            item.status = 'partial';
          } else {
            item.status = 'unavailable';
          }

          logItems.push(...result.consumed.map(c => ({
            sku: item.sku,
            name: item.name,
            qty: c.qty,
            lot: c.lot,
            location: `${c.rack || ''}-${c.col || ''}-${c.row || ''}`
          })));
        }

        const allCompleted = order.items.every((i) => i.status === 'completed' || i.status === 'unavailable');
        const anyPicked = order.items.some((i) => i.pickedQty > 0);

        order.status = allCompleted ? 'completed' : anyPicked ? 'in_progress' : 'in_progress';
        if (allCompleted) order.completedAt = new Date();

        await order.save({ session });
      });

      // Write Picking Log asynchronously
      if (logItems.length > 0) {
        await this.pickingLogService.create({
          userId: new Types.ObjectId(userId),
          orderId: order._id as Types.ObjectId,
          type: order.originType,
          bsaleDocumentId: order.bsaleDocumentId,
          bsaleDocumentNumber: order.bsaleDocumentNumber,
          client: order.client,
          items: logItems,
          notes: generatedGuide ? 'Guía de despacho autogenerada en BSale.' : '',
        });
      }

      // Check comparative logic for Guías
      if (order.originType === 'bsale_guia' && this.bsaleService.isConfigured()) {
         try {
            // Attempt to check stock mismatch, log independently
            for(const pc of pickedItems) {
               // ... 
            }
         } catch(e) { }
      }

    } finally {
      await session.endSession();
    }

    return this.findById(id);
  }

  async cancelOrder(id: string): Promise<OrderDocument> {
    const order = await this.findById(id);
    if (['completed', 'cancelled'].includes(order.status)) {
      throw new BadRequestException('Cannot cancel a completed or already cancelled order');
    }
    order.status = 'cancelled';
    order.cancelledAt = new Date();
    return order.save();
  }

  async getTraceability(id: string) {
    const order = await this.findById(id);
    return order.items.map((item) => ({
      sku: item.sku,
      name: item.name,
      requestedQty: item.requestedQty,
      pickedQty: item.pickedQty,
      status: item.status,
      lots: item.lots,
    }));
  }
}
