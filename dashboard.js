// ============================================================
// dashboard.js — vista de inicio / panel de control
// ============================================================
import { formatCLP, formatDate, escapeHtml } from "./helpers.js";

export function renderDashboard(state) {
  const { trabajos, inventario } = state;
  const hoy = new Date();
  const mesActual = hoy.getMonth();
  const anioActual = hoy.getFullYear();

  const trabajosMes = trabajos.filter(t => {
    if (!t.fecha) return false;
    const d = new Date(t.fecha);
    return d.getMonth() === mesActual && d.getFullYear() === anioActual;
  });

  const ingresosMes = trabajosMes.reduce((s,t) => s + (Number(t.precioCobrado)||0), 0);
  const costosMes   = trabajosMes.reduce((s,t) => s + (Number(t.costoTotal)||0), 0);
  const gananciaMes = ingresosMes - costosMes;

  const bajosStock = inventario.filter(p => Number(p.stock) <= Number(p.stockMinimo));

  const conFecha = trabajos.filter(t => t.fecha).sort((a,b) => b.fecha.localeCompare(a.fecha));
  const ultimo = conFecha[0];

  const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  const marcaCount = {};
  for (const t of trabajos) {
    const m = (t.vehiculoMarca || "Sin marca").trim();
    marcaCount[m] = (marcaCount[m] || 0) + 1;
  }
  const top3 = Object.entries(marcaCount).sort((a,b) => b[1]-a[1]).slice(0,3);

  const bajosHtml = bajosStock.length
    ? bajosStock.map(p => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
          <span style="font-size:13px;">${escapeHtml(p.nombre)}</span>
          <span class="badge danger">${p.stock} restantes</span>
        </div>`).join("")
    : `<p style="font-size:13px;color:var(--text-muted);margin:0;">Todo el stock está al día ✓</p>`;

  return `
    <div class="dashboard-greeting">
      <div>
        <div class="view-title" style="margin-bottom:2px;">Buen día 👋</div>
        <div class="view-subtitle" style="margin-bottom:0;">${MESES[mesActual]} ${anioActual}</div>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card stat-clickable" data-dash-detail="trabajos-mes">
        <p class="stat-label">Trabajos este mes</p>
        <p class="stat-value copper">${trabajosMes.length}</p>
        <p class="stat-hint">Ver detalle →</p>
      </div>
      <div class="stat-card stat-clickable" data-dash-detail="ingresos-mes">
        <p class="stat-label">Ingresos del mes</p>
        <p class="stat-value ok">${formatCLP(ingresosMes)}</p>
        <p class="stat-hint">Ver detalle →</p>
      </div>
      <div class="stat-card stat-clickable" data-dash-detail="costos-mes">
        <p class="stat-label">Costos del mes</p>
        <p class="stat-value danger">${formatCLP(costosMes)}</p>
        <p class="stat-hint">Ver detalle →</p>
      </div>
      <div class="stat-card stat-clickable" data-dash-detail="ganancia-mes">
        <p class="stat-label">Ganancia del mes</p>
        <p class="stat-value copper">${formatCLP(gananciaMes)}</p>
        <p class="stat-hint">Ver detalle →</p>
      </div>
    </div>

    ${ultimo ? `
    <div class="detail-section-title">Último trabajo</div>
    <div class="card" data-open-trabajo="${ultimo.id}" style="cursor:pointer;">
      <div class="card-row">
        <div>
          <p class="card-title">${escapeHtml(ultimo.vehiculoMarca)} ${escapeHtml(ultimo.vehiculoModelo)} ${ultimo.vehiculoAnio ? "· " + escapeHtml(ultimo.vehiculoAnio) : ""}</p>
          <p class="card-meta">${escapeHtml(ultimo.tipoServicio||"")} ${ultimo.tipoControl ? "· "+escapeHtml(ultimo.tipoControl) : ""}</p>
          <p class="card-meta" style="color:var(--text-muted);font-size:12px;">${formatDate(ultimo.fecha)}</p>
        </div>
        <span class="card-amount positive">${formatCLP(ultimo.precioCobrado)}</span>
      </div>
    </div>` : ""}

    <div class="detail-section-title">Top marcas históricas</div>
    <div class="card">
      ${top3.map(([marca, count], i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;${i < top3.length-1 ? "border-bottom:1px solid var(--border);" : ""}">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:18px;color:var(--copper);font-weight:700;width:20px;">${i+1}</span>
            <span style="font-size:14px;">${escapeHtml(marca)}</span>
          </div>
          <span style="font-size:13px;color:var(--text-secondary);">${count} trabajos</span>
        </div>`).join("")}
    </div>

    <div class="detail-section-title">Alertas de stock</div>
    <div class="card">${bajosHtml}</div>

    <div class="detail-section-title">Totales históricos</div>
    <div class="stat-grid">
      <div class="stat-card" style="grid-column:1/-1;">
        <p class="stat-label">Total de trabajos realizados</p>
        <p class="stat-value copper">${trabajos.length}</p>
      </div>
      <div class="stat-card">
        <p class="stat-label">Ingresos totales</p>
        <p class="stat-value ok">${formatCLP(trabajos.reduce((s,t) => s+(Number(t.precioCobrado)||0), 0))}</p>
      </div>
      <div class="stat-card">
        <p class="stat-label">Ganancia total</p>
        <p class="stat-value copper">${formatCLP(trabajos.reduce((s,t) => s+(Number(t.precioCobrado)||0)-(Number(t.costoTotal)||0), 0))}</p>
      </div>
    </div>
  `;
}

export function renderDashboardDetail(tipo, state) {
  const { trabajos } = state;
  const hoy = new Date();
  const mesActual = hoy.getMonth();
  const anioActual = hoy.getFullYear();
  const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const mesNombre = `${MESES[mesActual]} ${anioActual}`;

  const trabajosMes = trabajos.filter(t => {
    if (!t.fecha) return false;
    const d = new Date(t.fecha);
    return d.getMonth() === mesActual && d.getFullYear() === anioActual;
  });

  const ingresosMes = trabajosMes.reduce((s,t) => s + (Number(t.precioCobrado)||0), 0);
  const costosMes   = trabajosMes.reduce((s,t) => s + (Number(t.costoTotal)||0), 0);
  const gananciaMes = ingresosMes - costosMes;

  const listaTrabajos = (lista) => lista.length
    ? lista.map(t => `
        <div class="card" data-open-trabajo="${t.id}" style="cursor:pointer;margin-bottom:10px;">
          <div class="card-row">
            <div>
              <p class="card-title">${escapeHtml(t.vehiculoMarca)} ${escapeHtml(t.vehiculoModelo)} ${t.vehiculoAnio ? "· "+escapeHtml(t.vehiculoAnio):""}</p>
              <p class="card-meta">${escapeHtml(t.cliente||"Sin cliente")}</p>
              <p class="card-meta">${escapeHtml(t.tipoServicio||"")} ${t.tipoControl ? "· "+escapeHtml(t.tipoControl):""}</p>
              <p class="card-meta" style="color:var(--text-muted);font-size:12px;">${formatDate(t.fecha)}</p>
            </div>
            <div style="text-align:right;">
              <p class="card-amount positive" style="margin-bottom:4px;">${formatCLP(t.precioCobrado)}</p>
              <p style="font-size:12px;color:var(--danger);">−${formatCLP(t.costoTotal)}</p>
              <p style="font-size:12px;color:var(--ok);">=${formatCLP((Number(t.precioCobrado)||0)-(Number(t.costoTotal)||0))}</p>
            </div>
          </div>
        </div>`).join("")
    : `<p style="color:var(--text-muted);font-size:14px;text-align:center;padding:20px 0;">Sin trabajos este mes.</p>`;

  if (tipo === "trabajos-mes") {
    return `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <div class="sheet-title">Trabajos — ${mesNombre}</div>
        <button class="sheet-close" data-close-sheet><i class="ti ti-x"></i></button>
      </div>
      <div class="stat-grid" style="margin-bottom:16px;">
        <div class="stat-card" style="grid-column:1/-1;">
          <p class="stat-label">Total de trabajos</p>
          <p class="stat-value copper">${trabajosMes.length}</p>
        </div>
      </div>
      ${listaTrabajos(trabajosMes)}
    `;
  }

  if (tipo === "ingresos-mes") {
    return `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <div class="sheet-title">Ingresos — ${mesNombre}</div>
        <button class="sheet-close" data-close-sheet><i class="ti ti-x"></i></button>
      </div>
      <div class="stat-grid" style="margin-bottom:16px;">
        <div class="stat-card" style="grid-column:1/-1;">
          <p class="stat-label">Total ingresos del mes</p>
          <p class="stat-value ok">${formatCLP(ingresosMes)}</p>
        </div>
      </div>
      ${listaTrabajos(trabajosMes.filter(t => Number(t.precioCobrado) > 0))}
    `;
  }

  if (tipo === "costos-mes") {
    return `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <div class="sheet-title">Costos — ${mesNombre}</div>
        <button class="sheet-close" data-close-sheet><i class="ti ti-x"></i></button>
      </div>
      <div class="stat-grid" style="margin-bottom:16px;">
        <div class="stat-card" style="grid-column:1/-1;">
          <p class="stat-label">Total costos del mes</p>
          <p class="stat-value danger">${formatCLP(costosMes)}</p>
        </div>
      </div>
      ${listaTrabajos(trabajosMes.filter(t => Number(t.costoTotal) > 0))}
    `;
  }

  if (tipo === "ganancia-mes") {
    return `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <div class="sheet-title">Ganancia — ${mesNombre}</div>
        <button class="sheet-close" data-close-sheet><i class="ti ti-x"></i></button>
      </div>
      <div class="stat-grid" style="margin-bottom:16px;">
        <div class="stat-card">
          <p class="stat-label">Ingresos</p>
          <p class="stat-value ok">${formatCLP(ingresosMes)}</p>
        </div>
        <div class="stat-card">
          <p class="stat-label">Costos</p>
          <p class="stat-value danger">${formatCLP(costosMes)}</p>
        </div>
        <div class="stat-card" style="grid-column:1/-1;">
          <p class="stat-label">Ganancia neta del mes</p>
          <p class="stat-value copper">${formatCLP(gananciaMes)}</p>
        </div>
      </div>
      ${listaTrabajos(trabajosMes)}
    `;
  }

  return "";
}
