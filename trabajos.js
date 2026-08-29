// ============================================================
// trabajos.js — vista de Trabajos
// ============================================================
import { addItem, updateItem, deleteItem, aplicarStockEnLote } from "./firebase.js";
import { uploadMedia, borrarMedia } from "./cloudinary.js";
import { formatCLP, formatDate, escapeHtml, showToast, todayInputValue } from "./helpers.js";
import {
  registrarMovimiento, esCategoria,
  CATEGORIAS_CONTROL, CATEGORIAS_ESPADIN, CATEGORIAS_LLAVE_VIRGEN, CATEGORIA_CHIP
} from "./inventario.js";
import { getPrecioPila, getPrecioEspadin } from "./taller.js";
import { ESPADINES_CATALOGO } from "./espadines.js";

export const TIPOS_SERVICIO = ["Duplicado", "Pérdida de llaves", "Llave simple", "Apertura"];

// Tipos de servicio que NO suman el valor de la pila aunque el control la use
export const SERVICIOS_SIN_PILA = ["Llave simple", "Apertura"];

export function renderTrabajosView(state) {
  // Ordenar por fecha descendente (más recientes primero); los sin fecha al final
  const trabajos = [...state.trabajos].sort((a, b) => {
    if (!a.fecha && !b.fecha) return 0;
    if (!a.fecha) return 1;
    if (!b.fecha) return -1;
    return b.fecha.localeCompare(a.fecha);
  });

  if (!trabajos.length) {
    return `
      <div class="view-title">Trabajos</div>
      <div class="view-subtitle">Tus servicios de cerrajería automotriz</div>
      <div class="empty">
        <i class="ti ti-key"></i>
        <p>Todavía no tienes trabajos registrados.<br>Toca el botón + para agregar el primero.</p>
      </div>
    `;
  }

  const inventario = state.inventario || [];
  const nombreDe = (id) => (id ? inventario.find(p => p.id === id)?.nombre : null);

  const cards = trabajos.map((t) => {
    const insumos = [
      nombreDe(t.controlId),
      nombreDe(t.transponderInvId),
      nombreDe(t.espadinId || t.espadinCodigo),
      nombreDe(t.llaveVirgenId)
    ].filter(Boolean);
    const ganancia = (Number(t.precioCobrado) || 0) - (Number(t.costoTotal) || 0);
    const busqueda = [
      t.vehiculoMarca, t.vehiculoModelo, t.vehiculoAnio, t.cliente,
      t.tipoServicio, t.sistema, t.fccId, ...insumos
    ].filter(Boolean).join(" ").toLowerCase();

    return `
    <div class="card trabajo-card" data-open-trabajo="${t.id}"
         data-search="${escapeHtml(busqueda)}"
         data-fecha="${escapeHtml(t.fecha || "")}">
      <div class="card-row">
        <div>
          <p class="card-title">${escapeHtml(t.vehiculoMarca)} ${escapeHtml(t.vehiculoModelo)} ${t.vehiculoAnio ? "· " + escapeHtml(t.vehiculoAnio) : ""}</p>
          <p class="card-meta">${escapeHtml(t.tipoServicio || "")}${insumos.length ? " · " + escapeHtml(insumos.join(" · ")) : ""}</p>
          <p class="card-meta" style="color:var(--text-muted);font-size:12px;">${t.fecha ? formatDate(t.fecha) : "Sin fecha"}${t.cliente ? " · " + escapeHtml(t.cliente) : ""}</p>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <p class="card-amount positive" style="margin:0 0 3px;">${formatCLP(t.precioCobrado)}</p>
          <p class="card-ganancia">${ganancia >= 0 ? "+" : ""}${formatCLP(ganancia)}</p>
        </div>
      </div>
    </div>
  `;
  }).join("");

  const marcas = [...new Set(trabajos.map(t => (t.vehiculoMarca || "").trim()).filter(Boolean))].sort();
  const servicios = [...new Set(trabajos.map(t => (t.tipoServicio || "").trim()).filter(Boolean))].sort();
  const meses = [...new Set(trabajos.filter(t => t.fecha).map(t => t.fecha.slice(0, 7)))].sort().reverse();
  const MESES_CORTOS = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  return `
    <div class="view-title">Trabajos</div>
    <div class="view-subtitle" id="contador-trabajos">${trabajos.length} trabajo${trabajos.length === 1 ? "" : "s"} registrado${trabajos.length === 1 ? "" : "s"}</div>
    <div class="search-box">
      <i class="ti ti-search"></i>
      <input type="search" id="buscar-trabajo" placeholder="Buscar vehículo, cliente, control..." autocomplete="off">
    </div>
    <div class="filtros-row">
      <select id="filtro-marca" class="filtro-select" aria-label="Filtrar por marca">
        <option value="">Todas las marcas</option>
        ${marcas.map(m => `<option value="${escapeHtml(m.toLowerCase())}">${escapeHtml(m)}</option>`).join("")}
      </select>
      <select id="filtro-tipo" class="filtro-select" aria-label="Filtrar por servicio">
        <option value="">Todos los servicios</option>
        ${servicios.map(s => `<option value="${escapeHtml(s.toLowerCase())}">${escapeHtml(s)}</option>`).join("")}
      </select>
      <select id="filtro-mes" class="filtro-select" aria-label="Filtrar por mes">
        <option value="">Todos los meses</option>
        ${meses.map(m => {
          const [y, mo] = m.split("-");
          return `<option value="${m}">${MESES_CORTOS[parseInt(mo, 10)]} ${y}</option>`;
        }).join("")}
      </select>
      <button type="button" class="filtro-limpiar" id="btn-limpiar-filtros" title="Quitar filtros">
        <i class="ti ti-filter-off"></i>
      </button>
    </div>
    <div id="trabajos-lista">${cards}</div>
    <div id="sin-resultados" class="empty hidden">
      <i class="ti ti-search-off"></i>
      <p>No se encontraron trabajos con esos filtros.</p>
    </div>
  `;
}

// Calcula el costo automático sumando control + pila (si corresponde) + espadín + pincode.
// Los valores de la pila y del espadín se configuran desde "Configuración del taller".
export function calcularCostoAutomatico({ tipoServicio, controlCosto, controlUsaPila, espadinSeleccionado, pincode }) {
  let total = 0;
  total += Number(controlCosto) || 0;
  if (controlUsaPila && !SERVICIOS_SIN_PILA.includes(tipoServicio)) {
    total += getPrecioPila();
  }
  if (espadinSeleccionado) {
    total += getPrecioEspadin();
  }
  total += Number(pincode) || 0;
  return total;
}

export function renderTrabajoForm(trabajo = null, inventario = []) {
  const t = trabajo || {};
  const controles = inventario.filter(p => esCategoria(p, CATEGORIAS_CONTROL));
  const espadinesInv = inventario.filter(p => esCategoria(p, CATEGORIAS_ESPADIN));
  const llavesVirgenes = inventario.filter(p => esCategoria(p, CATEGORIAS_LLAVE_VIRGEN));
  const transpondersInv = inventario.filter(p => esCategoria(p, CATEGORIA_CHIP));

  // Compatibilidad: antes el id del espadín del inventario se guardaba en el
  // mismo campo que el código del catálogo. Se separan en espadinId / espadinCodigo.
  const espadinIdActual = t.espadinId
    || (inventario.some(p => p.id === t.espadinCodigo) ? t.espadinCodigo : "");
  const espadinCodigoActual = espadinIdActual ? "" : (t.espadinCodigo || "");

  // Cards de controles con foto para el selector visual
  const controlesCardsHtml = controles.map(c => `
    <div class="inv-selector-card-compact ${t.controlId === c.id ? "selected" : ""}"
         data-ctrl-id="${c.id}"
         data-ctrl-costo="${c.costoUnitario || 0}"
         data-ctrl-pila="${c.usaPila === false ? "0" : "1"}"
         data-ctrl-search="${escapeHtml((c.nombre + " " + (c.compatibilidad||"")).toLowerCase())}">
      <div class="inv-selector-img">
        ${c.fotoUrl
          ? `<img src="${escapeHtml(c.fotoUrl)}" alt="">`
          : `<i class="ti ti-device-remote"></i>`}
      </div>
      <div class="inv-selector-info">
        <div class="inv-selector-name">${escapeHtml(c.nombre)}</div>
        <div class="inv-selector-compat">${escapeHtml(c.compatibilidad || "")}</div>
        <div class="inv-selector-price">${formatCLP(c.costoUnitario)}</div>
      </div>
      ${t.controlId === c.id ? `<i class="ti ti-check inv-selector-check"></i>` : ""}
    </div>
  `).join("");

  // Cards de transponders/chips con foto
  const transpondersCardsHtml = transpondersInv.map(tr => `
    <div class="inv-selector-card-compact ${t.transponderInvId === tr.id ? "selected" : ""}"
         data-tr-id="${tr.id}"
         data-tr-costo="${tr.costoUnitario || 0}"
         data-tr-search="${escapeHtml((tr.nombre + " " + (tr.compatibilidad||"")).toLowerCase())}">
      <div class="inv-selector-img-sm">
        ${tr.fotoUrl
          ? `<img src="${escapeHtml(tr.fotoUrl)}" alt="">`
          : `<i class="ti ti-key-filled"></i>`}
      </div>
      <div class="inv-selector-info">
        <div class="inv-selector-name">${escapeHtml(tr.nombre)}</div>
        <div class="inv-selector-compat">${escapeHtml(tr.compatibilidad || "")}</div>
        <div class="inv-selector-price">${formatCLP(tr.costoUnitario)}</div>
      </div>
      ${t.transponderInvId === tr.id ? `<i class="ti ti-check inv-selector-check"></i>` : ""}
    </div>
  `).join("");

  // Cards de llaves vírgenes (aparecen cuando servicio = Llave simple)
  const llavesVirgenesCardsHtml = llavesVirgenes.map(lv => `
    <div class="inv-selector-card-compact ${t.llaveVirgenId === lv.id ? "selected" : ""}"
         data-lv-id="${lv.id}"
         data-lv-costo="${lv.costoUnitario || 0}"
         data-lv-search="${escapeHtml((lv.nombre + " " + (lv.compatibilidad||"")).toLowerCase())}">
      <div class="inv-selector-img-sm">
        ${lv.fotoUrl
          ? `<img src="${escapeHtml(lv.fotoUrl)}" alt="">`
          : `<i class="ti ti-key"></i>`}
      </div>
      <div class="inv-selector-info">
        <div class="inv-selector-name">${escapeHtml(lv.nombre)}</div>
        <div class="inv-selector-compat">${escapeHtml(lv.compatibilidad || "")}</div>
        <div class="inv-selector-price">${formatCLP(lv.costoUnitario)}</div>
      </div>
      ${t.llaveVirgenId === lv.id ? `<i class="ti ti-check inv-selector-check"></i>` : ""}
    </div>
  `).join("");

  // Cards de espadines con foto
  const espadinesCardsHtml = espadinesInv.map(e => `
    <div class="inv-selector-card-compact ${espadinIdActual === e.id ? "selected" : ""}"
         data-esp-id="${e.id}"
         data-esp-costo="${e.costoUnitario || 0}"
         data-esp-search="${escapeHtml((e.nombre + " " + (e.compatibilidad||"")).toLowerCase())}">
      <div class="inv-selector-img">
        ${e.fotoUrl
          ? `<img src="${escapeHtml(e.fotoUrl)}" alt="">`
          : `<i class="ti ti-key"></i>`}
      </div>
      <div class="inv-selector-info">
        <div class="inv-selector-name">${escapeHtml(e.nombre)}</div>
        <div class="inv-selector-compat">${escapeHtml(e.compatibilidad || "")}</div>
      </div>
      ${espadinIdActual === e.id ? `<i class="ti ti-check inv-selector-check"></i>` : ""}
    </div>
  `).join("");

  // Fallback espadines del catálogo si no hay espadines en inventario
  const opcionesEspadin = ESPADINES_CATALOGO.map((e) =>
    `<option value="${e.codigo}" ${espadinCodigoActual === e.codigo ? "selected" : ""}>${escapeHtml(e.codigo)} — ${escapeHtml(e.marcas)}</option>`
  ).join("");

  return `
    <div class="sheet-handle"></div>
    <div class="sheet-header">
      <div class="sheet-title">${trabajo ? "Editar trabajo" : "Nuevo trabajo"}</div>
      <button class="sheet-close" data-close-sheet><i class="ti ti-x"></i></button>
    </div>
    <form id="form-trabajo">
      <div class="field">
        <label>Cliente</label>
        <input name="cliente" placeholder="Nombre del cliente (opcional)" value="${escapeHtml(t.cliente || "")}">
      </div>
      <div class="field">
        <label>Teléfono del cliente</label>
        <input name="telefono" placeholder="+56 9 1234 5678" value="${escapeHtml(t.telefono || "")}">
      </div>
      <div class="field-row">
        <div class="field autocomplete-wrap">
          <label>Marca</label>
          <input name="vehiculoMarca" id="input-marca" placeholder="Toyota" value="${escapeHtml(t.vehiculoMarca || "")}" required autocomplete="off">
          <div class="autocomplete-lista" id="sugerencias-marca"></div>
        </div>
        <div class="field autocomplete-wrap">
          <label>Modelo</label>
          <input name="vehiculoModelo" id="input-modelo" placeholder="Hilux" value="${escapeHtml(t.vehiculoModelo || "")}" required autocomplete="off">
          <div class="autocomplete-lista" id="sugerencias-modelo"></div>
        </div>
      </div>
      <div class="field">
        <label>Año</label>
        <input name="vehiculoAnio" placeholder="2021" value="${escapeHtml(t.vehiculoAnio || "")}">
      </div>

      <div class="field">
        <label>Tipo de servicio</label>
        <select name="tipoServicio" id="select-tipo-servicio" required>
          ${TIPOS_SERVICIO.map((s) => `<option value="${s}" ${t.tipoServicio === s ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </div>

      <div class="field">
        <label>Sistema / transponder <span style="color:var(--text-muted)">(chip generado — texto libre)</span></label>
        <input name="sistema" placeholder="Texas DST80, 4D60, Texas Crypto..." value="${escapeHtml(t.sistema || "")}">
      </div>

      <div class="field">
        <label>Transponder / chip <span style="color:var(--text-muted)">(seleccionar del stock — descuenta automático)</span></label>
        <input type="hidden" name="transponderInvId" id="input-transponder-id" value="${escapeHtml(t.transponderInvId || "")}">
        ${transpondersInv.length ? `
          <div class="inv-selector-search-box">
            <i class="ti ti-search"></i>
            <input type="search" id="buscar-transponder" placeholder="Buscar chip por código o marca..." autocomplete="off">
          </div>
          <button type="button" class="selector-toggle" id="toggle-transponders">
            <span id="label-transponder-sel">${t.transponderInvId ? (transpondersInv.find(x=>x.id===t.transponderInvId)?.nombre || "Seleccionar chip") : "Seleccionar chip"}</span>
            <i class="ti ti-chevron-down"></i>
          </button>
          <div class="inv-selector-grid-compact selector-colapsable ${t.transponderInvId ? "" : "cerrado"}" id="grid-transponders">
            ${transpondersCardsHtml}
          </div>
        ` : `<p style="color:var(--text-muted);font-size:13px;">No hay chips en el stock. Agrégalos desde Stock con categoría "CHIP".</p>`}
      </div>

      <div class="field-row">
        <div class="field">
          <label>FCC ID</label>
          <input name="fccId" placeholder="Ej: M3N-40821302" value="${escapeHtml(t.fccId || "")}">
        </div>
        <div class="field">
          <label>Frecuencia</label>
          <input name="frecuencia" placeholder="Ej: 433.92 MHz" value="${escapeHtml(t.frecuencia || "")}">
        </div>
      </div>

      <div class="field">
        <label>Tipo de control <span style="color:var(--text-muted)">(opcional)</span></label>
        <input type="hidden" name="controlId" id="input-control-id" value="${escapeHtml(t.controlId || "")}">
        ${controles.length ? `
          <div class="inv-selector-search-box">
            <i class="ti ti-search"></i>
            <input type="search" id="buscar-control" placeholder="Buscar control por código o marca..." autocomplete="off">
          </div>
          <button type="button" class="selector-toggle" id="toggle-controles">
            <span id="label-control-sel">${t.controlId ? (controles.find(x=>x.id===t.controlId)?.nombre || "Seleccionar control") : "Seleccionar control"}</span>
            <i class="ti ti-chevron-down"></i>
          </button>
          <div class="inv-selector-grid-compact selector-colapsable ${t.controlId ? "" : "cerrado"}" id="grid-controles">
            ${controlesCardsHtml}
          </div>
        ` : `<p style="color:var(--text-muted);font-size:13px;">No hay controles en el inventario. Agrégalos desde Stock.</p>`}
      </div>

      <div class="field hidden" id="campo-llave-virgen">
        <label>Llave virgen <span style="color:var(--text-muted)">(Llave simple — agrega costo automático)</span></label>
        <input type="hidden" name="llaveVirgenId" id="input-llave-virgen-id" value="${escapeHtml(t.llaveVirgenId || "")}">
        ${llavesVirgenes.length ? `
          <div class="inv-selector-search-box">
            <i class="ti ti-search"></i>
            <input type="search" id="buscar-llave-virgen" placeholder="Buscar llave virgen..." autocomplete="off">
          </div>
          <div class="inv-selector-grid-compact" id="grid-llaves-virgenes">
            ${llavesVirgenesCardsHtml}
          </div>
        ` : `<p style="color:var(--text-muted);font-size:13px;">Agrega llaves vírgenes al stock para seleccionarlas aquí.</p>`}
      </div>

      <div class="field">
        <label>Espadín <span style="color:var(--text-muted)">(opcional — suma ${formatCLP(getPrecioEspadin())} automático)</span></label>
        <input type="hidden" name="espadinId" id="input-espadin-id" value="${escapeHtml(espadinIdActual)}">
        ${espadinesInv.length ? `
          <div class="inv-selector-search-box">
            <i class="ti ti-search"></i>
            <input type="search" id="buscar-espadin" placeholder="Buscar espadín..." autocomplete="off">
          </div>
          <div class="inv-selector-grid-compact" id="grid-espadines">
            ${espadinesCardsHtml}
          </div>
        ` : `
          <div class="inv-selector-search-box">
            <i class="ti ti-search"></i>
            <input type="search" id="buscar-espadin-catalogo" placeholder="Buscar espadín (TOY43, HU66...)" autocomplete="off">
          </div>
          <select name="espadinCodigo" id="select-espadin-fallback" size="6" class="select-lista">
            <option value="">Sin espadín</option>
            ${opcionesEspadin}
          </select>
          <p style="font-size:11px;color:var(--text-muted);margin-top:6px;">Agrega espadines al inventario para verlos con foto aquí.</p>
        `}
      </div>

      <div class="field">
        <label>Pincode comprado <span style="color:var(--text-muted)">(si aplica)</span></label>
        <input type="number" name="pincode" id="input-pincode" placeholder="0" value="${t.pincode || ""}" min="0" step="1">
      </div>

      <div class="field">
        <label>Costo total de la llave</label>
        <input type="number" name="costoTotal" id="input-costo-total" placeholder="0" value="${t.costoTotal ?? ""}" min="0" step="1">
        <p style="font-size:12px; color:var(--text-muted); margin: 6px 0 0;">Se calcula solo (control + pila + espadín + pincode). Puedes ajustarlo a mano si es necesario.</p>
      </div>

      <div class="field">
        <label>Precio cobrado al cliente</label>
        <input type="number" name="precioCobrado" placeholder="45000" value="${t.precioCobrado ?? ""}" min="0" step="1" required>
      </div>

      <div class="field">
        <label>Fecha</label>
        <input type="date" name="fecha" value="${t.fecha || todayInputValue()}">
      </div>

      <div class="field">
        <label>Notas técnicas (códigos, pines, herramienta usada)</label>
        <textarea name="notas" rows="4" placeholder="Detalles útiles para trabajos futuros con este modelo...">${escapeHtml(t.notas || "")}</textarea>
      </div>

      <div class="field">
        <label>Foto / Video</label>
        <div class="media-grid">
          ${mediaHtml}
          <label class="media-upload-tile" id="media-upload-tile">
            <i class="ti ti-camera-plus"></i>
            <span>Agregar</span>
            <input type="file" id="media-input" accept="image/*,video/*" multiple style="display:none">
          </label>
        </div>
      </div>

      <button type="submit" class="btn btn-primary">
        <i class="ti ti-check"></i> ${trabajo ? "Guardar cambios" : "Crear trabajo"}
      </button>
    </form>
  `;
}

export function renderTrabajoDetail(trabajo, inventario = []) {
  const t = trabajo;
  const media = t.media || [];
  const ganancia = (Number(t.precioCobrado) || 0) - (Number(t.costoTotal) || 0);
  const margen = Number(t.precioCobrado) > 0
    ? Math.round(ganancia / Number(t.precioCobrado) * 100)
    : null;

  // ── Insumos usados: resolvemos los ids guardados contra el inventario ──
  const buscar = (id) => (id ? inventario.find(p => p.id === id) : null);
  const espadinId = t.espadinId
    || (inventario.some(p => p.id === t.espadinCodigo) ? t.espadinCodigo : "");
  const codigoCatalogo = espadinId ? "" : (t.espadinCodigo || "");

  const insumos = [
    { rol: "Control",       prod: buscar(t.controlId),         icono: "device-remote" },
    { rol: "Chip",          prod: buscar(t.transponderInvId),  icono: "key-filled" },
    { rol: "Espadín",       prod: buscar(espadinId),           icono: "key" },
    { rol: "Llave virgen",  prod: buscar(t.llaveVirgenId),     icono: "key" }
  ].filter(x => x.prod);

  const insumosHtml = insumos.map(({ rol, prod, icono }) => `
    <div class="insumo-row">
      <div class="insumo-img">
        ${prod.fotoUrl
          ? `<img src="${escapeHtml(prod.fotoUrl)}" alt="">`
          : `<i class="ti ti-${icono}"></i>`}
      </div>
      <div class="insumo-info">
        <div class="insumo-nombre">${escapeHtml(prod.nombre)}</div>
        <div class="insumo-rol">${rol}${prod.compatibilidad ? " · " + escapeHtml(prod.compatibilidad) : ""}</div>
      </div>
      <span class="insumo-costo mono">${formatCLP(prod.costoUnitario)}</span>
    </div>
  `).join("");

  const insumosExtra = [];
  if (codigoCatalogo) insumosExtra.push(`Espadín <b class="mono">${escapeHtml(codigoCatalogo)}</b> (del catálogo, sin descuento de stock)`);
  if (Number(t.pincode) > 0) insumosExtra.push(`Pincode comprado: <b class="mono">${formatCLP(t.pincode)}</b>`);
  const control = buscar(t.controlId);
  if (control?.usaPila && !SERVICIOS_SIN_PILA.includes(t.tipoServicio)) {
    insumosExtra.push(`Pila CR2032 (${formatCLP(getPrecioPila())})`);
  }

  const bloqueInsumos = (insumosHtml || insumosExtra.length) ? `
    <div class="detail-section-title">Insumos usados</div>
    ${insumosHtml}
    ${insumosExtra.length ? `<ul class="insumo-extras">${insumosExtra.map(x => `<li>${x}</li>`).join("")}</ul>` : ""}
  ` : `
    <div class="detail-section-title">Insumos usados</div>
    <p class="insumo-vacio">No se registraron insumos del inventario en este trabajo.</p>
  `;

  const mediaHtml = media.map((m, i) => `
    <div class="media-thumb ${m.type === "video" ? "is-video" : ""}">
      <a href="${escapeHtml(m.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(m.thumbUrl || m.url)}" alt=""></a>
      <button type="button" class="media-remove-btn" data-remove-media-detail="${i}"><i class="ti ti-x"></i></button>
    </div>
  `).join("");

  return `
    <div class="sheet-handle"></div>
    <div class="sheet-header">
      <div class="sheet-title">Detalle del trabajo</div>
      <button class="sheet-close" data-close-sheet><i class="ti ti-x"></i></button>
    </div>

    <div class="kv-row"><span class="kv-label">Cliente</span><span class="kv-value">${escapeHtml(t.cliente || "—")}</span></div>
    <div class="kv-row"><span class="kv-label">Teléfono</span><span class="kv-value">${escapeHtml(t.telefono || "—")}</span></div>
    <div class="kv-row"><span class="kv-label">Vehículo</span><span class="kv-value">${escapeHtml(t.vehiculoMarca)} ${escapeHtml(t.vehiculoModelo)} ${t.vehiculoAnio ? "(" + escapeHtml(t.vehiculoAnio) + ")" : ""}</span></div>
    <div class="kv-row"><span class="kv-label">Servicio</span><span class="kv-value">${escapeHtml(t.tipoServicio || "—")}</span></div>
    <div class="kv-row"><span class="kv-label">Sistema</span><span class="kv-value">${escapeHtml(t.sistema || "—")}</span></div>
    <div class="kv-row"><span class="kv-label">FCC ID</span><span class="kv-value mono">${escapeHtml(t.fccId || "—")}</span></div>
    <div class="kv-row"><span class="kv-label">Frecuencia</span><span class="kv-value">${escapeHtml(t.frecuencia || "—")}</span></div>
    <div class="kv-row"><span class="kv-label">Fecha</span><span class="kv-value">${formatDate(t.fecha)}</span></div>

    ${bloqueInsumos}

    <div class="detail-section-title">Costos</div>
    <div class="kv-row"><span class="kv-label">Costo total llave</span><span class="kv-value mono">${formatCLP(t.costoTotal)}</span></div>
    <div class="kv-row"><span class="kv-label">Precio cobrado</span><span class="kv-value mono">${formatCLP(t.precioCobrado)}</span></div>
    <div class="kv-row"><span class="kv-label">Ganancia</span><span class="kv-value mono" style="color: var(--ok)">${formatCLP(ganancia)}${margen !== null ? ` <span style="color:var(--text-muted);font-size:12px;">(${margen}%)</span>` : ""}</span></div>

    <div class="detail-section-title">Notas técnicas</div>
    <div class="notes-box">${escapeHtml(t.notas) || "Sin notas."}</div>

    <div class="detail-section-title">Fotos y videos</div>
    <div class="media-grid">
      ${mediaHtml}
      <label class="media-upload-tile" id="media-upload-tile">
        <i class="ti ti-camera-plus"></i>
        <span>Agregar</span>
        <input type="file" id="media-input" accept="image/*,video/*" multiple style="display:none">
      </label>
    </div>

    <div class="detail-section-title">Acciones</div>
    <div class="flex-gap" style="margin-bottom:8px;">
      <button class="btn" id="btn-edit-trabajo"><i class="ti ti-edit"></i> Editar</button>
      <button class="btn" id="btn-duplicar-trabajo"><i class="ti ti-copy"></i> Duplicar</button>
    </div>
    <div class="flex-gap" style="margin-bottom:8px;">
      <button class="btn" id="btn-compartir-trabajo"><i class="ti ti-brand-whatsapp"></i> Enviar por WhatsApp</button>
    </div>
    <div class="flex-gap">
      <button class="btn btn-danger" id="btn-delete-trabajo"><i class="ti ti-trash"></i> Eliminar trabajo</button>
    </div>
  `;
}

export function readTrabajoForm(form) {
  const fd = new FormData(form);
  return {
    cliente: fd.get("cliente")?.trim() || "",
    telefono: fd.get("telefono")?.trim() || "",
    vehiculoMarca: fd.get("vehiculoMarca")?.trim() || "",
    vehiculoModelo: fd.get("vehiculoModelo")?.trim() || "",
    vehiculoAnio: fd.get("vehiculoAnio")?.trim() || "",
    tipoServicio: fd.get("tipoServicio") || TIPOS_SERVICIO[0],
    sistema: fd.get("sistema")?.trim() || "",
    transponderInvId: fd.get("transponderInvId") || "",
    fccId: fd.get("fccId")?.trim() || "",
    frecuencia: fd.get("frecuencia")?.trim() || "",
    controlId: fd.get("controlId") || "",
    // espadinId  = producto del inventario (descuenta stock)
    // espadinCodigo = código del catálogo (solo referencia)
    espadinId: fd.get("espadinId") || "",
    espadinCodigo: fd.get("espadinCodigo") || "",
    pincode: Number(fd.get("pincode")) || 0,
    llaveVirgenId: fd.get("llaveVirgenId") || "",
    costoTotal: Number(fd.get("costoTotal")) || 0,
    precioCobrado: Number(fd.get("precioCobrado")) || 0,
    fecha: fd.get("fecha") || todayInputValue(),
    notas: fd.get("notas")?.trim() || ""
  };
}

// ============================================================
// Stock
// ============================================================

// Busca la pila CR2032 en el inventario (por categoría y nombre)
function buscarPila(inventario) {
  return inventario.find(p => {
    const cat = (p.categoria || "").toLowerCase();
    const esPila = cat.includes("pila") || cat.includes("batería") || cat.includes("bateria");
    return esPila && /cr\s*2032/i.test(p.nombre || "");
  });
}

// Resuelve el id de espadín de un trabajo, aceptando el formato antiguo en el
// que el id del inventario se guardaba dentro de espadinCodigo.
function espadinIdDe(data, inventario) {
  if (data.espadinId) return data.espadinId;
  if (data.espadinCodigo && inventario.some(p => p.id === data.espadinCodigo)) return data.espadinCodigo;
  return "";
}

/**
 * Lista de ids del inventario que consume un trabajo (una unidad por id).
 */
export function insumosDelTrabajo(data, inventario) {
  if (!data) return [];
  const ids = [
    data.controlId,
    data.transponderInvId,
    espadinIdDe(data, inventario),
    data.llaveVirgenId
  ].filter(Boolean);

  const control = inventario.find(p => p.id === data.controlId);
  if (control?.usaPila && !SERVICIOS_SIN_PILA.includes(data.tipoServicio)) {
    const pila = buscarPila(inventario);
    if (pila) ids.push(pila.id);
  }
  return ids;
}

/**
 * Ajusta el stock por la diferencia NETA entre el estado anterior y el nuevo
 * de un trabajo, en una sola escritura por producto y dentro de un lote atómico.
 *
 * Antes esto se hacía en dos pasos (devolver todo + descontar todo) leyendo el
 * mismo arreglo en memoria, así que un insumo que aparecía en ambos estados
 * terminaba descontado de más. Con el delta neto, un insumo que no cambió no se
 * toca.
 *
 *   antes   → estado guardado del trabajo (null si se está creando)
 *   despues → estado nuevo del trabajo (null si se está eliminando)
 */
export async function ajustarStockTrabajo(uidUser, inventario, { antes = null, despues = null } = {}) {
  const delta = new Map();
  for (const id of insumosDelTrabajo(antes, inventario))   delta.set(id, (delta.get(id) || 0) + 1);
  for (const id of insumosDelTrabajo(despues, inventario)) delta.set(id, (delta.get(id) || 0) - 1);

  const cambios = [];
  const movimientos = [];
  const sinStock = [];

  for (const [id, n] of delta) {
    if (!n) continue;                       // el insumo no cambió: no se escribe
    const prod = inventario.find(p => p.id === id);
    if (!prod) continue;                    // el producto ya no existe
    const anterior = Number(prod.stock) || 0;
    const nuevo = Math.max(0, anterior + n);
    if (nuevo === anterior) {
      if (n < 0) sinStock.push(prod.nombre); // se quiso descontar y ya estaba en 0
      continue;
    }
    cambios.push({ id, stock: nuevo });
    movimientos.push({
      productoId: id,
      productoNombre: prod.nombre,
      tipo: n > 0 ? "entrada" : "salida",
      cantidad: Math.abs(nuevo - anterior),
      stockAnterior: anterior,
      stockNuevo: nuevo,
      motivo: n > 0 ? "Devuelto de un trabajo" : "Usado en trabajo"
    });
  }

  await aplicarStockEnLote(uidUser, cambios);
  for (const m of movimientos) await registrarMovimiento(uidUser, m);

  if (sinStock.length) {
    showToast(`Sin stock: ${sinStock.join(", ")}`, "error");
  }
  return { cambios, sinStock };
}

// ============================================================
// Guardar / eliminar
// ============================================================

export async function saveTrabajo(uidUser, data, inventario, existingId = null, mediaExistente = [], datosAnteriores = null) {
  if (existingId) {
    await ajustarStockTrabajo(uidUser, inventario, { antes: datosAnteriores, despues: data });
    await updateItem(uidUser, "trabajos", existingId, { ...data, media: mediaExistente });
    showToast("Trabajo actualizado", "success");
    return existingId;
  }
  await ajustarStockTrabajo(uidUser, inventario, { despues: data });
  const ref = await addItem(uidUser, "trabajos", { ...data, media: mediaExistente });
  showToast("Trabajo creado", "success");
  return ref.id;
}

export async function deleteTrabajo(uidUser, trabajo, inventario = []) {
  // Al eliminar, los insumos vuelven al stock
  await ajustarStockTrabajo(uidUser, inventario, { antes: trabajo });
  for (const m of trabajo.media || []) borrarMedia(m);
  await deleteItem(uidUser, "trabajos", trabajo.id);
  showToast("Trabajo eliminado", "success");
}

// ============================================================
// Fotos y videos
// ============================================================

export async function addMediaToTrabajo(uidUser, trabajo, file, onProgress) {
  const result = await uploadMedia(file, onProgress);
  const media = [...(trabajo.media || []), result];
  if (trabajo.id) {
    await updateItem(uidUser, "trabajos", trabajo.id, { media });
  }
  return media;
}

export async function removeMediaFromTrabajo(uidUser, trabajo, index) {
  const media = [...(trabajo.media || [])];
  const [quitado] = media.splice(index, 1);
  if (trabajo.id) {
    await updateItem(uidUser, "trabajos", trabajo.id, { media });
  }
  if (quitado) borrarMedia(quitado);
  return media;
}

// ============================================================
// Comprobante para el cliente
// ============================================================

export function generarMensajeWhatsApp(t, nombreTaller = "Llaves CerrAuto") {
  const lineas = [
    `*${nombreTaller}*`,
    ``,
    `Comprobante de servicio`,
    `━━━━━━━━━━━━━━`,
    t.cliente ? `Cliente: ${t.cliente}` : null,
    `Vehículo: ${t.vehiculoMarca} ${t.vehiculoModelo}${t.vehiculoAnio ? " " + t.vehiculoAnio : ""}`,
    `Servicio: ${t.tipoServicio || "—"}`,
    t.sistema ? `Sistema: ${t.sistema}` : null,
    t.fecha ? `Fecha: ${formatDate(t.fecha)}` : null,
    `━━━━━━━━━━━━━━`,
    `*Total: ${formatCLP(t.precioCobrado)}*`,
    ``,
    `¡Gracias por preferirnos!`
  ].filter(Boolean);
  return lineas.join("\n");
}
