// ============================================================
// trabajos.js — vista de Trabajos
// ============================================================
import { addItem, updateItem, deleteItem } from "./firebase.js";
import { uploadMedia } from "./cloudinary.js";
import { formatCLP, formatDate, escapeHtml, showToast, todayInputValue } from "./helpers.js";
import { descontarStockPorId } from "./inventario.js";

export const TIPOS_SERVICIO = ["Duplicado", "Pérdida de llaves", "Llave simple", "Apertura"];

// Tipos de servicio que NO suman el valor de la pila aunque el control la use
export const SERVICIOS_SIN_PILA = ["Llave simple", "Apertura"];

export function renderTrabajosView(state) {
  const { trabajos } = state;

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
    <div class="card" data-open-trabajo="${t.id}">
      <div class="card-row">
        <div>
          <p class="card-title">${escapeHtml(t.vehiculoMarca)} ${escapeHtml(t.vehiculoModelo)} ${t.vehiculoAnio ? "· " + escapeHtml(t.vehiculoAnio) : ""}</p>
          <p class="card-meta">${escapeHtml(t.cliente || "Sin cliente")}</p>
          <p class="card-meta">${escapeHtml(t.tipoServicio || "")}</p>
        </div>
        <span class="card-amount positive">${formatCLP(t.precioCobrado)}</span>
      </div>
    </div>
  `).join("");

  return `
    <div class="view-title">Trabajos</div>
    <div class="view-subtitle">${trabajos.length} trabajo${trabajos.length === 1 ? "" : "s"} registrado${trabajos.length === 1 ? "" : "s"}</div>
    ${cards}
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
  const controles = inventario.filter((p) => p.categoria === "Control remoto");
  const espadines = inventario.filter((p) => p.categoria === "Espadín");

  const opcionesControl = controles.map((c) =>
    `<option value="${c.id}" data-costo="${c.costoUnitario || 0}" data-pila="${c.usaPila ? "1" : "0"}" ${t.controlId === c.id ? "selected" : ""}>${escapeHtml(c.nombre)} — ${formatCLP(c.costoUnitario)}</option>`
  ).join("");

  const opcionesEspadin = espadines.map((e) =>
    `<option value="${e.id}" ${t.espadinId === e.id ? "selected" : ""}>${escapeHtml(e.nombre)}</option>`
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
        <input name="cliente" placeholder="Nombre del cliente" value="${escapeHtml(t.cliente || "")}" required>
      </div>
      <div class="field">
        <label>Teléfono del cliente</label>
        <input name="telefono" placeholder="+56 9 1234 5678" value="${escapeHtml(t.telefono || "")}">
      </div>
      <div class="field-row">
        <div class="field">
          <label>Marca</label>
          <input name="vehiculoMarca" placeholder="Toyota" value="${escapeHtml(t.vehiculoMarca || "")}" required>
        </div>
        <div class="field">
          <label>Modelo</label>
          <input name="vehiculoModelo" placeholder="Hilux" value="${escapeHtml(t.vehiculoModelo || "")}" required>
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
        <label>Sistema / transponder</label>
        <input name="sistema" placeholder="Texas DST80, 4D60, etc." value="${escapeHtml(t.sistema || "")}">
      </div>

      <div class="field">
        <label>Tipo de control <span style="color:var(--text-muted)">(opcional)</span></label>
        <select name="controlId" id="select-control">
          <option value="">Sin control</option>
          ${opcionesControl}
        </select>
      </div>

      <div class="field">
        <label>Espadín <span style="color:var(--text-muted)">(opcional)</span></label>
        <select name="espadinId" id="select-espadin">
          <option value="">Sin espadín</option>
          ${opcionesEspadin}
        </select>
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
            <input type="file" id="media-input" accept="image/*,video/*" multiple capture="environment" style="display:none">
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
        <input type="file" id="media-input" accept="image/*,video/*" multiple capture="environment" style="display:none">
      </label>
    </div>

    <div class="detail-section-title">Acciones</div>
    <div class="flex-gap">
      <button class="btn" id="btn-edit-trabajo"><i class="ti ti-edit"></i> Editar</button>
      <button class="btn btn-danger" id="btn-delete-trabajo"><i class="ti ti-trash"></i> Eliminar</button>
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
    controlId: fd.get("controlId") || "",
    espadinId: fd.get("espadinId") || "",
    pincode: Number(fd.get("pincode")) || 0,
    costoTotal: Number(fd.get("costoTotal")) || 0,
    precioCobrado: Number(fd.get("precioCobrado")) || 0,
    fecha: fd.get("fecha") || todayInputValue(),
    notas: fd.get("notas")?.trim() || ""
  };
}

export async function saveTrabajo(uidUser, data, inventario, existingId = null, mediaExistente = []) {
  // Si es un trabajo nuevo, descuenta stock del control y del espadín usados
  if (!existingId) {
    if (data.controlId) await descontarStockPorId(uidUser, inventario, data.controlId);
    if (data.espadinId) await descontarStockPorId(uidUser, inventario, data.espadinId);
    // Descuenta también la pila si corresponde
    const control = inventario.find((p) => p.id === data.controlId);
    if (control?.usaPila && !SERVICIOS_SIN_PILA.includes(data.tipoServicio)) {
      const pila = inventario.find((p) => p.categoria === "Batería / Pila" && /cr2032/i.test(p.nombre));
      if (pila) await descontarStockPorId(uidUser, inventario, pila.id);
    }
  }

  if (existingId) {
    await updateItem(uidUser, "trabajos", existingId, { ...data, media: mediaExistente });
    showToast("Trabajo actualizado", "success");
  } else {
    await addItem(uidUser, "trabajos", { ...data, media: [] });
    showToast("Trabajo creado", "success");
  }
}

// Crea un trabajo nuevo (descontando stock) y devuelve el id del documento creado.
// Útil cuando ya hay fotos/videos subidos que se deben adjuntar justo después de crear.
export async function saveTrabajoYDevolverId(uidUser, data, inventario) {
  if (data.controlId) await descontarStockPorId(uidUser, inventario, data.controlId);
  if (data.espadinId) await descontarStockPorId(uidUser, inventario, data.espadinId);
  const control = inventario.find((p) => p.id === data.controlId);
  if (control?.usaPila && !SERVICIOS_SIN_PILA.includes(data.tipoServicio)) {
    const pila = inventario.find((p) => p.categoria === "Batería / Pila" && /cr2032/i.test(p.nombre));
    if (pila) await descontarStockPorId(uidUser, inventario, pila.id);
  }
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
