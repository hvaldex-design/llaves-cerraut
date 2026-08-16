// ============================================================
// trabajos.js — vista de Trabajos
// ============================================================
import { addItem, updateItem, deleteItem } from "./firebase.js";
import { uploadMedia } from "./cloudinary.js";
import { formatCLP, formatDate, escapeHtml, showToast, todayInputValue } from "./helpers.js";
import { descontarStockPorId, CATEGORIAS_CONTROL, CATEGORIAS_ESPADIN, CATEGORIAS_LLAVE_VIRGEN, limpiarCategoriasCustom } from "./inventario.js";
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

  const cards = trabajos.map((t) => `
    <div class="card trabajo-card" data-open-trabajo="${t.id}"
         data-search="${escapeHtml((t.vehiculoMarca+" "+t.vehiculoModelo+" "+(t.vehiculoAnio||"")+" "+(t.cliente||"")+" "+(t.tipoServicio||"")+" "+(t.tipoControl||"")).toLowerCase())}"
         data-fecha="${t.fecha||""}">
      <div class="card-row">
        <div>
          <p class="card-title">${escapeHtml(t.vehiculoMarca)} ${escapeHtml(t.vehiculoModelo)} ${t.vehiculoAnio ? "· " + escapeHtml(t.vehiculoAnio) : ""}</p>
          <p class="card-meta">${escapeHtml(t.tipoServicio || "")} ${t.tipoControl ? "· " + escapeHtml(t.tipoControl) : ""}</p>
          <p class="card-meta" style="color:var(--text-muted);font-size:12px;">${t.fecha ? formatDate(t.fecha) : "Sin fecha"}</p>
        </div>
      </div>
    </div>
  `).join("");

  return `
    <div class="view-title">Trabajos</div>
    <div class="view-subtitle">${trabajos.length} trabajo${trabajos.length === 1 ? "" : "s"} registrado${trabajos.length === 1 ? "" : "s"}</div>
    <div class="search-box">
      <i class="ti ti-search"></i>
      <input type="search" id="buscar-trabajo" placeholder="Buscar vehículo, cliente, servicio..." autocomplete="off">
    </div>
    <div class="filtros-row">
      <select id="filtro-marca" class="filtro-select">
        <option value="">Todas las marcas</option>
        ${[...new Set(trabajos.map(t => (t.vehiculoMarca||"").trim()).filter(Boolean))].sort().map(m => `<option value="${escapeHtml(m.toLowerCase())}">${escapeHtml(m)}</option>`).join("")}
      </select>
      <select id="filtro-tipo" class="filtro-select">
        <option value="">Todos los servicios</option>
        ${[...new Set(trabajos.map(t => (t.tipoServicio||"").trim()).filter(Boolean))].sort().map(s => `<option value="${escapeHtml(s.toLowerCase())}">${escapeHtml(s)}</option>`).join("")}
      </select>
      <select id="filtro-mes" class="filtro-select">
        <option value="">Todos los meses</option>
        ${[...new Set(trabajos.filter(t=>t.fecha).map(t => t.fecha.slice(0,7)))].sort().reverse().map(m => {
          const [y,mo] = m.split("-");
          const meses = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
          return `<option value="${m}">${meses[parseInt(mo)]} ${y}</option>`;
        }).join("")}
      </select>
    </div>
    <div id="trabajos-lista">${cards}</div>
    <div id="sin-resultados" class="empty hidden">
      <i class="ti ti-search-off"></i>
      <p>No se encontraron trabajos.</p>
    </div>
  `;
}

// Calcula el costo automático sumando control + pila (si corresponde) + espadín + pincode
export function calcularCostoAutomatico({ tipoServicio, controlCosto, controlUsaPila, espadinSeleccionado, pincode }) {
  let total = 0;
  total += Number(controlCosto) || 0;
  if (controlUsaPila && !SERVICIOS_SIN_PILA.includes(tipoServicio)) {
    total += 1000; // valor pila CR2032
  }
  if (espadinSeleccionado) {
    total += 300;
  }
  total += Number(pincode) || 0;
  return total;
}

export function renderTrabajoForm(trabajo = null, inventario = []) {
  const t = trabajo || {};
  limpiarCategoriasCustom();
  const controles = inventario.filter(p => CATEGORIAS_CONTROL.includes(p.categoria));
  const espadinesInv = inventario.filter(p => CATEGORIAS_ESPADIN.includes(p.categoria));
  const llavesVirgenes = inventario.filter(p => CATEGORIAS_LLAVE_VIRGEN.includes(p.categoria));
  // Mostrar TODOS los productos con categoría "CHIP" (case-insensitive + trim)
  const transpondersInv = inventario.filter(p =>
    (p.categoria || "").trim().toUpperCase() === "CHIP"
  );

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
    <div class="inv-selector-card-compact ${(t.espadinCodigo === e.id || t.espadinId === e.id) ? "selected" : ""}"
         data-esp-id="${e.id}"
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
      ${(t.espadinCodigo === e.id || t.espadinId === e.id) ? `<i class="ti ti-check inv-selector-check"></i>` : ""}
    </div>
  `).join("");

  // Fallback espadines del catálogo si no hay espadines en inventario
  const opcionesEspadin = ESPADINES_CATALOGO.map((e) =>
    `<option value="${e.codigo}" ${t.espadinCodigo === e.codigo ? "selected" : ""}>${escapeHtml(e.codigo)} — ${escapeHtml(e.marcas)}</option>`
  ).join("");

  const media = t.media || [];
  const mediaHtml = media.map((m, i) => `
    <div class="media-thumb ${m.type === "video" ? "is-video" : ""}">
      <img src="${escapeHtml(m.thumbUrl || m.url)}" alt="">
      <button type="button" class="media-remove-btn" data-remove-media="${i}"><i class="ti ti-x"></i></button>
    </div>
  `).join("");

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
        <label>Espadín <span style="color:var(--text-muted)">(opcional — +$300 automático)</span></label>
        <input type="hidden" name="espadinCodigo" id="input-espadin-id" value="${escapeHtml(t.espadinCodigo || t.espadinId || "")}">
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

export function renderTrabajoDetail(trabajo) {
  const t = trabajo;
  const media = t.media || [];
  const ganancia = (Number(t.precioCobrado) || 0) - (Number(t.costoTotal) || 0);

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
    ${t.transponderInvId ? `<div class="kv-row"><span class="kv-label">Chip usado (stock)</span><span class="kv-value" style="color:var(--ok)"><i class="ti ti-key-filled"></i> Descontado del inventario</span></div>` : ""}
    <div class="kv-row"><span class="kv-label">FCC ID</span><span class="kv-value mono">${escapeHtml(t.fccId || "—")}</span></div>
    <div class="kv-row"><span class="kv-label">Frecuencia</span><span class="kv-value">${escapeHtml(t.frecuencia || "—")}</span></div>
    <div class="kv-row"><span class="kv-label">Fecha</span><span class="kv-value">${formatDate(t.fecha)}</span></div>

    <div class="detail-section-title">Costos</div>
    <div class="kv-row"><span class="kv-label">Costo total llave</span><span class="kv-value mono">${formatCLP(t.costoTotal)}</span></div>
    <div class="kv-row"><span class="kv-label">Precio cobrado</span><span class="kv-value mono">${formatCLP(t.precioCobrado)}</span></div>
    <div class="kv-row"><span class="kv-label">Ganancia</span><span class="kv-value mono" style="color: var(--ok)">${formatCLP(ganancia)}</span></div>

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
    espadinCodigo: fd.get("espadinCodigo") || "",
    pincode: Number(fd.get("pincode")) || 0,
    llaveVirgenId: fd.get("llaveVirgenId") || "",
    costoTotal: Number(fd.get("costoTotal")) || 0,
    precioCobrado: Number(fd.get("precioCobrado")) || 0,
    fecha: fd.get("fecha") || todayInputValue(),
    notas: fd.get("notas")?.trim() || ""
  };
}

// Descuenta del inventario TODOS los insumos usados en un trabajo.
// Función única para evitar inconsistencias entre las distintas rutas de guardado.
export async function descontarInsumosDelTrabajo(uidUser, data, inventario) {
  if (data.controlId)        await descontarStockPorId(uidUser, inventario, data.controlId);
  if (data.espadinCodigo)    await descontarStockPorId(uidUser, inventario, data.espadinCodigo);
  if (data.transponderInvId) await descontarStockPorId(uidUser, inventario, data.transponderInvId);
  if (data.llaveVirgenId)    await descontarStockPorId(uidUser, inventario, data.llaveVirgenId);

  // Pila CR2032: se descuenta si el control la usa y el servicio no está exento
  const control = inventario.find(p => p.id === data.controlId);
  if (control?.usaPila && !SERVICIOS_SIN_PILA.includes(data.tipoServicio)) {
    const pila = inventario.find(p => {
      const cat = (p.categoria || "").toLowerCase();
      const esPila = cat.includes("pila") || cat.includes("batería") || cat.includes("bateria");
      return esPila && /cr\s*2032/i.test(p.nombre || "");
    });
    if (pila) await descontarStockPorId(uidUser, inventario, pila.id);
  }
}

// Devuelve al stock los insumos de un trabajo (usado al editar o eliminar)
export async function devolverInsumosAlStock(uidUser, data, inventario) {
  const sumar = async (id) => {
    if (!id) return;
    const prod = inventario.find(p => p.id === id);
    if (prod) await updateItem(uidUser, "inventario", id, { stock: Number(prod.stock || 0) + 1 });
  };
  await sumar(data.controlId);
  await sumar(data.espadinCodigo);
  await sumar(data.transponderInvId);
  await sumar(data.llaveVirgenId);

  const control = inventario.find(p => p.id === data.controlId);
  if (control?.usaPila && !SERVICIOS_SIN_PILA.includes(data.tipoServicio)) {
    const pila = inventario.find(p => {
      const cat = (p.categoria || "").toLowerCase();
      const esPila = cat.includes("pila") || cat.includes("batería") || cat.includes("bateria");
      return esPila && /cr\s*2032/i.test(p.nombre || "");
    });
    if (pila) await sumar(pila.id);
  }
}

export async function saveTrabajo(uidUser, data, inventario, existingId = null, mediaExistente = [], datosAnteriores = null) {
  if (existingId) {
    // Al editar: devolver los insumos anteriores y descontar los nuevos
    if (datosAnteriores) {
      await devolverInsumosAlStock(uidUser, datosAnteriores, inventario);
      await descontarInsumosDelTrabajo(uidUser, data, inventario);
    }
    await updateItem(uidUser, "trabajos", existingId, { ...data, media: mediaExistente });
    showToast("Trabajo actualizado", "success");
  } else {
    await descontarInsumosDelTrabajo(uidUser, data, inventario);
    await addItem(uidUser, "trabajos", { ...data, media: [] });
    showToast("Trabajo creado", "success");
  }
}

// Crea un trabajo nuevo (descontando stock) y devuelve el id del documento creado.
// Útil cuando ya hay fotos/videos subidos que se deben adjuntar justo después de crear.
export async function saveTrabajoYDevolverId(uidUser, data, inventario) {
  await descontarInsumosDelTrabajo(uidUser, data, inventario);
  const ref = await addItem(uidUser, "trabajos", { ...data, media: [] });
  showToast("Trabajo creado", "success");
  return ref.id;
}

export async function deleteTrabajo(uidUser, id) {
  await deleteItem(uidUser, "trabajos", id);
  showToast("Trabajo eliminado", "success");
}

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
  media.splice(index, 1);
  if (trabajo.id) {
    await updateItem(uidUser, "trabajos", trabajo.id, { media });
  }
  return media;
}


// Genera el texto del comprobante para enviar al cliente por WhatsApp
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
