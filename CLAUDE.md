# WMS PRO — Cabo de Hornos

Sistema de gestión de bodegas: trazabilidad FIFO por lote, análisis ABC, cobertura,
aging report, e integración con BSale ERP.

Monorepo con dos apps independientes, cada una con su propio `package.json` y
`node_modules`. No hay workspace raíz: `npm ci` se corre dentro de cada app.

```
apps/api    NestJS 11 · MongoDB 8 (Mongoose) · Redis + BullMQ · JWT
apps/web    React 19 · Vite · TanStack Query · Zustand · Tailwind · Recharts
```

## Arrancar

```bash
cp .env.example .env
docker compose up -d mongo mongo-init redis   # Mongo arranca como replica set
cd apps/api && npm ci && npm run start:dev
cd apps/web && npm ci && npm run dev
```

Swagger en `http://localhost:3000/api/docs`. El prefijo global de la API es `/api`.

Con la base vacía `SeedService` crea **siempre** el primer admin (`SEED_ADMIN_*`) —
`register` es anónimo y solo crea `operator`, así que no hay otra forma de tener
uno. Los datos demo (lotes, órdenes, guías, dos operadores) solo se siembran fuera
de producción, salvo `SEED_DEMO_DATA=true`. En producción el arranque **falla** si
falta `SEED_ADMIN_PASSWORD` o si trae el default de desarrollo.

**Mongo tiene que ser un replica set.** `OrdersService.processFIFO` abre una
transacción, y MongoDB solo las permite sobre un replica set. El compose levanta
uno de un solo nodo con keyfile; `mongo-init` ejecuta `rs.initiate()` una vez.
Desde el host la URI lleva `directConnection=true`, porque el miembro se anuncia
como `mongo:27017`, nombre que solo resuelve dentro de la red de compose.

## El motor FIFO

Es el corazón del sistema y donde hay que ir con más cuidado.

- `StockService.processFIFO` consume lotes por `entryDate` ascendente. El `$inc`
  va **condicionado** a `qty: { $gte: toConsume }`: sin esa guarda el saldo puede
  quedar negativo, porque Mongoose no corre el validador `min: 0` en updates.
- `OrdersService.processFIFO` envuelve todo en `session.withTransaction`, que
  **reintenta el callback** ante errores transitorios. Todo lo que el callback
  toque debe releerse o reiniciarse dentro de él; nada puede venir de fuera de la
  sesión. Acumular sobre estado en memoria produce doble conteo.
- Reservas: `reservedQty` en el lote y `reservedLots` en la orden. Disponible es
  `qty - reservedQty`. Las consultas FIFO de *reserva* leen disponible; las de
  *consumo* leen físico. Toda reserva se libera al cancelar y antes de consumir.
- Los correlativos (`ORD-2026-001`, `GD-2026-001`) salen de la colección
  `counters` vía `findOneAndUpdate` atómico. Nunca uses `countDocuments() + 1`.

Los tests de `stock.service.spec.ts` y `orders.service.spec.ts` anclan estos
invariantes. Si tocas el motor, córrelos: `cd apps/api && npm test`.

## Roles

`admin` > `supervisor` > `operator`. El guard vive en
`common/guards/roles.guard.ts` y se aplica con `@Roles(...)` sobre controllers ya
protegidos por `JwtAuthGuard`.

- Mutaciones de inventario, guías y cancelación de órdenes: `admin` / `supervisor`
- Sync y reconciliación BSale, y administración de usuarios: `admin`
- Picking (iniciar, ejecutar): cualquier rol autenticado

`POST /auth/register` es anónimo y **siempre** crea `operator`; las cuentas con rol
se crean por `POST /users`. El frontend replica la matriz en `App.tsx` (`RoleRoute`)
y en el menú lateral, pero la frontera real es la API.

**Pendiente:** no hay guarda por bodega. Un usuario de "Norte" opera sobre "Central".

## Sesiones

Access token JWT corto (15 min) + refresh token opaco y revocable (7 días),
guardado hasheado en `refresh_tokens`. El refresh **rota**: usar un token ya
rotado revoca toda la familia. El interceptor de `lib/api.ts` renueva y reintenta
una vez ante un 401, compartiendo la promesa para que un bloque de 401 paralelos
no dispare dos refresh (dos refresh concurrentes parecen un replay).

## BSale

La emisión de guías **nunca** va dentro del request de picking. `processFIFO`
crea la guía local con `bsaleStatus: 'pending'`, la enlaza a la orden y encola un
job; `GuidesService.emitToBsale` es idempotente y no hace nada si ya está
`synced`. El `variantId` sale del `bsaleProductId` del lote consumido — nunca de
los dígitos del SKU.

`POST /bsale/sync-stock` encola y devuelve `jobId`; el estado se consulta en
`GET /bsale/sync-jobs/:id`. El sync **archiva** los lotes (`isActive:false` +
`archivedAt`), no los borra, porque órdenes y guías los referencian por ObjectId.
Por eso el índice único `{lot, warehouse}` es parcial sobre `isActive: true`.

En una base creada antes de ese cambio hay que correr una vez:
`db.stocklots.dropIndex('lot_1_warehouse_1')`.

**BSale limita `limit` a 50 en silencio.** Pide 250 y la página trae 50, mientras
`count` reporta el total. Toda lectura de colección pasa por
`BsaleService.fetchAll`, que avanza el offset por lo que llegó y termina en la
página vacía. Un loop que avance por el `limit` pedido lee una fila de cada cinco
— y el sync archiva las otras cuatro como "no reportadas". Ya pasó.

## Analítica

`SalesRecord` se escribe en cada picking, dentro de la misma transacción que el
descuento de stock.

`unitPrice` sale del **precio de venta neto de la línea del documento BSale**,
capturado cuando se crea la orden — no durante el picking, porque eso metería una
llamada externa dentro de la transacción. Las órdenes manuales no traen precio y
caen al `unitCost` del lote.

Cada fila lleva `priceSource` (`bsale_document` | `lot_cost` | `seed`) porque un
ABC ponderado por ingreso y uno ponderado por costo responden preguntas distintas
y no deben leerse como el mismo número. `computeABC` devuelve
`{ items, priceBasis }`, y la pantalla dice explícitamente qué proporción del
valor viene de precio real.

Las lecturas caras (ABC, cobertura, aging, dashboard) pasan por `CacheService`
con TTL de 5 min bajo el prefijo `analytics:`, que se invalida al procesar un
picking. Si Redis no está, se sirve sin caché en vez de fallar.

## Convenciones

- Los imports usan extensión `.js` aunque el archivo sea `.ts` (NodeNext). Jest
  los resuelve vía `moduleNameMapper` en `apps/api/package.json`.
- Todo body de request va en un DTO con `class-validator`. Los tipos inline no
  tienen metadata en runtime, así que el `ValidationPipe` global los deja pasar
  enteros. El DTO es además el whitelist: los campos que el servidor controla
  (`status`, `bsaleStatus`, `emittedAt`, `guideId`) no se declaran.
- Frontend: formularios con React Hook Form + Zod, feedback con `react-hot-toast`,
  confirmaciones con `confirmDialog` de `lib/confirm.tsx` — no `alert` ni
  `window.confirm`.
- `strict` está encendido en ambas apps, pero quedan ~51 anotaciones `: any` en el
  frontend (la mitad en `CreatePickingModal.tsx`). Al tocar un archivo, tipifícalo.

## Packs

BSale marca los packs con `classification: 3` y `unlimitedStock: 1`: **no les lleva
stock** (cero registros en `/stocks.json`). La composición sí la tiene, pero no en
un endpoint propio (`/packs`, `/variants/:id/pack` y `/products/:id/pack` dan
404): viene inline en `pack_details` del producto, como `{ variant, quantity }`.
`POST /api/packs/import-bsale` (admin) la copia a `pack_recipes` con upsert
idempotente; un componente con cantidad 0 en BSale se omite y se reporta en
`warnings`. Las recetas cargadas a mano que BSale no conoce no se tocan.

El stock de un pack se calcula, nunca se almacena:

```
packsDisponibles = min sobre componentes de  floor(disponible / qtyPerPack)
```

No es el mínimo del stock crudo. Con un componente que el pack consume dos veces
las dos lecturas se separan: 5 fundas a 2 por pack alcanzan para 2 packs, no 5.
`limitedBy` en la respuesta nombra el componente que topa el total, que es el que
hay que reponer.

Dos reglas más:

- **Por bodega.** Componentes en bodegas distintas no se arman sin moverlos antes.
- **Disponible, no físico.** Se descuenta `reservedQty`, así que un pack no se
  promete con unidades que otra orden ya tiene comprometidas. La respuesta
  igual trae `packsPhysical` para ver el estante.

Una receta sin componentes vale cero, no infinito.

## Fuente de verdad del inventario

**BSale manda sobre la cantidad. El WMS manda sobre la estructura de lotes.**

BSale no registra lotes, así que no puede ser autoridad sobre algo que no lleva:
el código de lote, la fecha de entrada y la ubicación física son del WMS. Esa
división es lo que permite que el aging report signifique algo.

En consecuencia:

- El sync **reconcilia**, no reconstruye. Un lote cuya cantidad ya coincide con
  BSale no se toca y conserva su `entryDate`. Solo el sobrante sin explicación
  entra como lote nuevo con fecha de hoy, porque solo ese sobrante tiene historia
  desconocida.
- El exceso se descuenta FIFO, del más antiguo primero, y **nunca por debajo de
  lo reservado**: quitarle unidades a un operador que está en el pasillo es peor
  que una diferencia temporal. Lo que no se pudo descontar se reporta.
- Lo que el WMS tiene activo y BSale no reporta, no existe: se archiva.
- `POST /bsale/reconcile/:sku` con `{ "apply": true }` hace lo mismo para un SKU.
  Ambos caminos pasan por `alignSkuWarehouse`, que es el único lugar donde esta
  decisión está implementada.
- `clearExisting: true` sigue existiendo como salida de emergencia: archiva todo
  y reconstruye con fecha "día cero". Se lleva el aging por delante. No es el
  camino normal y el frontend ya no lo pide.
- **El costo también es de BSale.** `/variants.json` no trae costo (el viejo
  `standardCost` siempre daba 0); el número vive en `/variants/:id/costs.json`
  (`averageCost` en CLP + capas FIFO). `syncCostsFromBsale` valoriza todos los
  lotes activos al promedio por SKU y corre al final de cada sync de stock, con
  `POST /bsale/sync-costs`, y el día 1 de cada mes. El costo desembarcado que
  estima la recepción de una OC es provisional hasta ese momento.
- **Trampa operativa:** un lote cargado a mano en el WMS que BSale no conozca
  será revertido por el próximo sync. `StockService.create` deja un `warn` con el
  usuario y el SKU. Si el WMS ve la recepción antes que BSale, hay que registrarla
  también allá.

## Sabanería (consumo de tela y cotizador)

`apps/api/src/planning/sheeting/`, controller propio `/api/planning/sheeting`,
spec en `docs/sabaneria-consumo-spec.md`. La tela se compra por metro lineal de
un rollo de ancho fijo, no por área: `nesting.ts` (puro) evalúa al hilo y
contrahilo y falla con `FABRIC_TOO_NARROW` si no cabe; nunca redondea ni empalma.

- La geometría es **datos**: cada panel es `Σ coef·var + const` (`geometry.ts`),
  sin `eval`. Un modelo es una lista de bloques (`blocks.ts`) que se **compila al
  guardar** y se persiste como `panels`; el cálculo nunca ejecuta bloques, así
  que arreglar un bloque no cambia modelos ya congelados. Sin ramas por familia.
- Crucero, como lo hace el taller: A×L incluye el marco (F 15 arriba y lados);
  cada borde es UNA tira de 2(s+F+s) = 38 cm doblada en dos, con inglete
  (lado + 2F); `s` = 2 cm en todo borde cosido y en la basta simple. Centro
  `A − 2F + 2s × L − F + 2s`. El marco puede ir en otra tela (`fabricSlot`).
- El ancho de rollo vive en `fabric_specs`, nunca en código. El $/ml sale del
  lote que BSale valorizó (`costSyncedAt`); viejo = `stale`, sin costo = error.
- Sin tarifa de taller (`workshop_rates`, por talla y calidad de tela) no hay
  cotización: `NO_WORKSHOP_RATE`, nunca cero. La mano de obra no entra en la BOM.
- `cuttingScrapPct` (merma de corte) es distinto de `scrapPct` (proceso).
- `POST /quotes/:id/freeze` congela una cotización guardada como la siguiente
  versión de `BomRecipe`; es idempotente (`bomRecipeId`).

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `python -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` to keep the graph current (`python3` is not available on this machine)
