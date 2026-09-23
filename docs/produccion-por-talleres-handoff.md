# Producción por talleres — estado y diseño

Handoff escrito el 2026-09-23. Trabajo **no empezado**: esto es el análisis y las
decisiones ya tomadas, para retomar sin repetir la investigación.

## Qué se pidió

Segmentar por taller los productos a producir en la pestaña de Producción, y
poder especificar por producto dónde se confecciona.

Al preguntar por la cardinalidad apareció el requisito real, que no es una
asignación simple: **una línea de producción puede pasar por dos talleres en
secuencia**. El ejemplo del usuario, literal:

> Almohadas Duvet son llenadas en Taller SAPRU y Cerradas en Taller Los Lirios.

Es decir una **ruta con etapas**, no un campo `workshop` por SKU.

## Decisiones confirmadas por el usuario

1. **Una OP por etapa, con traspaso real.** La etapa 1 consume insumos en su
   taller y produce un semiterminado que queda en la bodega de ese taller; la
   etapa 2 lo consume allí y produce el terminado. Cada OP con su tarifa de
   taller. (Se descartó la alternativa de una sola OP con etapas meramente
   informativas.)
2. **Productos sin taller asignado: agrupar en "Sin asignar" y bloquear.** Se
   ven como pendientes pero no se les puede crear OP. Nada se produce en un
   taller equivocado por omisión.

## Hallazgos verificados contra el entorno real

Comprobado el 2026-09-22 contra la base local y la API de BSale.

- **Los talleres ya son bodegas** (`WAREHOUSE_ROLES` incluye `workshop`) y
  `ProductionOrder.workshop` ya los referencia. No hay que crear la entidad.
- **Los tres talleres existen también en BSale** como offices, con el mismo
  nombre: `4 Taller Santa Cruz Los Lirios`, `5 Taller Sapru San Vicente`,
  `6 Taller Antonia Abarzua Maximo`. El traspaso entre talleres es viable sin
  inventar bodegas.
- **BSale ya lleva stock en los talleres**, así que los insumos que hay allí
  están sincronizados:

  | Bodega | Lotes activos | Unidades |
  |---|---|---|
  | Taller Sapru San Vicente | 38 | 1.678,1 |
  | Taller Santa Cruz Los Lirios | 15 | 2.393 |
  | Taller Antonia Abarzua Maximo | 7 | 369 |

- **`bom_recipes` activas = 0.** Hoy la pestaña de Producción no puede emitir
  ninguna OP: `createOrder` rechaza toda línea sin receta activa
  (`Sin receta activa: …`). Esto es independiente de los talleres y hay que
  resolverlo para que el módulo sirva de algo.
- Otros conteos: 617 `planning_items` (105 con `origin: national`),
  81 `workshop_rates`, 1 `production_orders` de prueba.
- Hay 1 lote en una bodega `Central` que no figura ni en las bodegas del WMS ni
  en las offices de BSale — probablemente resto de datos demo. Menor, pero el
  próximo sync lo archivará.

### Riesgo abierto: el SKU del semiterminado

`BsaleService.syncStockFromBsale` paso 6 (`bsale.service.ts:633`) recorre **todos**
los lotes activos sin filtrar por bodega y archiva cualquier par (SKU, bodega)
que `/stocks.json` no reporte. No hay ninguna exclusión hoy.

Por lo tanto, un semiterminado que exista solo en el WMS **será archivado por el
próximo sync** (salvo que tenga `reservedQty > 0`, que en vez de archivar
reporta un error). Las dos salidas:

- **a)** Crear los semiterminados como variantes en BSale. Es lo coherente con
  "BSale manda sobre la cantidad" y no toca el motor de sync.
- **b)** Marcar esos lotes como propios del WMS y excluirlos del barrido. Abre
  una excepción en la regla de fuente de verdad; hay que acotarla muy bien.

Sin resolver. Depende de si los semiterminados ya tienen SKU en BSale, lo que se
sabrá al ver el archivo del usuario (abajo).

## Diseño propuesto

**Colección nueva `production_routes`**, versionada igual que `BomRecipe`:

```
{ sku,
  stages: [ { seq: 1, operation: 'Llenado', workshop: 'Taller Sapru San Vicente', outputSku: 'SEMI-…' },
            { seq: 2, operation: 'Cerrado', workshop: 'Taller Santa Cruz Los Lirios', outputSku: null } ],
  version, isActive }
```

La última etapa produce el SKU terminado; las intermedias producen el
semiterminado, que queda en la bodega de su taller.

Va en colección propia y no en `BomRecipe` porque la receta dice *de qué está
hecho* y la ruta *dónde se hace*: cambiar de taller no debe generar una versión
nueva de receta.

La asignación tampoco va en `PlanningItem` (era la idea inicial, cuando parecía
un solo taller por producto): ese maestro tiene un `supplierId` escalar y no
admite una secuencia de etapas.

**`ProductionOrder` gana** `stageSeq`, `operation`, `routeVersion`, `inputSku` y
`chainId`, para que las OP de un mismo lote de trabajo queden encadenadas y la
etapa 2 no pueda completarse antes que la 1.

**`ProductionService.plan()`** agrupa los candidatos por taller según la etapa
que les toca, más un grupo "Sin asignar" que se muestra pero bloquea la creación.

**`ProductionTab.tsx`** pasa de una tabla plana con un `<select>` de taller único
(línea ~95, aplica a toda la orden) a un bloque por taller. Hoy "Crear orden"
mete todos los candidatos con receta en una sola OP.

## Bloqueado esperando

**El archivo con los talleres por producto**, que el usuario dijo que iba a
compartir. Lo que hay que mirar al recibirlo:

- si trae el **orden** de las etapas y el nombre de cada operación;
- si los **semiterminados ya tienen SKU propio**, o hay que crearlos (decide el
  riesgo abierto de más arriba).

## Archivos que tocar

| Ruta | Qué |
|---|---|
| `apps/api/src/planning/schemas/production-route.schema.ts` | nuevo |
| `apps/api/src/planning/schemas/production-order.schema.ts` | campos de etapa |
| `apps/api/src/planning/production/production.service.ts` | `plan()` agrupado, creación encadenada |
| `apps/api/src/planning/dto/production.dto.ts` | DTOs de ruta |
| `apps/web/src/components/Planning/ProductionTab.tsx` | segmentación por taller |

Referencias útiles: `workshop-rate.schema.ts` (tarifa por taller, ya cargada),
`warehouses.service.ts` (`namesFor('production')`, filtro por rol `workshop`).
