// ============================================================
// trabajos.js — vista de Trabajos
// ============================================================
import { addItem, updateItem, deleteItem } from "./firebase.js";
import { uploadMedia } from "./cloudinary.js";
import { formatDate, escapeHtml, showToast, todayInputValue } from "./helpers.js";

const ESTADOS = ["Pendiente", "En proceso", "Terminado"];
const ESTADO_BADGE = { Pendiente: "warn", "En proceso": "neutral", Terminado: "ok" };

export function renderTrabajosView(state) {
  const { trabajos, inventario } = state;

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
        <span class="badge ${ESTADO_BADGE[t.estado] || "neutral"}">${escapeHtml(t.estado || "Pendiente")}</span>
      </div>
    </div>
  `).join("");

  return `
    <div class="view-title">Trabajos</div>
    <div class="view-subtitle">${trabajos.length} trabajo${trabajos.length === 1 ? "" : "s"} registrado${trabajos.length === 1 ? "" : "s"}</div>
    ${cards}
  `;
}

export function renderTrabajoForm(trabajo = null) {
  const t = trabajo || {};
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
      <div class="field-row">
        <div class="field">
          <label>Año</label>
          <input name="vehiculoAnio" placeholder="2021" value="${escapeHtml(t.vehiculoAnio || "")}">
        </div>
        <div class="field">
          <label>Patente</label>
          <input name="patente" placeholder="ABCD12" value="${escapeHtml(t.patente || "")}">
        </div>
      </div>
      <div class="field">
        <label>Tipo de servicio</label>
        <input name="tipoServicio" placeholder="Programación de llave nueva" value="${escapeHtml(t.tipoServicio || "")}" required>
      </div>
      <div class="field">
        <label>Sistema / transponder</label>
        <input name="sistema" placeholder="Texas DST80, 4D60, etc." value="${escapeHtml(t.sistema || "")}">
      </div>
      <div class="field">
        <label>Fecha</label>
        <input type="date" name="fecha" value="${t.fecha || todayInputValue()}">
      </div>
      <div class="field">
        <label>Estado</label>
        <select name="estado">
          ${ESTADOS.map((e) => `<option value="${e}" ${t.estado === e ? "selected" : ""}>${e}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>Notas técnicas (códigos, pines, herramienta usada)</label>
        <textarea name="notas" rows="4" placeholder="Detalles útiles para trabajos futuros con este modelo...">${escapeHtml(t.notas || "")}</textarea>
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

  const mediaHtml = media.map((m, i) => `
    <a class="media-thumb ${m.type === "video" ? "is-video" : ""}" href="${escapeHtml(m.url)}" target="_blank" rel="noopener">
      <img src="${escapeHtml(m.thumbUrl || m.url)}" alt="">
    </a>
  `).join("");

  return `
    <div class="sheet-handle"></div>
    <div class="sheet-header">
      <div class="sheet-title">Detalle del trabajo</div>
      <button class="sheet-close" data-close-sheet><i class="ti ti-x"></i></button>
    </div>

    <div class="detail-header">
      <span class="badge ${ESTADO_BADGE[t.estado] || "neutral"}">${escapeHtml(t.estado || "Pendiente")}</span>
    </div>

    <div class="kv-row"><span class="kv-label">Cliente</span><span class="kv-value">${escapeHtml(t.cliente || "—")}</span></div>
    <div class="kv-row"><span class="kv-label">Teléfono</span><span class="kv-value">${escapeHtml(t.telefono || "—")}</span></div>
    <div class="kv-row"><span class="kv-label">Vehículo</span><span class="kv-value">${escapeHtml(t.vehiculoMarca)} ${escapeHtml(t.vehiculoModelo)} ${t.vehiculoAnio ? "(" + escapeHtml(t.vehiculoAnio) + ")" : ""}</span></div>
    <div class="kv-row"><span class="kv-label">Patente</span><span class="kv-value mono">${escapeHtml(t.patente || "—")}</span></div>
    <div class="kv-row"><span class="kv-label">Servicio</span><span class="kv-value">${escapeHtml(t.tipoServicio || "—")}</span></div>
    <div class="kv-row"><span class="kv-label">Sistema</span><span class="kv-value">${escapeHtml(t.sistema || "—")}</span></div>
    <div class="kv-row"><span class="kv-label">Fecha</span><span class="kv-value">${formatDate(t.fecha)}</span></div>

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
    patente: fd.get("patente")?.trim().toUpperCase() || "",
    tipoServicio: fd.get("tipoServicio")?.trim() || "",
    sistema: fd.get("sistema")?.trim() || "",
    fecha: fd.get("fecha") || todayInputValue(),
    estado: fd.get("estado") || "Pendiente",
    notas: fd.get("notas")?.trim() || ""
  };
}

export async function saveTrabajo(uidUser, data, existingId = null) {
  if (existingId) {
    await updateItem(uidUser, "trabajos", existingId, data);
    showToast("Trabajo actualizado", "success");
  } else {
    await addItem(uidUser, "trabajos", { ...data, media: [] });
    showToast("Trabajo creado", "success");
  }
}

export async function deleteTrabajo(uidUser, id) {
  await deleteItem(uidUser, "trabajos", id);
  showToast("Trabajo eliminado", "success");
}

export async function addMediaToTrabajo(uidUser, trabajo, file, onProgress) {
  const result = await uploadMedia(file, onProgress);
  const media = [...(trabajo.media || []), result];
  await updateItem(uidUser, "trabajos", trabajo.id, { media });
  return media;
}
