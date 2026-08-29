// ============================================================
// dashboard.js — vista de inicio / panel de control
// ============================================================
import { formatCLP, formatDate, escapeHtml } from "./helpers.js";
import {
  PERIODOS, rangoPeriodo, calcularMetricas, variacion, serieMensual
} from "./metricas.js";
import { productosParaReponer, consumoMensual } from "./inventario.js";

// ---------- Piezas reutilizables ----------

export function renderSelectorPeriodo(activo) {
  return `
    <div class="periodo-selector" id="periodo-selector" role="tablist" aria-label="Período">
      ${PERIODOS.map(p => `
        <button type="button" role="tab" data-periodo="${p.id}"
                aria-selected="${p.id === activo}"
                class="${p.id === activo ? "on" : ""}">${p.label}</button>
      `).join("")}
    </div>
  `;
}

// Minigráfico de barras de los últimos meses. La última barra va destacada.
function renderSparkBars(serie, campo = "ganancia") {
  const max = Math.max(...serie.map(s => Math.abs(s[campo])), 1);
  const primero = serie[0], ultimo = serie[serie.length - 1];
  return `
    <div class="spark-bars" role="img"
         aria-label="Últimos ${serie.length} meses: de ${formatCLP(primero[campo])} en ${primero.etiqueta} a ${formatCLP(ultimo[campo])} en ${ultimo.etiqueta}">
      ${serie.map((s, i) => `
        <span class="spark-bar ${i === serie.length - 1 ? "on" : ""} ${s[campo] < 0 ? "neg" : ""}"
              style="height:${Math.max(3, Math.abs(s[campo]) / max * 100)}%"
              title="${s.etiqueta} ${s.anio}: ${formatCLP(s[campo])}"></span>
      `).join("")}
    </div>
  `;
}

function renderDelta(actual, anterior, etiquetaAnterior, invertido = false) {
  const pct = variacion(actual, anterior);
  if (pct === null) return `<span class="delta neutro">sin ${escapeHtml(etiquetaAnterior)} para comparar</span>`;
  if (pct === 0) return `<span class="delta neutro">igual que ${escapeHtml(etiquetaAnterior)}</span>`;
  const subio = pct > 0;
  const bueno = invertido ? !subio : subio;
  return `<span class="delta ${bueno ? "bueno" : "malo"}">${subio ? "↑" : "↓"} ${Math.abs(pct)}% vs ${escapeHtml(etiquetaAnterior)}</span>`;
}

// ---------- Vista principal ----------

export function renderDashboard(state) {
  const { trabajos, pagos, inventario, movimientos = [], periodo = "mes" } = state;

  const r = rangoPeriodo(periodo);
  const m = calcularMetricas(trabajos, pagos, r.desde, r.hasta);
  const mAnt = calcularMetricas(trabajos, pagos, r.desdeAnt, r.hastaAnt);
  const serie = serieMensual(trabajos, pagos, 12);

  const reponer = productosParaReponer(inventario, movimientos);
  const ultimo = [...trabajos]
    .filter(t => t.fecha)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))[0];

  const saludo = (() => {
    const h = new Date().getHours();
    if (h < 6) return "Buenas noches";
    if (h < 13) return "Buen día";
    if (h < 20) return "Buenas tardes";
    return "Buenas noches";
  })();

  // ── Bloque principal: la ganancia del período ──
  const hero = `
    <div class="hero-card ${m.ganancia < 0 ? "hero-negativo" : ""}" data-dash-detail="ganancia" role="button" tabindex="0">
      <div class="hero-label">Ganancia · ${escapeHtml(r.etiqueta)}</div>
      <div class="hero-value">${formatCLP(m.ganancia)}</div>
      <div class="hero-meta">
        ${renderDelta(m.ganancia, mAnt.ganancia, r.etiquetaAnterior)}
        ${m.margen !== null ? `<span class="hero-margen">margen ${m.margen}%</span>` : ""}
      </div>
      ${renderSparkBars(serie)}
      <div class="hero-pie">Ganancia de los últimos 12 meses · toca para ver el detalle</div>
    </div>
  `;

  const mini = `
    <div class="mini-grid">
      <button type="button" class="mini-card" data-dash-detail="trabajos">
        <span class="mini-label">Trabajos</span>
        <span class="mini-value">${m.cantidad}</span>
      </button>
      <button type="button" class="mini-card" data-dash-detail="ingresos">
        <span class="mini-label">Ingresos</span>
        <span class="mini-value">${formatCLP(m.ingresos)}</span>
      </button>
      <button type="button" class="mini-card" data-dash-detail="costos">
        <span class="mini-label">Costos</span>
        <span class="mini-value">${formatCLP(m.costoMateriales + m.gastos)}</span>
      </button>
      <button type="button" class="mini-card" data-dash-detail="ticket">
        <span class="mini-label">Ticket prom.</span>
        <span class="mini-value">${formatCLP(m.ticket)}</span>
      </button>
    </div>
  `;

  // ── Requiere atención: reposición por días de cobertura ──
  const atencion = reponer.length ? `
    <div class="detail-section-title">Requiere atención</div>
    <div class="atencion-lista">
      ${reponer.slice(0, 4).map(({ producto: p, dias, nivel }) => `
        <div class="atencion-row ${nivel}" data-open-producto-alerta="${p.id}">
          <span class="atencion-punto"></span>
          <div class="atencion-info">
            <div class="atencion-nombre">${escapeHtml(p.nombre)} — quedan ${p.stock}</div>
            <div class="atencion-meta">${dias !== null
              ? `${dias} días al ritmo actual (${consumoMensual(p, movimientos).toFixed(1)} por mes)`
              : "bajo el stock mínimo"}</div>
          </div>
          <i class="ti ti-chevron-right"></i>
        </div>
      `).join("")}
      ${reponer.length > 4 ? `<button type="button" class="atencion-mas" data-ir-a="inventario">Ver los ${reponer.length} productos →</button>` : ""}
    </div>
  ` : `
    <div class="detail-section-title">Requiere atención</div>
    <div class="card"><p class="todo-ok"><i class="ti ti-circle-check"></i> Todo el stock está al día</p></div>
  `;

  // ── Último trabajo, ahora con insumos y ganancia ──
  const insumosUltimo = ultimo ? [
    inventario.find(p => p.id === ultimo.controlId),
    inventario.find(p => p.id === ultimo.transponderInvId),
    inventario.find(p => p.id === (ultimo.espadinId || ultimo.espadinCodigo)),
    inventario.find(p => p.id === ultimo.llaveVirgenId)
  ].filter(Boolean).map(p => p.nombre) : [];

  const gananciaUltimo = ultimo
    ? (Number(ultimo.precioCobrado) || 0) - (Number(ultimo.costoTotal) || 0)
    : 0;

  const bloqueUltimo = ultimo ? `
    <div class="detail-section-title">Último trabajo</div>
    <div class="card" data-open-trabajo="${ultimo.id}" style="cursor:pointer;">
      <div class="card-row">
        <div>
          <p class="card-title">${escapeHtml(ultimo.vehiculoMarca)} ${escapeHtml(ultimo.vehiculoModelo)} ${ultimo.vehiculoAnio ? "· " + escapeHtml(ultimo.vehiculoAnio) : ""}</p>
          <p class="card-meta">${escapeHtml(ultimo.tipoServicio || "")}${insumosUltimo.length ? " · " + escapeHtml(insumosUltimo.join(" · ")) : ""}</p>
          <p class="card-meta" style="color:var(--text-muted);font-size:12px;">${formatDate(ultimo.fecha)} · costo ${formatCLP(ultimo.costoTotal)}</p>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <p class="card-amount positive" style="margin:0 0 3px;">${formatCLP(ultimo.precioCobrado)}</p>
          <p class="card-ganancia">+${formatCLP(gananciaUltimo)}</p>
        </div>
      </div>
    </div>
  ` : "";

  return `
    <div class="dashboard-greeting">
      <div>
        <div class="view-title" style="margin-bottom:2px;">${saludo} 👋</div>
        <div class="view-subtitle" style="margin-bottom:0;">${escapeHtml(r.etiqueta)}</div>
      </div>
      <button class="btn btn-primary" id="btn-dash-nuevo-trabajo" style="width:auto;padding:10px 16px;font-size:13px;gap:6px;">
        <i class="ti ti-plus"></i> <span>Nuevo trabajo</span>
      </button>
    </div>

    ${renderSelectorPeriodo(periodo)}
    ${hero}
    ${mini}
    ${atencion}
    ${bloqueUltimo}
  `;
}

// ---------- Detalle al tocar una tarjeta ----------

export function renderDashboardDetail(tipo, state) {
  const { trabajos, pagos, periodo = "mes" } = state;
  const r = rangoPeriodo(periodo);
  const m = calcularMetricas(trabajos, pagos, r.desde, r.hasta);
  const mAnt = calcularMetricas(trabajos, pagos, r.desdeAnt, r.hastaAnt);

  const listaTrabajos = (lista) => lista.length
    ? [...lista].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "")).map(t => `
        <div class="card" data-open-trabajo="${t.id}" style="cursor:pointer;margin-bottom:10px;">
          <div class="card-row">
            <div>
              <p class="card-title">${escapeHtml(t.vehiculoMarca)} ${escapeHtml(t.vehiculoModelo)} ${t.vehiculoAnio ? "· " + escapeHtml(t.vehiculoAnio) : ""}</p>
              <p class="card-meta">${escapeHtml(t.cliente || "Sin cliente")}</p>
              <p class="card-meta">${escapeHtml(t.tipoServicio || "")}</p>
              <p class="card-meta" style="color:var(--text-muted);font-size:12px;">${formatDate(t.fecha)}</p>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <p class="card-amount positive" style="margin-bottom:4px;">${formatCLP(t.precioCobrado)}</p>
              <p style="font-size:12px;color:var(--danger);margin:0;">−${formatCLP(t.costoTotal)}</p>
              <p style="font-size:12px;color:var(--ok);margin:2px 0 0;">=${formatCLP((Number(t.precioCobrado) || 0) - (Number(t.costoTotal) || 0))}</p>
            </div>
          </div>
        </div>`).join("")
    : `<p style="color:var(--text-muted);font-size:14px;text-align:center;padding:20px 0;">Sin trabajos en este período.</p>`;

  const cabecera = (titulo) => `
    <div class="sheet-handle"></div>
    <div class="sheet-header">
      <div class="sheet-title">${titulo} — ${escapeHtml(r.etiqueta)}</div>
      <button class="sheet-close" data-close-sheet><i class="ti ti-x"></i></button>
    </div>
  `;

  if (tipo === "trabajos") {
    return `
      ${cabecera("Trabajos")}
      <div class="stat-grid" style="margin-bottom:16px;">
        <div class="stat-card" style="grid-column:1/-1;">
          <p class="stat-label">Total de trabajos</p>
          <p class="stat-value copper">${m.cantidad}</p>
          <p class="stat-hint">${escapeHtml(r.etiquetaAnterior)}: ${mAnt.cantidad}</p>
        </div>
      </div>
      ${listaTrabajos(m.trabajos)}
    `;
  }

  if (tipo === "ingresos") {
    return `
      ${cabecera("Ingresos")}
      <div class="stat-grid" style="margin-bottom:16px;">
        <div class="stat-card" style="grid-column:1/-1;">
          <p class="stat-label">Total cobrado a clientes</p>
          <p class="stat-value ok">${formatCLP(m.ingresos)}</p>
          <p class="stat-hint">${escapeHtml(r.etiquetaAnterior)}: ${formatCLP(mAnt.ingresos)}</p>
        </div>
      </div>
      ${listaTrabajos(m.trabajos.filter(t => Number(t.precioCobrado) > 0))}
    `;
  }

  if (tipo === "costos") {
    return `
      ${cabecera("Costos")}
      <div class="stat-grid" style="margin-bottom:16px;">
        <div class="stat-card">
          <p class="stat-label">Materiales</p>
          <p class="stat-value danger">${formatCLP(m.costoMateriales)}</p>
        </div>
        <div class="stat-card">
          <p class="stat-label">Gastos manuales</p>
          <p class="stat-value danger">${formatCLP(m.gastos)}</p>
        </div>
        <div class="stat-card" style="grid-column:1/-1;">
          <p class="stat-label">Total de costos</p>
          <p class="stat-value danger">${formatCLP(m.costoMateriales + m.gastos)}</p>
          <p class="stat-hint">${escapeHtml(r.etiquetaAnterior)}: ${formatCLP(mAnt.costoMateriales + mAnt.gastos)}</p>
        </div>
      </div>
      ${listaTrabajos(m.trabajos.filter(t => Number(t.costoTotal) > 0))}
    `;
  }

  if (tipo === "ticket") {
    const ordenados = [...m.trabajos].sort((a, b) => (Number(b.precioCobrado) || 0) - (Number(a.precioCobrado) || 0));
    return `
      ${cabecera("Ticket promedio")}
      <div class="stat-grid" style="margin-bottom:16px;">
        <div class="stat-card" style="grid-column:1/-1;">
          <p class="stat-label">Promedio cobrado por trabajo</p>
          <p class="stat-value copper">${formatCLP(m.ticket)}</p>
          <p class="stat-hint">${escapeHtml(r.etiquetaAnterior)}: ${formatCLP(mAnt.ticket)}</p>
        </div>
      </div>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">Del más caro al más barato:</p>
      ${listaTrabajos(ordenados)}
    `;
  }

  // ganancia
  return `
    ${cabecera("Ganancia")}
    <div class="stat-grid" style="margin-bottom:16px;">
      <div class="stat-card">
        <p class="stat-label">Ingresos</p>
        <p class="stat-value ok">${formatCLP(m.ingresos)}</p>
      </div>
      <div class="stat-card">
        <p class="stat-label">Materiales</p>
        <p class="stat-value danger">−${formatCLP(m.costoMateriales)}</p>
      </div>
      <div class="stat-card">
        <p class="stat-label">Gastos manuales</p>
        <p class="stat-value danger">−${formatCLP(m.gastos)}</p>
      </div>
      <div class="stat-card">
        <p class="stat-label">Margen</p>
        <p class="stat-value copper">${m.margen !== null ? m.margen + "%" : "—"}</p>
      </div>
      <div class="stat-card" style="grid-column:1/-1;">
        <p class="stat-label">Ganancia del período</p>
        <p class="stat-value copper">${formatCLP(m.ganancia)}</p>
        <p class="stat-hint">${escapeHtml(r.etiquetaAnterior)}: ${formatCLP(mAnt.ganancia)}</p>
      </div>
    </div>
    ${listaTrabajos(m.trabajos)}
  `;
}
