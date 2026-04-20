import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../users/schemas/user.schema.js';
import { StockLot, StockLotDocument } from '../stock/schemas/stock-lot.schema.js';
import { Order, OrderDocument } from '../orders/schemas/order.schema.js';
import { Guide, GuideDocument } from '../guides/schemas/guide.schema.js';
import { SalesRecord, SalesRecordDocument } from '../analytics/schemas/sales-record.schema.js';

const PRODUCTS = [
  { sku: 'SKU-001', name: 'Plumón Ganso 400 Hilos King', unitCost: 185000 },
  { sku: 'SKU-002', name: 'Sábanas Hilo Largo Queen 300TC', unitCost: 89000 },
  { sku: 'SKU-003', name: 'Featherbed Queen Premium', unitCost: 145000 },
  { sku: 'SKU-004', name: 'Almohada Pluma Liviana 50x70', unitCost: 42000 },
  { sku: 'SKU-005', name: 'Bata Algodón Pima Talla M', unitCost: 65000 },
  { sku: 'SKU-006', name: 'Toalla Baño Premium 600gr', unitCost: 28000 },
  { sku: 'SKU-007', name: 'Plumón Liviano Verano Queen', unitCost: 125000 },
  { sku: 'SKU-008', name: 'Funda Almohada Bordada 50x70', unitCost: 18000 },
];

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(StockLot.name) private stockModel: Model<StockLotDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Guide.name) private guideModel: Model<GuideDocument>,
    @InjectModel(SalesRecord.name) private salesModel: Model<SalesRecordDocument>,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    const userCount = await this.userModel.countDocuments().exec();
    if (userCount === 0) {
      this.logger.log('🌱 No data found — running seed...');
      await this.seed();
      this.logger.log('✅ Seed completed');
    }
  }

  async seed() {
    // 1. Users
    const adminEmail = this.configService.get<string>('seed.adminEmail')!;
    const adminPassword = this.configService.get<string>('seed.adminPassword')!;
    const hashedPass = await bcrypt.hash(adminPassword, 12);

    const admin = await this.userModel.create({
      email: adminEmail, password: hashedPass, name: 'Admin Cabo de Hornos',
      role: 'admin', warehouse: 'Central', isActive: true,
    });

    const op1 = await this.userModel.create({
      email: 'operador1@cabodehornos.cl', password: hashedPass, name: 'Carlos Operador',
      role: 'operator', warehouse: 'Central', isActive: true,
    });

    const op2 = await this.userModel.create({
      email: 'operador2@cabodehornos.cl', password: hashedPass, name: 'María Operadora',
      role: 'operator', warehouse: 'Norte', isActive: true,
    });

    this.logger.log('  → 3 users created');

    // 2. Stock Lots (16 lots distributed 10-310 days ago)
    const now = new Date();
    const lots: StockLotDocument[] = [];
    const daysAgo = [10, 25, 40, 55, 70, 85, 100, 115, 130, 150, 170, 200, 220, 250, 280, 310];
    const locations = ['A-01-01', 'A-01-02', 'A-02-01', 'B-01-01', 'B-01-02', 'B-02-01', 'C-01-01', 'C-01-02'];

    for (let i = 0; i < 16; i++) {
      const product = PRODUCTS[i % 8];
      const entryDate = new Date(now);
      entryDate.setDate(entryDate.getDate() - daysAgo[i]);

      const qty = 10 + Math.floor(Math.random() * 90);

      const lot = await this.stockModel.create({
        sku: product.sku,
        name: product.name,
        lot: `L${new Date().getFullYear()}-${String(i + 1).padStart(3, '0')}`,
        entryDate,
        qty,
        initialQty: qty,
        location: locations[i % locations.length],
        unitCost: product.unitCost,
        warehouse: i < 12 ? 'Central' : 'Norte',
        isActive: true,
        createdBy: admin._id,
      });
      lots.push(lot);
    }
    this.logger.log('  → 16 stock lots created');

    // 3. Sales Records (90 days, ABC distribution)
    // A: SKU-001, SKU-004 (high rotation)
    // B: SKU-002, SKU-006 (medium)
    // C: SKU-003, SKU-005, SKU-007, SKU-008 (low)
    const salesVolumes: Record<string, number> = {
      'SKU-001': 8, 'SKU-004': 7,   // Category A
      'SKU-002': 3, 'SKU-006': 3,   // Category B
      'SKU-003': 1, 'SKU-005': 1, 'SKU-007': 1, 'SKU-008': 1, // Category C
    };

    const salesDocs: any[] = [];
    for (let day = 0; day < 90; day++) {
      const date = new Date(now);
      date.setDate(date.getDate() - day);

      for (const product of PRODUCTS) {
        const dailyQty = salesVolumes[product.sku] || 1;
        // Add some randomness
        const qty = Math.max(0, dailyQty + Math.floor(Math.random() * 3) - 1);
        if (qty > 0 && Math.random() > 0.15) { // 85% chance of sale each day
          salesDocs.push({
            timestamp: date,
            sku: product.sku,
            warehouse: 'Central',
            qty,
            unitPrice: Math.round(product.unitCost * 1.5),
            orderId: null,
            guideId: null,
          });
        }
      }
    }
    await this.salesModel.insertMany(salesDocs);
    this.logger.log(`  → ${salesDocs.length} sales records created`);

    // 4. Orders (4 in different states)
    const orders = [
      { orderId: 'ORD-2026-001', status: 'completed', client: 'Hotel W Santiago', completedAt: new Date() },
      { orderId: 'ORD-2026-002', status: 'in_progress', client: 'Falabella Retail', startedAt: new Date() },
      { orderId: 'ORD-2026-003', status: 'pending', client: 'Ripley Home' },
      { orderId: 'ORD-2026-004', status: 'cancelled', client: 'Paris Deco', cancelledAt: new Date() },
    ];

    for (const o of orders) {
      await this.orderModel.create({
        ...o,
        type: 'picking', priority: 'normal', warehouse: 'Central',
        items: [
          { sku: 'SKU-001', name: PRODUCTS[0].name, requestedQty: 5, pickedQty: 0, lots: [], status: 'pending' },
          { sku: 'SKU-004', name: PRODUCTS[3].name, requestedQty: 10, pickedQty: 0, lots: [], status: 'pending' },
        ],
        createdBy: admin._id, notes: '',
      });
    }
    this.logger.log('  → 4 orders created');

    // 5. Guides
    await this.guideModel.create({
      guideId: 'GD-2026-001', type: 'internal', status: 'emitted',
      originWarehouse: 'Central', destinationWarehouse: 'Norte',
      items: [{ sku: 'SKU-006', name: PRODUCTS[5].name, qty: 20, unitCost: 28000, lots: [{ lot: lots[5].lot, qty: 20 }] }],
      emittedBy: admin._id, emittedAt: new Date(), notes: 'Transfer to Norte',
    });

    await this.guideModel.create({
      guideId: 'GD-2026-002', type: 'external', status: 'received',
      client: 'Hotel W Santiago', clientRut: '76.123.456-7', clientAddress: 'Av. Isidora Goyenechea 3000',
      items: [{ sku: 'SKU-001', name: PRODUCTS[0].name, qty: 3, unitCost: 185000, lots: [{ lot: lots[0].lot, qty: 3 }] }],
      emittedBy: admin._id, emittedAt: new Date(Date.now() - 86400000), receivedAt: new Date(), notes: '',
    });

    await this.guideModel.create({
      guideId: 'GD-2026-003', type: 'external', status: 'draft',
      client: 'Falabella Retail', clientRut: '90.749.000-9', clientAddress: 'Av. Pdte. Kennedy 5413',
      items: [
        { sku: 'SKU-002', name: PRODUCTS[1].name, qty: 8, unitCost: 89000, lots: [] },
        { sku: 'SKU-004', name: PRODUCTS[3].name, qty: 15, unitCost: 42000, lots: [] },
      ],
      emittedBy: admin._id, notes: 'Pending picking',
    });

    this.logger.log('  → 3 guides created');
  }
}
