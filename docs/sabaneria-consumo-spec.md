# Calculadora de consumo y cotizador de sabanería

Especificación para implementación. **Estado: sin implementar.**
Autor: Joamil | Freelance Developer · joamilibarra@gmail.com · 21-09-2026

Deriva del modelo v1.1 validado contra `Costos Actualizados para BSale 2026 ACTUAL.xlsx`,
hojas `REV ADR  Sábanas y Fdas Tiendas` y `Cubreplumones y Fundas Lino`.

---

## Por qué

El costeo actual mide el **área de tela contenida en el producto**. La tela no se compra
por área: se compra por metro lineal de un rollo de ancho fijo, y lo que sobra a lo ancho
se paga igual.

En un rollo de 305 cm cabe **una sola encimera a lo ancho, en cualquier talla**. El corte
avanza siempre 3,09 m. Una encimera Single y una King consumen exactamente lo mismo; la
hoja le asigna a la Single un 31 % menos.

| Encimera 500TC | Corte (cm) | ml/un | Merma real | Costo hoja | Costo real | Δ |
|---|---|---|---|---|---|---|
| Single | 198×309 | 3,09 | 35,1 % | $10.760 | $16.575 | **+54 %** |
| Twin | 213×309 | 3,09 | 30,2 % | $11.575 | $16.575 | **+43 %** |
| Full 135 | 238×309 | 3,09 | 22,0 % | $12.934 | $16.575 | +28 % |
| Queen | 263×309 | 3,09 | 13,8 % | $14.292 | $16.575 | +16 % |
| King | 288×309 | 3,09 | 5,6 % | $15.651 | $16.575 | +6 % |
| SuperKing | 308×309 | — | **no cabe** | $16.738 | — | — |

Tres consecuencias que el sistema debe capturar:

- La **SuperKing (308 cm de corte) no entra en el rollo de 305 cm**. Hoy se costea como si
  entrara. El cálculo tiene que fallar explícito, no redondear.
- Las **bajeras se cortan contrahilo**. Al hilo la merma sube de 4,9 % a ~28 %. La
  orientación no es un detalle de taller: es parte del costo.
- Para tallas chicas conviene un rollo angosto. El mismo 3,09 ml en un rollo de 200 cm
  cuesta un tercio menos.

## Qué se agrega

Un generador de recetas dentro de `planning`. Entra modelo + medidas terminadas + tela;
sale el consumo, el costo y —cuando se confirma— una `BomRecipe` versionada. De ahí en
adelante el flujo de producción ya existente la explota sin cambios.

Nada de esto reemplaza el motor FIFO, el MRP ni el sync de BSale. Se apoya en ellos.

---

## Modelo de cálculo

Cuatro niveles, cada uno independiente y testeable por separado.

### 1 · Pieza

Una pieza es un rectángulo de corte. Sus dos lados salen de la medida útil más lo que
consumen bastas y costuras:

```
ancho_corte = A_util + basta_izq + basta_der + n_costuras_ancho × s
largo_corte = L_util + basta_sup + basta_inf + n_costuras_largo × s
```

- Una basta simple consume `d`; una basta doble consume `2d`.
- La **doble puntada no consume tela**: solo exige un doblez mínimo. Es un atributo de
  confección, no de consumo. No sumarla.
- `s` es el margen de costura por unión.

### 2 · Geometría del modelo

Un modelo declara cuántos paneles tiene el producto y cuánto mide cada uno. **El catálogo
de modelos es abierto**: el usuario crea modelos nuevos desde la pantalla —con marco, sin
marco, doble marco, con traslape, sin traslape, cualquier combinación que consuma más o
menos tela— sin tocar código ni desplegar. Cómo, en la sección «Constructor de modelos».

Los modelos que se describen abajo son los que vienen precargados. Son ejemplos del
vocabulario, no el catálogo completo ni casos especiales en el código.

**Encimera crucero.** La medida que entra es la **terminada**. El marco lleva corte a 45°
en las esquinas, así que cada tira de marco mide el lado correspondiente más dos veces el
ancho del marco (el inglete aporta material en ambos extremos). El panel central se reduce
por el ancho del marco en los cuatro lados.

**Bajera elasticada completa.** La medida que entra es la **del colchón**:

```
ancho_corte = ancho_colchon + 2 × (altura_colchon + agarre) + costura
largo_corte = largo_colchon + 2 × (altura_colchon + agarre) + costura
```

`agarre` = 10 cm por defecto (lo que entra bajo el colchón).

> **Bloqueante.** La hoja actual calcula `(ancho + caída + 16) × (largo + caída)`: suma la
> caída **una vez por eje** y la costura solo al ancho. Si la caída cargada (80/90 cm) ya
> viene doblada, falta únicamente la costura en el largo; si es de un lado, falta una caída
> entera en cada eje. **Confirmar con el taller antes de implementar esta familia.** El
> resto del modelo no depende de esto.

**Funda de almohada.** Frente + reverso + traslape. En lino lleva además marco (4 o 5 cm),
que la línea de algodón no tiene.

**Cubreplumón.** Frente + reverso + traslape + huincha.

### 3 · Encaje en el rollo

Aquí es donde el cálculo deja de ser aritmética de áreas.

```
W_util = W_rollo − 2 × orillo
```

Para cada pieza se evalúan dos orientaciones y se toma la de menor consumo:

- **Al hilo** — el ancho de la pieza cruza el rollo, el largo avanza.
  Requiere `ancho_corte ≤ W_util`. Piezas a lo ancho: `floor(W_util / ancho_corte)`.
  Consumo: `largo_corte / piezas_a_lo_ancho`.
- **Contrahilo** — la pieza rota 90°.
  Requiere `largo_corte ≤ W_util`. Simétrico.

Si **ninguna** orientación cabe, el cálculo devuelve un error identificable
(`FABRIC_TOO_NARROW`) con el ancho requerido y el disponible. No se redondea, no se
empalma en silencio. El empalmado es una decisión de producto, no un fallback.

El consumo resultante se reparte sobre el **lote de corte**: tender 20 encimeras juntas
amortiza el sobrante de los extremos. El lote es parámetro por familia.

> **Restricción textil.** Contrahilo no siempre es admisible: hay telas con caída o
> estampado direccional. `FabricSpec.directional` bloquea la rotación. Cuando está activo,
> solo se evalúa al hilo.

### 4 · Costo

Dos costos en paralelo, siempre ambos:

- **Teórico** — m² netos × $/m². Es lo que calcula la hoja hoy. Se mantiene solo para
  comparar y poder explicar la diferencia a quien viene del Excel.
- **Real** — metros lineales × (1 + merma_corte) × $/ml. **Este es el que manda.**

Más taller, empaque, traslado e insumos. El desglose viaja siempre en la respuesta: un
costo total sin sus partes no se puede discutir con el taller.

**El costo de la tela sale de BSale, por SKU.** `BsaleService.getVariantCost()` ya devuelve
`averageCost` desde `/variants/:id/costs.json`, y `syncCostsFromBsale` lo baja a
`StockLot.unitCost` con `costSyncedAt`. La calculadora lee de ahí, no hace su propia
llamada. Si el SKU no tiene costo sincronizado, la cotización sale marcada
`costSource: 'stale'` con la fecha del último sync — nunca con un cero silencioso.

> **Unidad.** `averageCost` de una tela viene por **metro lineal**, no por m². Verificarlo
> contra una variante conocida antes de dar por buena la primera cotización; si viniera por
> m², la conversión es `× W_rollo`.

---

## Esquemas

Todos en `apps/api/src/planning/schemas/`, colecciones en snake_case, `timestamps: true`.

### `fabric-spec.schema.ts` → `fabric_specs`

La tela como insumo físico. Una por SKU de tela.

| Campo | Tipo | Notas |
|---|---|---|
| `sku` | string | único, indexado. Enlaza con `PlanningItem` y con la variante BSale |
| `name` | string | |
| `rollWidthCm` | number | min 1. **El dato que decide todo el encaje** |
| `selvageCm` | number | orillo por lado, default 1 |
| `directional` | boolean | default false; true bloquea el corte contrahilo |
| `quality` | string | `500TC`, `800TC`, `1600TC`, `Lino`, `180H` |
| `bsaleVariantId` | string \| null | para `getVariantCost` |
| `isActive` | boolean | |

Carga inicial: 500TC 305 cm, 500TC 310 cm, 800TC, 1600TC, Lino 290 cm, Lino 135 cm,
180H 280 cm.

> Los dos anchos de lino (2,90 y 1,35 m) conviven en producción. El ancho **no puede** ser
> constante en ningún punto del código.

### `sheeting-model.schema.ts` → `sheeting_models`

Un modelo. Versionado igual que `BomRecipe`: una cotización guarda la versión con que se
calculó, así que editar un modelo no reescribe la historia.

| Campo | Tipo | Notas |
|---|---|---|
| `code` | string | `ENCIMERA_CRUCERO`, `BAJERA_ELASTICADA`, … Lo define el usuario al crear |
| `name` | string | nombre visible |
| `family` | enum | `encimera` \| `bajera` \| `funda` \| `cubreplumon` \| `otro` |
| `version` / `isActive` | number / boolean | índice único `{code, version}` |
| `vars` | `Record<string, number>` | parámetros del modelo: `F1`, `F2`, `O`, `T`, `Hu`, `s`… |
| `panels` | `PanelSpec[]` | geometría compilada — ver abajo |
| `blocks` | `BlockRef[]` | de qué bloques salió, para poder reabrirlo en el constructor |
| `hems` | objeto | basta por borde, `simple` o `doble` |
| `cutBatchUnits` | number | lote de corte, default 20 |
| `supplies` | `{sku, qty, uom}[]` | elástico, cierre, bolillo, huincha |
| `validRange` | objeto | rango de medidas en que el modelo tiene sentido |
| `createdBy` / `notes` | | |

#### `PanelSpec` — la primitiva

Un panel es un rectángulo con dos dimensiones, y cada dimensión es una **expresión lineal
sobre variables con nombre**:

```ts
export interface Term { var: string; coef: number }
export interface Dimension { terms: Term[]; const: number }   // Σ coef·var + const

export interface PanelSpec {
  role: string;        // etiqueta informativa: 'centro', 'marco_ancho', 'traslape'…
  count: number;       // cuántas piezas iguales
  width: Dimension;
  length: Dimension;
  mitred45: boolean;   // el inglete ya viene sumado en `length`; esto es para el taller
}
```

Variables disponibles: las medidas de la cotización (`A` ancho terminado, `L` largo
terminado, `H` altura de colchón) y los `vars` del modelo (`F1`, `F2`, `O`, `T`, `Hu`,
`s`…). Evaluar una dimensión es un producto punto, nada más.

**Una expresión lineal alcanza para toda la geometría de sabanería** —todo es sumar,
restar y duplicar medidas— y a cambio es serializable, editable en pantalla, testeable y
segura. Nada de `eval` ni de fórmulas como texto: un `eval` sobre datos de base es una
superficie de ataque y además imposible de testear.

Ejemplos, con `s` = margen de costura:

| Modelo | Panel | `width` | `length` | `count` |
|---|---|---|---|---|
| Encimera sin marco | centro | `A + 2s` | `L + 2s` | 1 |
| Encimera crucero | centro | `A − 2F1 + 2s` | `L − 2F1 + 2s` | 1 |
| | marco al ancho | `F1 + 2s` | `A + 2F1` | 2 |
| | marco al largo | `F1 + 2s` | `L + 2F1` | 2 |
| Doble marco | marco interior | `F2 + 2s` | `A + 2F1 + 2F2` | 2 |
| Bajera elasticada | único | `A + 2H + 2T + s` | `L + 2H + 2T + s` | 1 |
| Funda con traslape | frente | `A + 2s` | `L + 2s` | 1 |
| | reverso | `A + 2s` | `L + 2s` | 1 |
| | traslape | `A + 2s` | `O + 2s` | 1 |
| Funda sin traslape | frente/reverso | igual, sin la tercera fila | | |

El inglete a 45° del marco aporta material en ambos extremos de la tira: por eso
`A + 2F1` y no `A`. Sin marco, las filas de marco simplemente no existen — no hay una
rama `if (frameWidth)` en ningún lado.

### `workshop-rate.schema.ts` → `workshop_rates`

La lista de precios del taller, versionada. Hoy en la hoja es un valor plano por familia
que en la práctica varía por medida.

| Campo | Tipo |
|---|---|
| `workshop` | string (referencia a `Warehouse`) |
| `modelCode` | string |
| `sizeLabel` | string \| null (null = aplica a toda la familia) |
| `rate` | number (CLP por unidad) |
| `validFrom` / `validTo` | Date |
| `version` / `isActive` | number / boolean |

Resolución: coincidencia exacta de `sizeLabel` primero, luego el fallback de familia, luego
error `NO_WORKSHOP_RATE`. Nunca cero por defecto.

### `sheeting-quote.schema.ts` → `sheeting_quotes`

Una cotización guardada, con todo lo necesario para reproducirla.

Entrada (`modelCode` + `modelVersion`, `fabricSku`, medidas terminadas, `qty`, `workshop`,
`channel`), salida completa (piezas, ml, orientación elegida, merma, desglose de costo,
márgenes, PVP) y trazabilidad (`paramsVersion`, `costSource`, `costSyncedAt`, `createdBy`,
`bomRecipeId` una vez congelada).

### `PlanningParams` — campos nuevos

Siguiendo el patrón existente (documento nuevo por cambio, la corrida guarda la versión):

```ts
// ── sabanería ──────────────────────────────────────────────────────────────
cuttingScrapPct        // merma de corte sobre el metraje, default 0.03
defaultTuckCm          // agarre bajo el colchón, default 10
defaultSelvageCm       // orillo por lado, default 1
defaultCutBatchUnits   // lote de corte, default 20
marginByChannel        // { tienda: 3.0, hoteleria: 2.5 }
vatRate                // default 0.19
```

`cuttingScrapPct` es **distinto** de `scrapPct` (0.03) que ya existe para producción. Ese
es pérdida de proceso; este es desperdicio de corte. Mezclarlos cuenta dos veces.

---

## Constructor de modelos

El usuario tiene que poder crear un modelo nuevo sin pedirle nada a un desarrollador. Pero
no se le puede pedir que escriba expresiones lineales. La capa intermedia son **bloques**.

### Bloques

Un bloque es una función pura que recibe parámetros y devuelve paneles:

```ts
export type Block = (vars: Record<string, number>) => PanelSpec[];
```

El catálogo inicial:

| Bloque | Parámetros | Qué agrega |
|---|---|---|
| `panel_simple` | — | Un panel del tamaño terminado |
| `marco` | `F` ancho, `mitred` | 4 tiras y encoge el panel central en `2F` por eje |
| `marco_doble` | `F1`, `F2` | Dos anillos concéntricos; el central encoge `2(F1+F2)` |
| `reverso` | — | Duplica el panel principal |
| `traslape` | `O` | Un panel de `O` de alto al ancho del producto |
| `caida_elastica` | `H`, `T` | Suma `2(H+T)` a ambos ejes del panel |
| `huincha` | `Hu` | Tiras perimetrales de `Hu` |
| `basta` | por borde, simple/doble | Suma a las dimensiones sin crear paneles |
| `tira_libre` | `w`, `l`, `count` | Escotilla para lo que no encaje en lo anterior |

Un modelo es una lista ordenada de bloques con sus parámetros. «Encimera crucero» es
`panel_simple` + `marco(F1=15, mitred)` + `basta`. «Funda king sin traslape» es
`panel_simple` + `reverso` + `basta`. Combinaciones que hoy no existen —doble marco con
traslape, por decir— salen de componer, no de programar.

### Compilar al guardar, no al calcular

Cuando el usuario guarda el modelo, los bloques se **compilan a `PanelSpec[]` y se
persisten así**. `blocks` queda guardado solo para poder reabrir el modelo en el
constructor.

Esto importa: si el cálculo ejecutara los bloques en cada cotización, arreglar un bloque
mañana cambiaría en silencio la geometría de modelos ya congelados en recetas y órdenes de
producción. Compilado y versionado, un modelo significa siempre lo mismo. Es el mismo
criterio que ya usa `BomRecipe` con `recipeVersion`.

`nesting.ts` y `sheeting-calc.service` solo conocen `PanelSpec`. El constructor y los
bloques viven aparte y no son parte de la ruta de cálculo.

### Validar antes de activar

Un modelo no pasa a `isActive` sin cumplir, sobre todo su `validRange`:

- Toda dimensión evalúa **> 0**. Un marco de 30 cm en una funda de 50 deja el panel central
  en negativo; eso se rechaza al guardar, no en producción.
- Al menos una tela activa acepta todos sus paneles. Si ninguna, error con el ancho que
  haría falta.
- Merma > 25 % en el rango típico: se guarda, pero con aviso visible.

### Pantalla

`POST /planning/sheeting/models/preview` compila los bloques, corre el encaje sobre medidas
de muestra y devuelve paneles, metros lineales, orientación, merma y costo — **sin
persistir nada**. La pantalla la llama con debounce mientras el usuario mueve los
parámetros, así que el efecto de un marco más ancho se ve en metros y en pesos antes de
guardar.

El camino frecuente no es crear de cero sino **duplicar y editar**: se abre un modelo
existente, se cambia un bloque y se guarda con código nuevo. Ese botón es obligatorio.

Junto a los números va un esquema de los paneles sobre el ancho del rollo. No es adorno: es
lo que hace evidente que una pieza de 308 cm no entra en 305, y lo que el taller mira para
saber cómo tender.

---

## Servicios

`apps/api/src/planning/sheeting/`:

### `nesting.ts` — función pura, sin dependencias

```ts
export type Orientation = 'al_hilo' | 'contrahilo';

export interface NestingResult {
  orientation: Orientation;
  piecesAcross: number;
  linearMetresPerUnit: number;
  rollAreaM2: number;
  netAreaM2: number;
  wastePct: number;
}

export function nestPiece(
  widthCm: number,
  lengthCm: number,
  usableWidthCm: number,
  opts: { directional?: boolean; batchUnits?: number },
): NestingResult | null;   // null = no cabe en ninguna orientación
```

Pura y sin I/O a propósito: es el corazón del cálculo y tiene que ser testeable sin Mongo,
igual que `mrp.ts` y `demand-engine.ts`.

### `sheeting-calc.service.ts`

Orquesta: resuelve modelo y tela, arma los paneles, llama a `nestPiece` por panel, suma,
aplica merma, resuelve costo de tela y tarifa de taller, agrega empaque/traslado/insumos,
aplica margen por canal y devuelve el desglose.

### `sheeting-recipes.service.ts`

Congela una cotización como `BomRecipe`:

- Un componente por tela, `uom: 'm'`, `qty` = metros lineales por unidad, `scrapPct` =
  merma de corte de esa cotización.
- Un componente por insumo (`uom: 'un'`).
- `version` = siguiente para ese `parentSku`; la anterior pasa a `isActive: false`.
- `notes` deja registrado modelo, versión, tela, orientación y merma.
- `setBy` = usuario.

**Invariante:** congelar dos veces la misma cotización no crea dos versiones. Guardar
`bomRecipeId` en la cotización y devolver la existente si ya está.

La mano de obra **no** entra como componente de la BOM. La BOM son materiales físicos; el
taller es costo de conversión y vive en `workshop_rates`. Meterlo en la BOM rompería la
explosión de materiales del MRP.

### `sheeting.controller.ts`

Controller propio, **no** agregar a `PlanningController` — ya tiene ~40 rutas y 15
dependencias inyectadas.

```
@Controller('planning/sheeting')
@UseGuards(JwtAuthGuard, RolesGuard)
```

| Método | Ruta | Rol | Qué hace |
|---|---|---|---|
| GET | `/models` | autenticado | modelos activos |
| GET | `/models/:code` | autenticado | modelo con sus `blocks`, para reabrirlo |
| GET | `/blocks` | autenticado | catálogo de bloques y sus parámetros |
| POST | `/models/preview` | supervisor | compila y calcula **sin persistir** |
| POST | `/models` | admin | compila, valida y crea versión |
| POST | `/models/:code/duplicate` | admin | copia como base de uno nuevo |
| GET | `/fabrics` | autenticado | telas con ancho y costo vigente |
| POST | `/fabrics` | admin | |
| GET | `/rates` | supervisor | tarifas de taller |
| POST | `/rates` | admin | |
| **POST** | **`/quote`** | autenticado | **calcula, no persiste** |
| POST | `/quotes` | supervisor | guarda una cotización |
| GET | `/quotes` | autenticado | historial, filtrable |
| POST | `/quotes/:id/freeze` | admin | congela como `BomRecipe` |

`POST /quote` es idempotente y sin efectos. Es el que usa la pantalla mientras el usuario
tipea.

Todo body en DTO con `class-validator`. Los campos que calcula el servidor
(`linearMetres`, `wastePct`, `costBreakdown`, `bomRecipeId`) **no se declaran en el DTO**:
el DTO es el whitelist.

---

## Frontend

`apps/web/src/pages/Cotizador.tsx`, en el menú bajo Planificación.

Formulario con React Hook Form + Zod: modelo, tela, medidas terminadas, cantidad, taller,
canal. Recalcula con debounce contra `POST /planning/sheeting/quote`.

El resultado muestra, en este orden:

1. **Metros lineales por unidad y total** — el número que se le pide al proveedor.
2. **Orientación del corte y piezas a lo ancho** — instrucción para el taller.
3. **Merma**, con el área neta al lado. Si supera el 25 %, aviso visible sugiriendo un
   rollo más angosto.
4. **Desglose de costo**: tela / taller / empaque / traslado / insumos, y el total.
5. **PVP** neto y con IVA, con el factor de margen aplicado a la vista.
6. **Costo teórico por área**, en gris, como referencia — con una nota de una línea
   explicando que es el criterio del Excel y por qué difiere.

Cuando el cálculo devuelve `FABRIC_TOO_NARROW`, la pantalla dice qué ancho hace falta y
ofrece las telas activas que sí lo cubren. Un error mudo aquí manda a producción un corte
imposible.

Feedback con `react-hot-toast`, confirmaciones con `confirmDialog`. Nada de `alert` ni
`window.confirm`. Archivo nuevo, así que sin `any`.

### `ModelosSabaneria.tsx`

Lista de modelos con su familia, versión activa y en cuántas cotizaciones se usó. Botones
de **duplicar** y **editar** (editar crea versión nueva, nunca pisa la vigente).

El editor es la lista de bloques del modelo. Cada bloque muestra sus parámetros como campos
numéricos con unidad, y se agrega o quita desde el catálogo de `GET /blocks`. A la derecha,
siempre visible:

- Los paneles resultantes con sus medidas ya evaluadas para una talla de muestra.
- El esquema del tendido sobre el ancho del rollo.
- Metros lineales, orientación, merma y costo.

Todo eso sale de `POST /models/preview` con debounce. El usuario ve el efecto de mover el
marco de 15 a 20 cm en metros y en pesos antes de guardar nada.

Al guardar, los errores de validación se muestran por panel —«el panel central queda en
−10 cm con estas medidas»— y no como un mensaje global.

---

## Tests

Los invariantes que no pueden romperse. Cada uno con su caso:

| # | Invariante | Caso |
|---|---|---|
| 1 | El encaje toma la orientación de menor consumo | Bajera Queen 261×290 en rollo 305 → contrahilo, 2,61 ml |
| 2 | Lo que no cabe, falla | Encimera SuperKing 308×309 en rollo 305 → `FABRIC_TOO_NARROW` |
| 3 | …y cabe en el rollo correcto | La misma en rollo 310 → al hilo, 3,09 ml |
| 4 | El consumo no escala con la talla cuando cabe una sola pieza | Encimera Single y King en rollo 305 → ambas 3,09 ml |
| 5 | `directional` bloquea la rotación | Bajera Queen con `directional: true` → al hilo o error, nunca contrahilo |
| 6 | El lote amortiza | 2 piezas a lo ancho → la mitad de ml por unidad |
| 7 | La doble puntada no consume tela | Misma medida, `double` vs `single` a igual `d` → mismo consumo |
| 8 | El marco a 45° suma el inglete | Tira de marco = lado + 2 × ancho de marco |
| 9 | Congelar es idempotente | Dos `freeze` sobre la misma cotización → una sola versión |
| 10 | Sin tarifa no hay cotización | Taller sin `workshop_rate` → `NO_WORKSHOP_RATE`, no cero |
| 11 | Costo desactualizado se declara | Tela sin `costSyncedAt` reciente → `costSource: 'stale'` |
| 12 | Los bloques reproducen la geometría conocida | `panel_simple + marco(F1=15)` compila a los mismos `PanelSpec` que la encimera crucero de referencia |
| 13 | Sin marco no hay paneles de marco | El mismo modelo sin el bloque `marco` → un solo panel, `A + 2s` × `L + 2s` |
| 14 | Doble marco encoge el centro dos veces | `marco_doble(F1, F2)` → centro `A − 2F1 − 2F2 + 2s` |
| 15 | Traslape es opcional y aditivo | Funda con y sin `traslape` → difieren exactamente en un panel de `O + 2s` |
| 16 | Geometría imposible se rechaza al guardar | Marco de 30 cm en funda de 50 → centro negativo → error de validación |
| 17 | Compilar es determinista y estable | Compilar dos veces los mismos bloques → `PanelSpec[]` idéntico |
| 18 | Editar un bloque no reescribe el pasado | Cambiar el código de `marco` no altera un modelo ya guardado |

Los 1 a 8 corren contra `nesting.ts` sin Mongo; los 12 a 17, contra el compilador de
bloques, también sin Mongo.

El 12 es el que ancla todo lo demás: si la capa de bloques reproduce exactamente la
encimera crucero que ya está validada contra el Excel, el vocabulario es correcto.

Valores de referencia para fijar los tests (rollo 305, orillo 1 cm, 500TC a $5.364/ml):

| Producto | Corte | ml | Orientación | Merma |
|---|---|---|---|---|
| Encimera Queen | 263×309 | 3,09 | al hilo | 13,8 % |
| Encimera King | 288×309 | 3,09 | al hilo | 5,6 % |
| Bajera Queen | 261×290 | 2,61 | contrahilo | 4,9 % |
| Bajera King | 286×290 | 2,86 | contrahilo | 4,9 % |
| Bajera SuperKing | 306×290 | 3,06 | contrahilo | 4,9 % |

---

## Orden de implementación

1. `nesting.ts` + sus tests. Es autónomo y es donde está el valor.
2. `PanelSpec`, `Dimension` y el evaluador de expresiones lineales.
3. `FabricSpec` y `SheetingModel` + carga inicial de telas y de encimera/bajera,
   escribiendo los `PanelSpec` a mano. **Todavía sin bloques.**
4. `sheeting-calc.service.ts` con costo de tela desde `StockLot.unitCost`.
5. `WorkshopRate` + tarifas reales.
6. Controller, DTOs y pantalla de cotización.
7. Compilador de bloques + tests 12 a 17, verificando que reproduce los `PanelSpec`
   escritos a mano en el paso 3.
8. Constructor de modelos en pantalla, con preview y duplicar.
9. Fundas y cubreplumón, ya como modelos armados con bloques.
10. Lino (dos anchos, marco).
11. `freeze` → `BomRecipe`.

Los pasos 1 a 4 ya responden la pregunta cara —cuánta tela y cuánto cuesta— y se pueden
validar contra el Excel antes de construir el resto.

El orden importa: los `PanelSpec` de encimera y bajera se escriben a mano primero, se
validan contra el Excel, y recién entonces se construye la capa de bloques **contra ese
resultado conocido**. Al revés, un error en el vocabulario de bloques queda escondido
detrás de números que nadie contrastó.

---

## Pendientes que bloquean

| Qué | Por qué bloquea | Quién |
|---|---|---|
| Geometría de la bajera: la caída 80/90 ¿va doblada o por lado? | Cambia el consumo de todas las bajeras | Taller |
| Costo 800TC y 1600TC en BSale (SKU `77219257926914` y `77219271596756`) | No existen en el libro; los valores actuales ($22.669 y $77.920/ml) son 4,2× y 14,5× el 500TC, sin origen | Importaciones |
| ¿La 500TC vigente es el rollo 305 o el 310? | El 310 es más barato ($5.268 vs $5.364/ml) y hace que la SuperKing quepa | Importaciones |
| Lote de corte real por familia | Amortiza el desperdicio; hoy es un supuesto de 15–40 un | Taller |
| Lista de tarifas de taller por medida | Hoy plana por familia; sin ella `NO_WORKSHOP_RATE` en todo | Taller |
| Merma de corte medida | El 3 % cargado es independiente del encaje, que pesa entre 4,9 % y 35,1 % | Taller |
| ¿`averageCost` de tela viene por ml o por m²? | Factor 3,05 de diferencia | Verificable contra una variante conocida |

---

## Fuera de alcance

- Optimización de nesting multi-pieza (empaquetar encimera y fundas en el mismo tendido).
  El modelo actual encaja pieza por pieza. Es una mejora real, pero exige un algoritmo de
  bin-packing 2D y no es lo que separa hoy el costo real del costeado.
- Empalmado automático de piezas más anchas que el rollo.
- Geometría no rectangular: piezas curvas, cortes al bies, alforzas con pliegue. El
  vocabulario de bloques cubre rectángulos y tiras, que es toda la sabanería actual. Si
  aparece un modelo que no se puede expresar así, el bloque `tira_libre` da salida y el
  caso se conversa — no se fuerza con un parche.
- Expresiones no lineales en `Dimension`. Si un modelo necesitara multiplicar dos medidas
  entre sí, eso es un bloque nuevo en código, no un lenguaje de fórmulas en la base.
- Corrección de la hoja Excel. Va por separado, en `Parche_Formulas_REV_ADR_v1.xlsx`.
