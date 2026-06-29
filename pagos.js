// ============================================================
// pagos.js — vista de Pagos y gastos
// ============================================================
import { addItem, updateItem, deleteItem } from "./firebase.js";
import { formatCLP, formatDate, escapeHtml, showToast, todayInputValue } from "./helpers.js";

const ESTADOS_PAGO = ["Pagado", "Pendiente", "Parcial"];

export function renderPagosView(state) {
  const { pagos, trabajos } = state;

  const totalIngresos = pagos.filter(p => p.tipo !== "gasto").reduce((sum, p) => sum + (Number(p.monto) || 0), 0);
  const totalGastos = pagos.filter(p => p.tipo === "gasto").reduce((sum, p) => sum + (Number(p.monto) || 0), 0);
  const balance = totalIngresos - totalGastos;

  if (!pagos.length) {
    return `
      <div class="view-title">Pagos y gastos</div>
      <div class="view-subtitle">Registra tus ingresos y gastos del taller</div>
      <div class="empty">
        <i class="ti ti-receipt"></i>
        <p>Todavía no tienes movimientos.<br>Toca el botón + para registrar el primero.</p>
      </div>
    `;
  }

  const rows = pagos.map((p) => {
    const isGasto = p.tipo === "gasto";
    const trabajoRef = trabajos.find(t => t.id === p.trabajoId);
    return `
      <div class="card" data-open-pago="${p.id}">
        <div class="card-row">
          <div>
            <p class="card-title">${escapeHtml(p.descripcion || (trabajoRef ? `${trabajoRef.vehiculoMarca} ${trabajoRef.vehiculoModelo}` : "Movimiento"))}</p>
            <p class="card-meta">${formatDate(p.fecha)}</p>
            ${!isGasto ? `<span class="badge ${p.estadoPago === "Pagado" ? "ok" : p.estadoPago === "Parcial" ? "warn" : "danger"}">${escapeHtml(p.estadoPago || "Pendiente")}</span>` : `<span class="badge neutral">Gasto</span>`}
          </div>
          <span class="card-amount ${isGasto ? "negative" : "positive"}">${isGasto ? "−" : "+"}${formatCLP(p.monto)}</span>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="view-title">Pagos y gastos</div>
    <div class="view-subtitle">Resumen de tu actividad financiera</div>
    <div class="stat-grid">
      <div class="stat-card">
        <p class="stat-label">Ingresos</p>
        <p class="stat-value ok">${formatCLP(totalIngresos)}</p>
      </div>
      <div class="stat-card">
        <p class="stat-label">Gastos</p>
        <p class="stat-value danger">${formatCLP(totalGastos)}</p>
      </div>
      <div class="stat-card" style="grid-column: 1 / -1;">
        <p class="stat-label">Balance neto</p>
        <p class="stat-value copper">${formatCLP(balance)}</p>
      </div>
    </div>
    ${rows}
  `;
}

export function renderPagoForm(trabajos, pago = null) {
  const p = pago || {};
  const opcionesTrabajo = trabajos.map(t =>
    `<option value="${t.id}" ${p.trabajoId === t.id ? "selected" : ""}>${escapeHtml(t.vehiculoMarca)} ${escapeHtml(t.vehiculoModelo)} — ${escapeHtml(t.cliente || "")}</option>`
  ).join("");

  return `
    <div class="sheet-handle"></div>
    <div class="sheet-header">
      <div class="sheet-title">${pago ? "Editar movimiento" : "Nuevo movimiento"}</div>
      <button class="sheet-close" data-close-sheet><i class="ti ti-x"></i></button>
    </div>
    <form id="form-pago">
      <div class="field">
        <label>Tipo de movimiento</label>
        <div class="segmented" id="tipo-segmented">
          <button type="button" data-tipo="ingreso" class="${p.tipo !== "gasto" ? "active" : ""}">Ingreso</button>
          <button type="button" data-tipo="gasto" class="${p.tipo === "gasto" ? "active" : ""}">Gasto</button>
        </div>
        <input type="hidden" name="tipo" id="tipo-hidden" value="${p.tipo === "gasto" ? "gasto" : "ingreso"}">
      </div>
      <div class="field">
        <label>Descripción</label>
        <input name="descripcion" placeholder="Programación llave Toyota / Compra de llaves vírgenes" value="${escapeHtml(p.descripcion || "")}" required>
      </div>
      <div class="field" id="trabajo-field">
        <label>Trabajo asociado (opcional)</label>
        <select name="trabajoId">
          <option value="">Sin asociar</option>
          ${opcionesTrabajo}
        </select>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Monto</label>
          <input type="number" name="monto" placeholder="45000" value="${p.monto || ""}" required min="0" step="1">
        </div>
        <div class="field">
          <label>Fecha</label>
          <input type="date" name="fecha" value="${p.fecha || todayInputValue()}">
        </div>
      </div>
      <div class="field" id="estadoPago-field">
        <label>Estado del pago</label>
        <select name="estadoPago">
          ${ESTADOS_PAGO.map((e) => `<option value="${e}" ${p.estadoPago === e ? "selected" : ""}>${e}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>Forma de pago</label>
        <input name="formaPago" placeholder="Efectivo, transferencia..." value="${escapeHtml(p.formaPago || "")}">
      </div>
      <div class="field">
        <label>Notas</label>
        <textarea name="notas" rows="3" placeholder="Notas adicionales...">${escapeHtml(p.notas || "")}</textarea>
      </div>
      <button type="submit" class="btn btn-primary">
        <i class="ti ti-check"></i> ${pago ? "Guardar cambios" : "Registrar movimiento"}
      </button>
    </form>
  `;
}

export function readPagoForm(form) {
  const fd = new FormData(form);
  return {
    tipo: fd.get("tipo") || "ingreso",
    descripcion: fd.get("descripcion")?.trim() || "",
    trabajoId: fd.get("trabajoId") || "",
    monto: Number(fd.get("monto")) || 0,
    fecha: fd.get("fecha") || todayInputValue(),
    estadoPago: fd.get("estadoPago") || "Pagado",
    formaPago: fd.get("formaPago")?.trim() || "",
    notas: fd.get("notas")?.trim() || ""
  };
}

export async function savePago(uidUser, data, existingId = null) {
  if (existingId) {
    await updateItem(uidUser, "pagos", existingId, data);
    showToast("Movimiento actualizado", "success");
  } else {
    await addItem(uidUser, "pagos", data);
    showToast("Movimiento registrado", "success");
  }
}

export async function deletePago(uidUser, id) {
  await deleteItem(uidUser, "pagos", id);
  showToast("Movimiento eliminado", "success");
}
