# Prompt para Claude Code — calculadora de consumo y cotizador de sabanería

Pegar en Claude Code con el cwd en `C:\temp\wms_agvt`.

---

Lee `docs/sabaneria-consumo-spec.md` completo antes de escribir una línea. Es la
especificación de esta tarea y manda sobre cualquier suposición tuya. Lee también
`CLAUDE.md`: sus convenciones son obligatorias, no sugerencias.

## Qué vas a construir

Una calculadora de consumo de tela y cotizador para sabanería, dentro del módulo
`planning`. Entra modelo + medidas terminadas + tela; sale el consumo en metros lineales,
la orientación del corte, la merma y el costo desglosado. Una cotización confirmada se
congela como `BomRecipe` versionada y de ahí la explota el flujo de producción que ya
existe.

**El catálogo de modelos es abierto.** El usuario crea modelos nuevos desde la pantalla
—con marco, sin marco, doble marco, con traslape, sin traslape, cualquier combinación que
consuma más o menos tela— sin tocar código ni desplegar. Esto no es una fase posterior: es
un requisito de diseño y condiciona cómo se modela la geometría desde el primer commit.

El problema que resuelve: hoy el costeo mide el área de tela contenida en el producto,
pero la tela se compra por metro lineal de un rollo de ancho fijo. En un rollo de 305 cm
cabe una sola encimera a lo ancho en cualquier talla, así que una Single y una King
consumen lo mismo — y el costeo actual le asigna a la Single un 31 % menos. La tabla de
referencia está en la especificación.

## Empieza por acá

`apps/api/src/planning/sheeting/nesting.ts` y su spec, antes que nada.

Es una función pura, sin Mongo, sin NestJS, sin I/O — igual que `engine/mrp.ts` y
`engine/demand-engine.ts`. Es el corazón del cálculo y tiene que ser testeable sola.
La firma está en la especificación.

No avances al servicio hasta que los 8 primeros invariantes de la tabla de tests pasen.
Esos 8 corren sin base de datos.

Después, en el orden de la especificación. Hay un punto donde el orden no es negociable:

**Los `PanelSpec` de encimera y bajera se escriben a mano primero** (paso 3), se validan
contra el Excel, y **recién entonces** se construye la capa de bloques contra ese resultado
conocido (paso 7). El test 12 es el que lo ancla: `panel_simple + marco(F1=15)` tiene que
compilar exactamente a los `PanelSpec` escritos a mano.

Al revés —bloques primero— un error en el vocabulario queda escondido detrás de números que
nadie contrastó, y lo descubres cuando ya hay modelos guardados encima.

Los pasos 1 a 4 ya responden la pregunta cara. Cuando llegues ahí, para y avísame: quiero
validar contra el Excel antes de que sigas.

## Reglas que no se negocian

**Lo que no cabe, falla.** Si ninguna orientación entra en el rollo, devuelve
`FABRIC_TOO_NARROW` con el ancho requerido y el disponible. No redondees, no empalmes por
tu cuenta, no elijas otra tela. Una encimera SuperKing tiene 308 cm de corte y no entra en
un rollo de 305: ese caso tiene que fallar fuerte, porque hoy se costea como si entrara.

**Sin tarifa no hay cotización.** Un taller sin `workshop_rate` devuelve
`NO_WORKSHOP_RATE`. Cero por defecto es peor que un error.

**El ancho de rollo nunca es constante.** El lino convive en 2,90 y 1,35 m. Si escribes un
`305` literal en algún lado fuera de los datos semilla, está mal.

**La geometría se declara, no se programa.** Cada dimensión de un panel es una expresión
lineal sobre variables con nombre (`Σ coef·var + const`), guardada como datos. Alcanza para
toda la sabanería, porque todo es sumar, restar y duplicar medidas.

De ahí salen tres prohibiciones:

- Nada de `eval` ni de fórmulas como texto en la base. Es una superficie de ataque y es
  imposible de testear.
- Nada de una rama por familia en el cálculo. Si escribes `if (family === 'bajera')` dentro
  de `sheeting-calc`, el catálogo dejó de ser abierto. «Sin marco» no es un caso especial:
  es un modelo sin paneles de marco.
- Nada de ejecutar los bloques en tiempo de cálculo. Se compilan a `PanelSpec[]` **al
  guardar el modelo** y se persisten así. Si el cálculo los ejecutara, arreglar un bloque
  mañana cambiaría en silencio la geometría de recetas y órdenes ya congeladas. Mismo
  criterio que `recipeVersion` en `BomRecipe`.

`nesting.ts` y `sheeting-calc.service` solo conocen `PanelSpec`. El constructor y los
bloques viven aparte y no son parte de la ruta de cálculo.

**La mano de obra no entra en la BOM.** La BOM son materiales físicos. El taller es costo
de conversión y vive en `workshop_rates`. Meterlo rompe la explosión de materiales del MRP.

**El costo de tela sale de BSale, no lo inventes.** `BsaleService.getVariantCost()` ya
existe y devuelve `averageCost`; `syncCostsFromBsale` lo baja a `StockLot.unitCost` con
`costSyncedAt`. Lee de ahí. Si no hay costo sincronizado, marca la cotización
`costSource: 'stale'` con la fecha del último sync — nunca un cero silencioso.

**`cuttingScrapPct` es distinto de `scrapPct`.** El que ya existe (0.03) es pérdida de
proceso. El nuevo es desperdicio de corte. Si los mezclas, se cuenta dos veces.

## Convenciones del repo

- Imports con extensión `.js` aunque el archivo sea `.ts` (NodeNext).
- Todo body de request en un DTO con `class-validator`. El DTO es el whitelist: los campos
  que calcula el servidor (`linearMetres`, `wastePct`, `costBreakdown`, `bomRecipeId`) no
  se declaran.
- Controller propio: `@Controller('planning/sheeting')` con `JwtAuthGuard` y `RolesGuard`.
  **No agregues rutas a `PlanningController`** — ya tiene ~40 rutas y 15 dependencias
  inyectadas.
- Roles: lectura y `POST /quote` para cualquier autenticado; guardar cotizaciones para
  `supervisor`; maestros y `freeze` para `admin`.
- Frontend: React Hook Form + Zod, `react-hot-toast`, `confirmDialog` de `lib/confirm.tsx`.
  Nada de `alert` ni `window.confirm`. Archivos nuevos: cero `any`.
- Esquemas versionados siguiendo el patrón de `BomRecipe` y `PlanningParams`: documento
  nuevo por cambio, índice único `{code, version}`, un solo `isActive` por código.

## Lo que está bloqueado — no lo resuelvas adivinando

Cinco datos no están confirmados. Donde toques uno, deja el parámetro configurable con el
default que indica la especificación, un comentario que diga que está pendiente, y
menciónalo al terminar. **No inventes el valor ni lo escondas en un literal.**

1. **Geometría de la bajera.** La hoja suma la caída una vez por eje; no sabemos si los
   80/90 cm vienen ya doblados o son por lado. Implementa la familia bajera con
   `mattressHeightCm` y `tuckCm` como parámetros y la fórmula de la especificación, y deja
   el caso documentado en el test. Es el único punto donde puede cambiar el resultado.
2. Costo de 800TC y 1600TC en BSale (SKU `77219257926914` y `77219271596756`).
3. Si la 500TC vigente es el rollo de 305 o el de 310 cm.
4. Lote de corte real por familia (default 20).
5. Si `averageCost` de una tela viene por metro lineal o por m². Asume metro lineal y deja
   el punto de conversión aislado en una función.

## Tests

Los 18 invariantes de la especificación, con los valores de referencia que trae (rollo 305,
orillo 1 cm, 500TC a $5.364/ml). Los 1 a 8 sin Mongo contra `nesting.ts`; los 12 a 17 sin
Mongo contra el compilador de bloques.

Cuatro que suelen olvidarse: congelar dos veces la misma cotización no puede crear dos
versiones de `BomRecipe`; `directional: true` tiene que bloquear el corte contrahilo;
compilar dos veces los mismos bloques tiene que dar `PanelSpec[]` idéntico; y una geometría
imposible (marco de 30 cm en una funda de 50, que deja el panel central en negativo) se
rechaza **al guardar el modelo**, no en producción.

Antes de decir que terminaste:

```bash
cd apps/api && npm test && npm run build
cd apps/web && npm run build
```

Y corre el rebuild del grafo que pide `CLAUDE.md` al final de la sesión.

## Cómo quiero el avance

Un commit por paso de la lista, con el test correspondiente en el mismo commit. Nada de un
commit gigante al final.

Si algo de la especificación te parece equivocado o incompleto, dilo antes de implementarlo
distinto. Prefiero discutirlo a descubrir después que el modelo cambió sin que nadie lo
decidiera.
