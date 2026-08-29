# Llaves CerrAuto

App de cerrajería automotriz: trabajos, finanzas e inventario. Web pura (sin
compilar) con Firebase Auth + Firestore y Cloudinary para las fotos.

---

## Lo que tienes que hacer tú (5 minutos, una sola vez)

Estos tres pasos no se pueden hacer desde el código. Sin ellos la app funciona,
pero quedan sueltos un riesgo de cuenta y una regla de seguridad.

### 1. Cerrar el preset de Cloudinary

El `uploadPreset` de `config.js` está publicado en un repo público. Con él y el
`cloudName`, cualquiera puede subir archivos a tu cuenta hasta agotar tu cuota.

En **cloudinary.com → Settings → Upload → Upload presets → `llaves_cerrauto_preset`**:

| Opción | Valor |
|---|---|
| Folder | `llaves-cerrauto` |
| Allowed formats | `jpg, jpeg, png, webp, heic, mp4, mov` |
| Max file size | `40000000` (40 MB) |
| Max image width / height | `2400` |
| **Return delete token** | **Activado** |
| Allowed referral domains | tu dominio de GitHub Pages |

"Return delete token" hace que una foto recién subida se pueda borrar de verdad
desde la app durante los primeros 10 minutos (ver *Borrado de fotos* abajo).

### 2. Publicar las reglas de Firestore con tu ID

`firestore.rules` trae una lista blanca con un marcador de posición. Sin
completarla, cualquier persona con cuenta de Google puede entrar al link y usar
tu cuota de Firestore (tus datos siguen privados, pero la cuota es tuya).

1. Abre la app → engranaje arriba a la derecha → **Tu ID de usuario** → copiar.
2. Pega ese valor en `firestore.rules`, reemplazando `PEGA_AQUI_TU_UID`.
3. Firebase Console → Firestore Database → Reglas → pega el archivo → **Publicar**.

### 3. Restringir la clave de API

Google Cloud Console → APIs y servicios → Credenciales → la clave del proyecto →
**Restricciones de aplicación: sitios web** → agrega tu dominio de GitHub Pages.
Opcionalmente, activa **App Check** en Firebase.

---

## Cómo se usa

Se abre desde el link de GitHub Pages. En el teléfono, el navegador ofrece
**"Agregar a la pantalla de inicio"**: desde ahí abre como una app, a pantalla
completa y **funciona sin señal** — los cambios se guardan en el teléfono y se
suben solos cuando vuelve la conexión.

---

## Estructura

| Archivo | Qué hace |
|---|---|
| `index.html` | Punto de entrada, registra el service worker |
| `config.js` | Claves de Firebase y Cloudinary |
| `app.js` | Estado, navegación y todos los paneles |
| `firebase.js` | Conexión, caché offline y escrituras en lote |
| `metricas.js` | **La única fórmula de ganancia.** Períodos y agrupaciones |
| `dashboard.js` | Pantalla de inicio |
| `trabajos.js` | Vista de trabajos y lógica de stock |
| `inventario.js` | Stock, rotación y días de cobertura |
| `pagos.js` | Finanzas y gráficos |
| `taller.js` | Configuración (nombre, logo, precios) |
| `helpers.js` | Fechas, formatos, avisos y confirmaciones |
| `cloudinary.js` | Subida y borrado de fotos |
| `sw.js` | Service worker (offline) |
| `_preview.html` | Vista previa con datos de ejemplo, sin necesidad de entrar |

---

## Reglas del proyecto

**Fechas.** Nunca uses `new Date("2026-08-01")` ni `toISOString().slice(0,10)`:
ambos trabajan en UTC y en Chile corren la fecha un día. Usa `parseFechaLocal()`
y `toInputValue()` de `helpers.js`.

**Ganancia.** Una sola definición, en `metricas.js`:
`ganancia = ingresos − costoMateriales − gastos`, siempre acotada a un período.
Si necesitas un número de plata en una pantalla nueva, sácalo de
`calcularMetricas()`; no lo vuelvas a calcular a mano.

**Stock.** Un trabajo consume insumos a través de `ajustarStockTrabajo()`, que
calcula la diferencia **neta** entre el estado anterior y el nuevo y escribe una
sola vez por producto, dentro de un lote atómico. No sumes ni restes stock por
fuera de esa función: así fue como se perdía una unidad en cada edición.

**Categorías.** Compáralas con `esCategoria(producto, LISTA)`, que ignora
mayúsculas, espacios y tildes. Comparar con `===` hace que un producto guardado
como "Espadin" desaparezca de los selectores.

**Datos que fallan.** Una suscripción que falla nunca debe entregar una lista
vacía: se conserva lo último bueno y se avisa con la banda de conexión. Una
lista vacía se lee como "no tienes nada guardado".

---

## Pruebas

```bash
node pruebas/correr.js
```

Corre en memoria, sin tocar la base de datos ni necesitar internet. Cubre el
manejo de fechas, la fórmula de ganancia y toda la lógica de stock. Córrelo
antes de subir cambios a `trabajos.js`, `inventario.js`, `metricas.js` o
`helpers.js`.

---

## Ver los cambios sin entrar con Google

```bash
node .claude/servidor.js . 8123
```

Después abre `http://localhost:8123/_preview.html?v=inicio` con datos de ejemplo.
Vistas disponibles en `?v=`: `inicio`, `trabajos`, `finanzas`, `stock`,
`detalleTrabajo`, `detalleProducto`, `detalleGanancia`, `config`.
Agrega `&tema=light` para ver el modo claro.

---

## Cosas sabidas

**Borrado de fotos.** Cloudinary no permite borrar un archivo antiguo desde el
navegador: hace falta firmar la llamada con la API secret, que no puede vivir en
una app pública. Hoy la app borra la foto si tiene menos de 10 minutos (con el
delete token del punto 1); si es más vieja, anota el `publicId` en una lista
local de pendientes. Para borrarlas de verdad hay dos caminos: limpiarlas a mano
desde el panel de Cloudinary, o escribir una Cloud Function que firme el borrado
y poner su URL en `config.js` como `cloudinary.deleteEndpoint`.

**Actualizar la app.** Al cambiar archivos, sube el número de `VERSION` en
`sw.js`. Si no, los teléfonos que ya la tienen instalada pueden seguir usando la
versión guardada en caché.
