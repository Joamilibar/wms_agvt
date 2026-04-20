# PROMPT — WMS PRO FULLSTACK
# Sistema de Gestión de Bodegas con FIFO, Análisis ABC, Cobertura y Aging Report
# Stack: React 18 + NestJS + MongoDB + Docker

---

## ROL Y CONTEXTO

Eres un arquitecto de software senior especializado en sistemas WMS (Warehouse Management Systems) para empresas de consumo masivo y retail premium. Vas a construir un sistema completo de gestión de bodegas de producción real, con todas las capas: base de datos, API REST, lógica de negocio y frontend.

La empresa es **Cabo de Hornos**, fabricante chileno de ropa de cama y baño de ultra lujo (plumones de ganso alemán, sábanas de hilo largo, featherbeds, almohadas premium, batas y toallas). Sus operaciones requieren trazabilidad por lote, control FIFO estricto, análisis de rotación y sincronización con el ERP BSale.

---

## STACK TECNOLÓGICO OBLIGATORIO

### Frontend
- **React 18** con TypeScript
- **Vite** como bundler
- **React Router v6** para navegación SPA
- **TanStack Query (React Query v5)** para server state, caché y sincronización
- **React Hook Form + Zod** para formularios y validación
- **Recharts** para gráficos (barras ABC, cobertura, tendencias)
- **Tailwind CSS v3** para estilos — tema dark personalizado
- **Axios** para llamadas HTTP con interceptores JWT
- **date-fns** para manejo de fechas

### Backend
- **NestJS v10** con TypeScript
- **Arquitectura modular** por dominio (stock, orders, guides, analytics, bsale)
- **Mongoose v8** como ODM para MongoDB
- **Passport.js + JWT** para autenticación
- **class-validator + class-transformer** para DTOs y validación
- **@nestjs/swagger** con OpenAPI 3.0 para documentación automática
- **Bull + Redis** para colas de trabajo (sincronización BSale en background)
- **Winston** para logging estructurado
- **Helmet + rate-limiting** para seguridad

### Base de Datos
- **MongoDB 7** como base de datos principal
  - Documentos flexibles ideales para lotes con atributos variables
  - Índices compuestos para queries FIFO (sku + entryDate)
  - Aggregation Pipeline para cálculos ABC y cobertura
  - Time Series Collections para histórico de ventas
- **Redis 7** para caché de analytics, sesiones y colas Bull

### Infraestructura
- **Docker + Docker Compose** para desarrollo local
- **Variables de entorno** con @nestjs/config y Joi validation
- Estructura lista para despliegue en **Railway, Render o VPS**

---

## ARQUITECTURA DEL PROYECTO

Genera la siguiente estructura de directorios EXACTA:

```
wms-pro/
├── apps/
│   ├── api/                          # NestJS Backend
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── config/
│   │   │   │   ├── config.module.ts
│   │   │   │   └── configuration.ts  # Variables de entorno tipadas
│   │   │   ├── common/
│   │   │   │   ├── decorators/
│   │   │   │   ├── filters/          # ExceptionFilter global
│   │   │   │   ├── guards/           # JwtAuthGuard, RolesGuard
│   │   │   │   ├── interceptors/     # LoggingInterceptor, TransformInterceptor
│   │   │   │   └── pipes/            # ValidationPipe global
│   │   │   ├── auth/
│   │   │   │   ├── auth.module.ts
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── strategies/
│   │   │   │   │   └── jwt.strategy.ts
│   │   │   │   └── dto/
│   │   │   │       ├── login.dto.ts
│   │   │   │       └── register.dto.ts
│   │   │   ├── users/
│   │   │   │   ├── users.module.ts
│   │   │   │   ├── users.service.ts
│   │   │   │   ├── schemas/user.schema.ts
│   │   │   │   └── dto/
│   │   │   ├── stock/
│   │   │   │   ├── stock.module.ts
│   │   │   │   ├── stock.controller.ts
│   │   │   │   ├── stock.service.ts
│   │   │   │   ├── schemas/
│   │   │   │   │   └── stock-lot.schema.ts
│   │   │   │   └── dto/
│   │   │   │       ├── create-stock-lot.dto.ts
│   │   │   │       └── query-stock.dto.ts
│   │   │   ├── orders/
│   │   │   │   ├── orders.module.ts
│   │   │   │   ├── orders.controller.ts
│   │   │   │   ├── orders.service.ts
│   │   │   │   ├── schemas/order.schema.ts
│   │   │   │   └── dto/
│   │   │   ├── guides/
│   │   │   │   ├── guides.module.ts
│   │   │   │   ├── guides.controller.ts
│   │   │   │   ├── guides.service.ts
│   │   │   │   ├── schemas/guide.schema.ts
│   │   │   │   └── dto/
│   │   │   ├── analytics/
│   │   │   │   ├── analytics.module.ts
│   │   │   │   ├── analytics.controller.ts
│   │   │   │   ├── analytics.service.ts
│   │   │   │   └── dto/
│   │   │   ├── bsale/
│   │   │   │   ├── bsale.module.ts
│   │   │   │   ├── bsale.service.ts
│   │   │   │   ├── bsale.processor.ts  # Bull Worker
│   │   │   │   └── dto/
│   │   │   └── seed/
│   │   │       └── seed.service.ts     # Datos de prueba
│   │   ├── test/
│   │   ├── Dockerfile
│   │   ├── nest-cli.json
│   │   └── package.json
│   │
│   └── web/                          # React Frontend
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── router.tsx
│       │   ├── api/
│       │   │   ├── client.ts         # Axios instance + interceptores
│       │   │   ├── stock.api.ts
│       │   │   ├── orders.api.ts
│       │   │   ├── guides.api.ts
│       │   │   ├── analytics.api.ts
│       │   │   └── bsale.api.ts
│       │   ├── hooks/
│       │   │   ├── useStock.ts
│       │   │   ├── useOrders.ts
│       │   │   ├── useGuides.ts
│       │   │   ├── useAnalytics.ts
│       │   │   └── useAuth.ts
│       │   ├── pages/
│       │   │   ├── Dashboard/
│       │   │   ├── Inventory/
│       │   │   ├── Picking/
│       │   │   ├── Guides/
│       │   │   ├── Analytics/
│       │   │   │   ├── ABCAnalysis/
│       │   │   │   ├── CoverageReport/
│       │   │   │   └── AgingReport/
│       │   │   ├── BSaleConfig/
│       │   │   └── Auth/
│       │   ├── components/
│       │   │   ├── layout/
│       │   │   │   ├── Sidebar.tsx
│       │   │   │   ├── Header.tsx
│       │   │   │   └── Layout.tsx
│       │   │   ├── ui/
│       │   │   │   ├── Badge.tsx
│       │   │   │   ├── Table.tsx
│       │   │   │   ├── Modal.tsx
│       │   │   │   ├── KpiCard.tsx
│       │   │   │   ├── AlertBanner.tsx
│       │   │   │   └── LoadingSpinner.tsx
│       │   │   └── forms/
│       │   │       ├── StockInForm.tsx
│       │   │       ├── OrderForm.tsx
│       │   │       └── GuideForm.tsx
│       │   ├── stores/
│       │   │   └── authStore.ts      # Zustand para auth state
│       │   ├── types/
│       │   │   ├── stock.types.ts
│       │   │   ├── order.types.ts
│       │   │   ├── guide.types.ts
│       │   │   └── analytics.types.ts
│       │   └── utils/
│       │       ├── fifo.utils.ts
│       │       ├── abc.utils.ts
│       │       └── format.utils.ts
│       ├── public/
│       ├── Dockerfile
│       ├── vite.config.ts
│       ├── tailwind.config.ts
│       └── package.json
│
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
└── README.md
```

---

## MODELOS DE BASE DE DATOS (MongoDB Schemas)

### 1. StockLot — Lote de inventario (unidad FIFO)

```typescript
// Cada registro es un lote físico, no un SKU
{
  _id: ObjectId,
  sku: string,                  // Índice — ej: "SKU-001"
  name: string,                 // Nombre del producto
  lot: string,                  // Número de lote — ej: "L2024-001"
  entryDate: Date,              // CAMPO CLAVE FIFO — índice ascendente
  expiryDate: Date | null,
  qty: number,                  // Unidades restantes en este lote
  initialQty: number,           // Unidades originales al ingresar
  location: string,             // Ubicación física — ej: "A-01-01"
  unitCost: number,             // Costo unitario en CLP
  warehouse: string,            // Bodega — ej: "Central", "Norte"
  supplier: string | null,
  bsaleProductId: string | null, // ID del producto en BSale
  isActive: boolean,            // false cuando qty llega a 0
  createdBy: ObjectId,          // ref: User
  createdAt: Date,
  updatedAt: Date
}
// Índices obligatorios:
// { sku: 1, entryDate: 1 }  — para queries FIFO
// { sku: 1, warehouse: 1 }  — para stock por bodega
// { lot: 1 }                — único por bodega
```

### 2. Order — Orden de Picking

```typescript
{
  _id: ObjectId,
  orderId: string,              // "ORD-2024-001" — auto-generado
  type: "picking" | "replenishment",
  status: "pending" | "in_progress" | "completed" | "cancelled",
  priority: "high" | "normal" | "low",
  client: string,
  warehouse: string,
  items: [
    {
      sku: string,
      name: string,
      requestedQty: number,
      pickedQty: number,        // Se actualiza al procesar FIFO
      lots: [                   // Lotes consumidos — trazabilidad
        {
          lotId: ObjectId,      // ref: StockLot
          lot: string,
          entryDate: Date,
          qty: number
        }
      ],
      status: "pending" | "partial" | "completed" | "unavailable"
    }
  ],
  assignedTo: ObjectId | null,  // ref: User
  notes: string,
  guideId: ObjectId | null,     // ref: Guide — generada al completar
  createdBy: ObjectId,
  createdAt: Date,
  startedAt: Date | null,
  completedAt: Date | null,
  cancelledAt: Date | null
}
```

### 3. Guide — Guía de Despacho

```typescript
{
  _id: ObjectId,
  guideId: string,              // "GD-2024-001" — auto-generado
  type: "internal" | "external",
  // Para externa:
  client: string | null,
  clientRut: string | null,
  clientAddress: string | null,
  // Para interna:
  originWarehouse: string | null,
  destinationWarehouse: string | null,
  items: [
    {
      sku: string,
      name: string,
      qty: number,
      unitCost: number,
      lots: [{ lot: string, qty: number }]
    }
  ],
  status: "draft" | "emitted" | "in_transit" | "received" | "cancelled",
  bsaleStatus: "pending" | "synced" | "error" | "not_applicable",
  bsaleDocumentId: string | null,   // ID del documento en BSale
  bsaleShippingId: string | null,
  bsaleSyncedAt: Date | null,
  bsaleError: string | null,
  orderId: ObjectId | null,     // ref: Order — si viene de picking
  emittedBy: ObjectId,
  emittedAt: Date,
  receivedAt: Date | null,
  notes: string
}
```

### 4. SalesRecord — Histórico de ventas (Time Series)

```typescript
// MongoDB Time Series Collection
{
  timestamp: Date,              // Campo ts de la colección
  sku: string,                  // metadata
  warehouse: string,            // metadata
  qty: number,                  // Unidades vendidas/despachadas
  unitPrice: number,
  orderId: ObjectId,
  guideId: ObjectId
}
// Índice automático de MongoDB Time Series sobre timestamp
// Ventana de retención: 2 años
```

### 5. User

```typescript
{
  _id: ObjectId,
  email: string,                // único
  password: string,             // bcrypt hash
  name: string,
  role: "admin" | "supervisor" | "operator",
  warehouse: string,            // Bodega asignada
  isActive: boolean,
  lastLogin: Date | null,
  createdAt: Date
}
```

---

## LÓGICA DE NEGOCIO — IMPLEMENTACIÓN REQUERIDA

### FIFO Engine (stock.service.ts)

```typescript
// Implementar método processFIFO con transacción MongoDB
async processFIFO(
  sku: string,
  requestedQty: number,
  warehouse: string,
  session: ClientSession
): Promise<{ consumed: LotConsumption[]; deficit: number }> {
  // 1. Obtener lotes activos ordenados por entryDate ASC (FIFO)
  // 2. Iterar hasta cubrir requestedQty
  // 3. Descontar qty de cada lote con $inc atómico
  // 4. Registrar trazabilidad: qué lote, cuánto, cuándo
  // 5. Marcar lote como isActive: false si qty === 0
  // 6. Retornar lotes consumidos y déficit (si hay)
  // IMPORTANTE: Todo dentro de MongoDB Session para atomicidad
}
```

### Analytics Service (analytics.service.ts)

```typescript
// Implementar con MongoDB Aggregation Pipeline

// ABC Analysis
async computeABC(
  warehouseId?: string,
  periodDays: number = 90
): Promise<ABCResult[]> {
  // Pipeline:
  // 1. $match SalesRecords del período
  // 2. $group por SKU: suma qty * unitPrice
  // 3. $sort por valor desc
  // 4. $setWindowFields para % acumulado
  // 5. Clasificar: A (<=80%), B (<=95%), C (>95%)
  // 6. $lookup a StockLot para agregar stock actual
}

// Coverage Days
async computeCoverage(warehouseId?: string): Promise<CoverageResult[]> {
  // 1. Ventas diarias promedio por SKU (últimos 90 días)
  // 2. Stock actual por SKU
  // 3. coverage = stock / dailyRate (Infinity si dailyRate === 0)
  // 4. Clasificar: sin_movimiento | critico | alto | normal | bajo
}

// Aging Report
async computeAging(
  warehouseId?: string,
  thresholdDays: number = 90
): Promise<AgingResult[]> {
  // Por lote individual (no por SKU)
  // Calcular días = hoy - entryDate
  // Clasificar por bucket: 0-30 | 31-60 | 61-90 | 91-120 | 121-180 | >180
  // Calcular valor inmovilizado = qty * unitCost
  // Flag risk: ok | medio | alto | critico
}
```

### BSale Integration (bsale.service.ts + bsale.processor.ts)

```typescript
// Implementar con Bull Queue para operaciones asíncronas
// No bloquear el hilo principal con llamadas a API externa

// Operaciones disponibles:
interface BSaleOperations {
  // Sincronizar stock saliente
  syncStockOut(guideId: string): Promise<BSaleSyncResult>;
  
  // Crear guía de despacho en BSale
  createShipping(guideId: string): Promise<BSaleShippingResult>;
  
  // Importar productos desde BSale al WMS
  importProducts(): Promise<ImportResult>;
  
  // Obtener stock actual desde BSale (reconciliación)
  reconcileStock(sku: string): Promise<ReconciliationResult>;
}

// Endpoints BSale a implementar:
// POST https://api.bsale.cl/v1/stocks.json
// GET  https://api.bsale.cl/v1/stocks.json?sku={sku}
// POST https://api.bsale.cl/v1/shippings.json
// GET  https://api.bsale.cl/v1/documents.json
// Headers: { access_token: process.env.BSALE_TOKEN }
```

---

## ENDPOINTS DE LA API (NestJS Controllers)

Implementa TODOS estos endpoints con:
- Decoradores `@ApiOperation`, `@ApiResponse` de Swagger
- Guards JWT en todos excepto `/auth/login`
- DTOs con class-validator en body y query params
- Respuestas paginadas donde aplique

```
# AUTH
POST   /api/auth/login
POST   /api/auth/register
GET    /api/auth/me
POST   /api/auth/refresh

# STOCK
GET    /api/stock                      # Lista paginada de lotes activos
GET    /api/stock/fifo/:sku            # Lotes FIFO de un SKU
GET    /api/stock/summary              # Resumen por SKU (total qty, value)
GET    /api/stock/warehouses           # Lista de bodegas
POST   /api/stock                      # Ingreso de nuevo lote
PATCH  /api/stock/:id                  # Ajuste manual de qty
DELETE /api/stock/:id                  # Inactivar lote

# ORDERS
GET    /api/orders                     # Lista paginada con filtros
GET    /api/orders/:id
POST   /api/orders                     # Crear orden de picking
PATCH  /api/orders/:id/start           # Cambiar a in_progress
POST   /api/orders/:id/process-fifo   # Ejecutar picking FIFO (transacción)
POST   /api/orders/:id/cancel
GET    /api/orders/:id/traceability    # Trazabilidad de lotes consumidos

# GUIDES
GET    /api/guides
GET    /api/guides/:id
POST   /api/guides                     # Crear guía manual
POST   /api/guides/from-order/:orderId # Generar desde orden completada
PATCH  /api/guides/:id/emit
PATCH  /api/guides/:id/receive
PATCH  /api/guides/:id/cancel
POST   /api/guides/:id/sync-bsale      # Encola sync en Bull

# ANALYTICS
GET    /api/analytics/dashboard        # KPIs generales + alertas
GET    /api/analytics/abc              # Análisis ABC completo
GET    /api/analytics/coverage         # Días de cobertura por SKU
GET    /api/analytics/aging            # Aging report por lote
GET    /api/analytics/aging/summary    # Resumen valor inmovilizado
GET    /api/analytics/sales-trend/:sku # Tendencia ventas últimos N días

# BSALE
GET    /api/bsale/status               # Conexión y última sync
POST   /api/bsale/test-connection
POST   /api/bsale/import-products
GET    /api/bsale/sync-jobs            # Estado de colas Bull
POST   /api/bsale/reconcile/:sku

# USERS (solo admin)
GET    /api/users
POST   /api/users
PATCH  /api/users/:id
DELETE /api/users/:id
```

---

## PÁGINAS Y COMPONENTES FRONTEND

### Diseño y Tema
Usa Tailwind CSS con el siguiente tema dark en `tailwind.config.ts`:

```typescript
theme: {
  extend: {
    colors: {
      bg: {
        primary:   '#0f1117',
        secondary: '#161b27',
        tertiary:  '#1e2a3a',
      },
      brand: {
        green:  '#4ade80',
        blue:   '#1a7fe8',
        amber:  '#e8a20f',
        red:    '#e83a18',
        purple: '#7c5abf',
      },
      border: {
        primary:   '#2a3142',
        secondary: '#1e2a3a',
      }
    },
    fontFamily: {
      mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
    }
  }
}
```

### Páginas a implementar

**1. Dashboard** (`/`)
- Grid de 8 KPI cards con datos en tiempo real (TanStack Query, refetch cada 30s)
- Alertas clicables de Aging y Cobertura
- Mini-gráfico de barras Recharts para distribución ABC
- Tabla de últimas 5 órdenes con estado
- Widget de BSale connection status

**2. Inventario FIFO** (`/inventory`)
- Filtro por SKU, bodega, lote
- Agrupación por SKU con expansión de lotes
- Lote FIFO 1° destacado visualmente
- Modal de ingreso de stock con validación Zod
- Indicador de stock crítico (<20 unidades)

**3. Picking** (`/picking`)
- Kanban-style por status (pending / in_progress / completed)
- Modal de nueva orden con selector multi-SKU
- Vista de disponibilidad FIFO en tiempo real al seleccionar SKU
- Botón "Procesar FIFO" con confirmación y feedback de resultado
- Toast de éxito/error con lotes consumidos

**4. Guías de Despacho** (`/guides`)
- Tabs: Internas / Externas / Todas
- Indicador de BSale sync status por guía
- Botón sincronizar con loading state (optimistic update)
- Modal nueva guía con tipo toggle (interna/externa)
- Timeline de estados (draft → emitted → received)

**5. Análisis ABC** (`/analytics/abc`)
- 3 cards resumen con barra de progreso animada (A / B / C)
- Gráfico de torta Recharts (valor de ventas por categoría)
- Tabla completa con filtro por clase
- Columna de barras inline para % propio
- Acción sugerida por SKU con color semántico

**6. Días de Cobertura** (`/analytics/coverage`)
- Panel explicativo con rangos de alerta
- Tabla con barra visual de cobertura
- Ordenar por días DESC por defecto
- Filtro por status (sin_movimiento / critico / alto / normal / bajo)
- Export a CSV

**7. Aging Report** (`/analytics/aging`)
- 6 bucket cards clicables como filtro
- Tabla por lote individual con código de color por risk
- Panel financiero de valor inmovilizado total
- Filtro rápido "Solo alertas +90d"
- Export a CSV/Excel

**8. Configuración BSale** (`/bsale`)
- Formulario de credenciales (token, baseUrl, warehouseId)
- Botón test connection con feedback
- Log de últimas sincronizaciones con estado
- Panel de endpoints disponibles
- Monitor de cola Bull (jobs pendientes / completados / fallidos)

**9. Autenticación** (`/login`)
- Formulario email + password
- JWT almacenado en httpOnly cookie (no localStorage)
- Redirect automático si ya autenticado

---

## DOCKER COMPOSE

```yaml
# docker-compose.yml
version: '3.9'

services:
  mongo:
    image: mongo:7
    restart: unless-stopped
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
      MONGO_INITDB_DATABASE: wms_pro
    volumes:
      - mongo_data:/data/db
      - ./apps/api/src/seed/init.js:/docker-entrypoint-initdb.d/init.js

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "6379:6379"
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data

  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
      MONGODB_URI: ${MONGODB_URI}
      REDIS_URL: ${REDIS_URL}
      JWT_SECRET: ${JWT_SECRET}
      JWT_EXPIRES_IN: 7d
      BSALE_BASE_URL: https://api.bsale.cl/v1
      BSALE_TOKEN: ${BSALE_TOKEN}
    depends_on:
      - mongo
      - redis
    volumes:
      - ./apps/api/src:/app/src

  web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
    restart: unless-stopped
    ports:
      - "5173:5173"
    environment:
      VITE_API_URL: http://localhost:3000/api
    depends_on:
      - api
    volumes:
      - ./apps/web/src:/app/src

volumes:
  mongo_data:
  redis_data:
```

---

## VARIABLES DE ENTORNO (.env.example)

```bash
# MongoDB
MONGO_USER=wms_admin
MONGO_PASSWORD=superSecretPass123
MONGODB_URI=mongodb://wms_admin:superSecretPass123@localhost:27017/wms_pro?authSource=admin

# Redis
REDIS_PASSWORD=redisSecretPass
REDIS_URL=redis://:redisSecretPass@localhost:6379

# JWT
JWT_SECRET=cambiar_por_secreto_de_64_chars_minimo_en_produccion
JWT_EXPIRES_IN=7d

# BSale
BSALE_TOKEN=           # Obtener en BSale: Configuración → API
BSALE_BASE_URL=https://api.bsale.cl/v1

# App
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173

# Seed
SEED_ADMIN_EMAIL=admin@cabodehornos.cl
SEED_ADMIN_PASSWORD=Admin123!
```

---

## SEED DE DATOS

Crea un `SeedService` que al ejecutar `npm run seed` genere:

- **1 usuario admin** (admin@cabodehornos.cl / Admin123!)
- **2 operarios** de bodega
- **8 SKUs** reales de Cabo de Hornos:
  - SKU-001: Plumón Ganso 400 Hilos King
  - SKU-002: Sábanas Hilo Largo Queen 300TC
  - SKU-003: Featherbed Queen Premium
  - SKU-004: Almohada Pluma Liviana 50x70
  - SKU-005: Bata Algodón Pima Talla M
  - SKU-006: Toalla Baño Premium 600gr
  - SKU-007: Plumón Liviano Verano Queen
  - SKU-008: Funda Almohada Bordada 50x70
- **16 lotes de stock** con fechas de ingreso distribuidas entre 10 y 310 días atrás (para que el Aging Report tenga casos reales en cada bucket)
- **Registros de ventas** de los últimos 90 días con los volúmenes que generan una clasificación ABC interesante:
  - SKU-001 y SKU-004: categoría A (alta rotación)
  - SKU-002 y SKU-006: categoría B
  - SKU-003, SKU-005, SKU-007, SKU-008: categoría C
- **4 órdenes** en distintos estados
- **3 guías** (1 interna, 2 externas con estados distintos)

---

## REQUERIMIENTOS NO FUNCIONALES

### Seguridad
- JWT con refresh token rotation
- Contraseñas hasheadas con bcrypt (rounds: 12)
- Rate limiting en endpoints de auth (5 intentos/min)
- Helmet para headers HTTP seguros
- CORS configurado solo para FRONTEND_URL
- Variables sensibles NUNCA en código — solo en .env

### Performance
- TanStack Query con staleTime de 30s para analytics (datos no cambian frecuentemente)
- Índices MongoDB obligatorios en todos los campos de búsqueda frecuente
- Paginación en todos los listados (default: 20 items/página)
- Aggregation Pipeline server-side para ABC y cobertura (no calcular en Node.js)
- Bull Queue para operaciones BSale (no bloquear request HTTP)

### UX
- Loading skeletons en todas las tablas mientras carga
- Toast notifications para todas las acciones (éxito y error)
- Confirmación modal antes de acciones destructivas
- Indicadores de alerta (badges rojos) en navegación lateral cuando hay Aging >90d o Cobertura >180d
- Formularios con validación en tiempo real (React Hook Form + Zod)
- Tabla con sort por columna y filtros persistentes en URL (searchParams)

### Testing
- Al menos 1 test unitario por método del `StockService` que contenga lógica FIFO
- Al menos 1 test de integración del endpoint `POST /api/orders/:id/process-fifo`
- Tests con Jest + Supertest

---

## INSTRUCCIONES DE EJECUCIÓN

Al terminar, el proyecto debe poder levantarse con:

```bash
# 1. Clonar y entrar al directorio
cd wms-pro

# 2. Copiar variables de entorno
cp .env.example .env
# (editar .env con tus valores reales)

# 3. Levantar servicios de infraestructura
docker-compose up mongo redis -d

# 4. Instalar dependencias
cd apps/api && npm install
cd ../web && npm install

# 5. Seed de datos
cd ../api && npm run seed

# 6. Levantar en desarrollo
# Terminal 1:
cd apps/api && npm run start:dev

# Terminal 2:
cd apps/web && npm run dev

# O todo con Docker:
docker-compose up --build

# 7. Acceder
# Frontend:  http://localhost:5173
# API:       http://localhost:3000/api
# Swagger:   http://localhost:3000/api/docs
```

---

## NOTAS FINALES PARA CLAUDE CODE

1. **Comienza siempre por la capa de datos**: Schemas MongoDB → Services → Controllers → Frontend. No al revés.

2. **El FIFO es el corazón del sistema**: La función `processFIFO` en `stock.service.ts` debe ser completamente atómica usando MongoDB Sessions + Transactions. No aceptes soluciones que no garanticen atomicidad.

3. **Los Analytics son operaciones de lectura puras**: Nunca modifiquen datos. Deben ser cacheables (Redis, TTL 5 minutos).

4. **BSale es opcional en runtime**: El sistema debe funcionar 100% aunque no haya token BSale configurado. La integración es aditiva, no bloqueante.

5. **TypeScript estricto**: `strict: true` en ambos tsconfig. Sin `any` explícitos. Tipos compartidos entre API y Web usando una carpeta `packages/shared-types/` si es necesario.

6. **Un solo comando para levantar todo**: `docker-compose up --build` debe funcionar desde cero sin pasos manuales adicionales.

7. **El README.md debe incluir**: diagrama de arquitectura en ASCII, descripción de cada módulo, guía de contribución y documentación de variables de entorno.