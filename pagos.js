// ============================================================
// pagos.js — vista de Pagos, gastos y estadísticas
// ============================================================
import { addItem, updateItem, deleteItem } from "./firebase.js";
import { formatCLP, formatDate, escapeHtml, showToast, todayInputValue } from "./helpers.js";

const ESTADOS_PAGO = ["Pagado", "Pendiente", "Parcial"];

export function renderPagosView(state) {
  const { pagos, trabajos } = state;

  // Ingresos = lo cobrado en cada trabajo (todos los trabajos son ingresos)
  const totalTrabajos = trabajos.reduce((sum, t) => sum + (Number(t.precioCobrado) || 0), 0);
  const totalCostos   = trabajos.reduce((sum, t) => sum + (Number(t.costoTotal)    || 0), 0);
  // Gastos adicionales manuales (tipo "gasto")
  const gastosManuales = pagos.filter(p => p.tipo === "gasto").reduce((sum, p) => sum + (Number(p.monto) || 0), 0);
  const balance = totalTrabajos - totalCostos - gastosManuales;

  // ── Estadísticas por marca ──
  const marcaCount = {};
  const marcaGanancia = {};
  for (const t of trabajos) {
    const marca = (t.vehiculoMarca || "Sin marca").trim();
    marcaCount[marca] = (marcaCount[marca] || 0) + 1;
    marcaGanancia[marca] = (marcaGanancia[marca] || 0) + ((Number(t.precioCobrado)||0) - (Number(t.costoTotal)||0));
  }
  const topMarcas = Object.entries(marcaCount)
    .sort((a,b) => b[1]-a[1])
    .slice(0,6);

  const maxCount = topMarcas[0]?.[1] || 1;

  const topMarcasHtml = topMarcas.map(([marca, count]) => `
    <div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
        <span>${escapeHtml(marca)}</span>
        <span style="color:var(--text-secondary)">${count} trabajo${count===1?"":"s"}</span>
      </div>
      <div style="background:var(--bg-input);border-radius:4px;height:6px;">
        <div style="background:var(--copper);height:6px;border-radius:4px;width:${Math.round(count/maxCount*100)}%;"></div>
      </div>
    </div>
  `).join("");

  // ── Estadísticas por tipo de servicio ──
  const servicioCount = {};
  for (const t of trabajos) {
    const srv = t.tipoServicio || "Sin tipo";
    servicioCount[srv] = (servicioCount[srv] || 0) + 1;
  }
  const topServicios = Object.entries(servicioCount).sort((a,b) => b[1]-a[1]);
  const totalSrv = trabajos.length || 1;
  const serviciosHtml = topServicios.map(([srv, count]) => `
    <div class="kv-row">
      <span class="kv-label">${escapeHtml(srv)}</span>
      <span class="kv-value">${count} <span style="color:var(--text-muted);font-size:12px;">(${Math.round(count/totalSrv*100)}%)</span></span>
    </div>
  `).join("");

  // ── Gastos manuales recientes ──
  const gastosHtml = pagos.length ? pagos.map(p => {
    const isGasto = p.tipo === "gasto";
    return `
      <div class="card" data-open-pago="${p.id}">
        <div class="card-row">
          <div>
            <p class="card-title">${escapeHtml(p.descripcion || "Movimiento")}</p>
            <p class="card-meta">${formatDate(p.fecha)}</p>
            <span class="badge ${isGasto ? "neutral" : (p.estadoPago==="Pagado"?"ok":"warn")}">${isGasto?"Gasto":escapeHtml(p.estadoPago||"Pagado")}</span>
          </div>
          <span class="card-amount ${isGasto?"negative":"positive"}">${isGasto?"−":"+"}${formatCLP(p.monto)}</span>
        </div>
      </div>
    `;
  }).join("") : `<p style="color:var(--text-muted);font-size:13px;">Sin gastos manuales registrados.</p>`;

  return `
    <div class="view-title">Finanzas</div>
    <div class="view-subtitle">Resumen automático basado en tus trabajos</div>

    <div class="stat-grid">
      <div class="stat-card">
        <p class="stat-label">Ingresos totales</p>
        <p class="stat-value ok">${formatCLP(totalTrabajos)}</p>
      </div>
      <div class="stat-card">
        <p class="stat-label">Costo materiales</p>
        <p class="stat-value danger">${formatCLP(totalCostos)}</p>
      </div>
      <div class="stat-card">
        <p class="stat-label">Gastos adicionales</p>
        <p class="stat-value danger">${formatCLP(gastosManuales)}</p>
      </div>
      <div class="stat-card">
        <p class="stat-label">Ganancia neta</p>
        <p class="stat-value copper">${formatCLP(balance)}</p>
      </div>
    </div>

    <div class="stat-grid" style="grid-template-columns:1fr;">
      <div class="stat-card">
        <p class="stat-label">Total de trabajos realizados</p>
        <p class="stat-value copper">${trabajos.length}</p>
      </div>
    </div>

    <div class="detail-section-title">Marcas con más trabajos</div>
    <div class="card">${topMarcasHtml || "<p style='color:var(--text-muted);font-size:13px;'>Sin datos aún.</p>"}</div>

    <div class="detail-section-title">Servicios más realizados</div>
    <div class="card">${serviciosHtml || "<p style='color:var(--text-muted);font-size:13px;'>Sin datos aún.</p>"}</div>

    <div class="detail-section-title">Gastos manuales</div>
    ${gastosHtml}
  `;
}

export function renderPagoForm(trabajos, pago = null) {
  const p = pago || {};
  return `
    <div class="sheet-handle"></div>
    <div class="sheet-header">
      <div class="sheet-title">${pago ? "Editar gasto" : "Registrar gasto"}</div>
      <button class="sheet-close" data-close-sheet><i class="ti ti-x"></i></button>
    </div>
    <form id="form-pago">
      <input type="hidden" name="tipo" value="gasto">
      <div class="field">
        <label>Descripción del gasto</label>
        <input name="descripcion" placeholder="Ej: Compra de llaves vírgenes, herramienta..." value="${escapeHtml(p.descripcion || "")}" required>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Monto</label>
          <input type="number" name="monto" placeholder="25000" value="${p.monto || ""}" required min="0" step="1">
        </div>
        <div class="field">
          <label>Fecha</label>
          <input type="date" name="fecha" value="${p.fecha || todayInputValue()}">
        </div>
      </div>
      <div class="field">
        <label>Forma de pago</label>
        <input name="formaPago" placeholder="Efectivo, transferencia..." value="${escapeHtml(p.formaPago || "")}">
      </div>
      <div class="field">
        <label>Notas</label>
        <textarea name="notas" rows="2" placeholder="Notas adicionales...">${escapeHtml(p.notas || "")}</textarea>
      </div>
      <button type="submit" class="btn btn-primary">
        <i class="ti ti-check"></i> ${pago ? "Guardar cambios" : "Registrar gasto"}
      </button>
    </form>
  `;
}

export function readPagoForm(form) {
  const fd = new FormData(form);
  return {
    tipo: "gasto",
    descripcion: fd.get("descripcion")?.trim() || "",
    trabajoId: "",
    monto: Number(fd.get("monto")) || 0,
    fecha: fd.get("fecha") || todayInputValue(),
    estadoPago: "Pagado",
    formaPago: fd.get("formaPago")?.trim() || "",
    notas: fd.get("notas")?.trim() || ""
  };
}

export async function savePago(uidUser, data, existingId = null) {
  if (existingId) {
    await updateItem(uidUser, "pagos", existingId, data);
    showToast("Gasto actualizado", "success");
  } else {
    await addItem(uidUser, "pagos", data);
    showToast("Gasto registrado", "success");
  }
}


export function renderPagoDetail(pago) {
  const p = pago;
  return `
    <div class="sheet-handle"></div>
    <div class="sheet-header">
      <div class="sheet-title">Detalle del gasto</div>
      <button class="sheet-close" data-close-sheet><i class="ti ti-x"></i></button>
    </div>
    <div class="kv-row"><span class="kv-label">Descripción</span><span class="kv-value">${escapeHtml(p.descripcion || "—")}</span></div>
    <div class="kv-row"><span class="kv-label">Monto</span><span class="kv-value mono negative">${formatCLP(p.monto)}</span></div>
    <div class="kv-row"><span class="kv-label">Fecha</span><span class="kv-value">${formatDate(p.fecha)}</span></div>
    <div class="kv-row"><span class="kv-label">Forma de pago</span><span class="kv-value">${escapeHtml(p.formaPago || "—")}</span></div>
    <div class="kv-row"><span class="kv-label">Notas</span><span class="kv-value">${escapeHtml(p.notas || "—")}</span></div>
    <div class="detail-section-title">Acciones</div>
    <div class="flex-gap">
      <button class="btn" id="btn-edit-pago"><i class="ti ti-edit"></i> Editar</button>
      <button class="btn btn-danger" id="btn-delete-pago"><i class="ti ti-trash"></i> Eliminar</button>
    </div>
  `;
}

export async function deletePago(uidUser, id) {
  await deleteItem(uidUser, "pagos", id);
  showToast("Gasto eliminado", "success");
}
