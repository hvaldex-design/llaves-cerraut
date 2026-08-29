// ============================================================
// pagos.js — Finanzas: gastos manuales y estadísticas
// ============================================================
import { addItem, updateItem, deleteItem } from "./firebase.js";
import { formatCLP, formatDate, escapeHtml, showToast, todayInputValue } from "./helpers.js";
import {
  rangoPeriodo, calcularMetricas, variacion, serieMensual,
  porServicio, porMarca, porDiaSemana, inventarioPorCategoria, filtrarPorRango
} from "./metricas.js";
import { renderSelectorPeriodo } from "./dashboard.js";
import { valorInventario } from "./inventario.js";

// Colores de serie. Se usan solo para las barras; los números y etiquetas van
// siempre con el color de texto, para que nada dependa del color para leerse.
const SERIE_GANANCIA = "var(--serie-ganancia)";
const SERIE_COSTO    = "var(--serie-costo)";

// ============================================================
// Gráficos
// ============================================================

// Columnas apiladas: ganancia arriba, costo abajo, 12 meses.
function graficoMensual(serie) {
  const max = Math.max(...serie.map(s => Math.max(s.ingresos, s.costos + Math.max(0, s.ganancia))), 1);
  const ultimo = serie.length - 1;

  return `
    <div class="grafico">
      <div class="grafico-head">
        <h3 class="grafico-titulo">Ingresos, costos y ganancia</h3>
        <p class="grafico-sub">Últimos 12 meses. Abajo lo que costaron los materiales y gastos, arriba lo que te quedó.</p>
      </div>
      <div class="leyenda">
        <span><i style="background:${SERIE_GANANCIA}"></i> Ganancia</span>
        <span><i style="background:${SERIE_COSTO}"></i> Costos</span>
      </div>
      <div class="cols-wrap">
        <div class="cols">
          ${serie.map((s, i) => {
            const hGan = Math.max(0, s.ganancia) / max * 100;
            const hCos = s.costos / max * 100;
            return `
              <div class="col ${i === ultimo ? "col-actual" : ""}" tabindex="0"
                   aria-label="${s.etiqueta} ${s.anio}: ${s.cantidad} trabajos, ganancia ${formatCLP(s.ganancia)}">
                <span class="col-tip">
                  <b>${s.etiqueta} ${s.anio}</b><br>
                  ${s.cantidad} trabajo${s.cantidad === 1 ? "" : "s"}<br>
                  Ingresos ${formatCLP(s.ingresos)}<br>
                  Costos ${formatCLP(s.costos)}<br>
                  Ganancia ${formatCLP(s.ganancia)}
                </span>
                <span class="seg gan" style="height:${hGan}%"></span>
                <span class="seg cos" style="height:${hCos}%"></span>
              </div>`;
          }).join("")}
        </div>
        <div class="cols-axis">
          ${serie.map((s, i) => `<span class="${i === ultimo ? "on" : ""}">${s.etiqueta}</span>`).join("")}
        </div>
      </div>
    </div>
  `;
}

// Barras horizontales con etiqueta directa en cada una
function graficoBarras({ titulo, sub, filas, nota = "", clase = "" }) {
  if (!filas.length) {
    return `
      <div class="grafico">
        <div class="grafico-head">
          <h3 class="grafico-titulo">${titulo}</h3>
        </div>
        <p class="grafico-vacio">Sin datos suficientes todavía.</p>
      </div>
    `;
  }
  const max = Math.max(...filas.map(f => Math.abs(f.valor)), 1);
  return `
    <div class="grafico">
      <div class="grafico-head">
        <h3 class="grafico-titulo">${titulo}</h3>
        ${sub ? `<p class="grafico-sub">${sub}</p>` : ""}
      </div>
      <div class="hbars">
        ${filas.map(f => `
          <div class="hbar">
            <div class="hbar-lab">
              <b>${escapeHtml(f.etiqueta)}</b>
              <span class="hbar-val">${escapeHtml(f.texto)}</span>
            </div>
            <div class="hbar-track">
              <span class="hbar-fill ${f.nivel || clase}" style="width:${Math.abs(f.valor) / max * 100}%"></span>
            </div>
            ${f.meta ? `<div class="hbar-meta">${escapeHtml(f.meta)}</div>` : ""}
          </div>
        `).join("")}
      </div>
      ${nota ? `<p class="grafico-nota">${nota}</p>` : ""}
    </div>
  `;
}

// Barra única segmentada para una composición (ej. valor de bodega por categoría)
function graficoComposicion({ titulo, sub, partes, total }) {
  if (!partes.length || total <= 0) return "";
  const tonos = ["t1", "t2", "t3", "t4", "t5"];
  const mostrar = partes.slice(0, 4);
  const resto = partes.slice(4).reduce((s, p) => s + p.valor, 0);
  if (resto > 0) mostrar.push({ etiqueta: "Otros", valor: resto });

  return `
    <div class="grafico">
      <div class="grafico-head">
        <h3 class="grafico-titulo">${titulo}</h3>
        ${sub ? `<p class="grafico-sub">${sub}</p>` : ""}
      </div>
      <div class="composicion" role="img" aria-label="${mostrar.map(p => `${p.etiqueta} ${Math.round(p.valor / total * 100)}%`).join(", ")}">
        ${mostrar.map((p, i) => `<span class="${tonos[i]}" style="width:${p.valor / total * 100}%"></span>`).join("")}
      </div>
      <div class="composicion-key">
        ${mostrar.map((p, i) => `
          <div>
            <i class="${tonos[i]}"></i>
            <span>${escapeHtml(p.etiqueta)}</span>
            <span class="v">${formatCLP(p.valor)} · ${Math.round(p.valor / total * 100)}%</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function graficoDias(dias) {
  const max = Math.max(...dias.map(d => d.cantidad), 1);
  const total = dias.reduce((s, d) => s + d.cantidad, 0);
  if (!total) return "";

  const pico = dias.reduce((a, b) => (b.cantidad > a.cantidad ? b : a));
  const promedio = total / 7;
  // Solo se destaca un día si de verdad se despega del resto. Con pocos
  // trabajos, o con la carga repartida pareja, decir "el sábado concentra el
  // 16%" sería inventar un patrón que no existe.
  const destaca = total >= 20 && pico.cantidad >= promedio * 1.4;

  const nota = destaca
    ? `El ${pico.diaLargo} concentra el ${Math.round(pico.cantidad / total * 100)}% de tus trabajos — casi
       ${(pico.cantidad / promedio).toFixed(1)} veces un día normal.`
    : `Tu carga está repartida bastante pareja entre los días. Con más trabajos
       registrados va a aparecer el patrón, si es que hay uno.`;

  return `
    <div class="grafico">
      <div class="grafico-head">
        <h3 class="grafico-titulo">Qué días tienes más pega</h3>
        <p class="grafico-sub">Trabajos por día de la semana, en todo tu historial.</p>
      </div>
      <div class="dow">
        ${dias.map(d => `
          <div class="dow-col">
            <span class="dow-val">${d.cantidad}</span>
            <span class="dow-bar ${destaca && d.dia === pico.dia ? "peak" : ""}" style="height:${d.cantidad / max * 100}%"></span>
            <span class="dow-lab">${d.dia}</span>
          </div>
        `).join("")}
      </div>
      <p class="grafico-nota">${nota}</p>
    </div>
  `;
}

// ============================================================
// Vista de Finanzas
// ============================================================

export function renderPagosView(state) {
  const { pagos, trabajos, inventario, periodo = "mes" } = state;

  const r = rangoPeriodo(periodo);
  const m = calcularMetricas(trabajos, pagos, r.desde, r.hasta);
  const mAnt = calcularMetricas(trabajos, pagos, r.desdeAnt, r.hastaAnt);
  const serie = serieMensual(trabajos, pagos, 12);

  const pctGanancia = variacion(m.ganancia, mAnt.ganancia);
  const capital = valorInventario(inventario);

  // ── Estadísticas: se calculan sobre TODO el historial, no sobre el período ──
  const servicios = porServicio(trabajos);
  const marcas = porMarca(trabajos).slice(0, 6);
  const dias = porDiaSemana(trabajos);
  const categorias = inventarioPorCategoria(inventario);

  const mejorServicio = servicios.length
    ? [...servicios].sort((a, b) => b.gananciaPorTrabajo - a.gananciaPorTrabajo)[0]
    : null;
  const peorServicio = servicios.length > 1
    ? [...servicios].sort((a, b) => a.gananciaPorTrabajo - b.gananciaPorTrabajo)[0]
    : null;

  const notaServicios = (mejorServicio && peorServicio && mejorServicio.clave !== peorServicio.clave)
    ? `<b>${escapeHtml(mejorServicio.clave)}</b> deja ${formatCLP(mejorServicio.gananciaPorTrabajo)} por trabajo y
       <b>${escapeHtml(peorServicio.clave)}</b>, ${formatCLP(peorServicio.gananciaPorTrabajo)}.
       La barra mide la plata total; el número al lado, lo que deja cada trabajo.`
    : "";

  // ── Gastos manuales del período ──
  const gastosDelPeriodo = filtrarPorRango(pagos.filter(p => p.tipo === "gasto"), r.desde, r.hasta)
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));

  const gastosHtml = gastosDelPeriodo.length
    ? gastosDelPeriodo.map(p => `
        <div class="card" data-open-pago="${p.id}" style="cursor:pointer;">
          <div class="card-row">
            <div>
              <p class="card-title">${escapeHtml(p.descripcion || "Gasto")}</p>
              <p class="card-meta">${formatDate(p.fecha)}${p.formaPago ? " · " + escapeHtml(p.formaPago) : ""}</p>
            </div>
            <span class="card-amount negative">−${formatCLP(p.monto)}</span>
          </div>
        </div>
      `).join("")
    : `<div class="card"><p style="color:var(--text-muted);font-size:13px;margin:0;">Sin gastos registrados en ${escapeHtml(r.etiqueta.toLowerCase())}.</p></div>`;

  return `
    <div class="view-title">Finanzas</div>
    <div class="view-subtitle">Calculado desde tus trabajos y gastos</div>

    ${renderSelectorPeriodo(periodo)}

    <div class="hero-card" data-dash-detail="ganancia" role="button" tabindex="0">
      <div class="hero-label">Ganancia · ${escapeHtml(r.etiqueta)}</div>
      <div class="hero-value">${formatCLP(m.ganancia)}</div>
      <div class="hero-meta">
        ${pctGanancia === null
          ? `<span class="delta neutro">sin ${escapeHtml(r.etiquetaAnterior)} para comparar</span>`
          : `<span class="delta ${pctGanancia >= 0 ? "bueno" : "malo"}">${pctGanancia >= 0 ? "↑" : "↓"} ${Math.abs(pctGanancia)}% vs ${escapeHtml(r.etiquetaAnterior)}</span>`}
        ${m.margen !== null ? `<span class="hero-margen">margen ${m.margen}%</span>` : ""}
      </div>
      <div class="hero-desglose">
        <span>Ingresos <b>${formatCLP(m.ingresos)}</b></span>
        <span>− Materiales <b>${formatCLP(m.costoMateriales)}</b></span>
        <span>− Gastos <b>${formatCLP(m.gastos)}</b></span>
      </div>
    </div>

    <div class="mini-grid">
      <div class="mini-card">
        <span class="mini-label">Trabajos</span>
        <span class="mini-value">${m.cantidad}</span>
      </div>
      <div class="mini-card">
        <span class="mini-label">Ticket prom.</span>
        <span class="mini-value">${formatCLP(m.ticket)}</span>
      </div>
      <div class="mini-card">
        <span class="mini-label">En bodega</span>
        <span class="mini-value">${formatCLP(capital)}</span>
      </div>
      <div class="mini-card">
        <span class="mini-label">Histórico</span>
        <span class="mini-value">${trabajos.length}</span>
      </div>
    </div>

    ${graficoMensual(serie)}

    ${graficoBarras({
      titulo: "Dónde está realmente la ganancia",
      sub: "Ganancia acumulada por tipo de servicio, en todo tu historial.",
      filas: servicios.map(s => ({
        etiqueta: s.clave,
        valor: s.ganancia,
        texto: `${formatCLP(s.ganancia)}`,
        meta: `${s.cantidad} trabajo${s.cantidad === 1 ? "" : "s"} · ${formatCLP(s.gananciaPorTrabajo)} por trabajo · margen ${s.margen}%`
      })),
      nota: notaServicios,
      clase: "f1"
    })}

    ${graficoBarras({
      titulo: "Rentabilidad por marca",
      sub: "Las seis marcas que más plata te han dejado.",
      filas: marcas.map(x => ({
        etiqueta: x.clave,
        valor: x.ganancia,
        texto: formatCLP(x.ganancia),
        meta: `${x.cantidad} trabajo${x.cantidad === 1 ? "" : "s"} · ${formatCLP(x.gananciaPorTrabajo)} por trabajo`
      })),
      clase: "f3"
    })}

    ${graficoComposicion({
      titulo: "Dónde está tu plata inmovilizada",
      sub: `${formatCLP(capital)} en bodega, repartidos por categoría.`,
      partes: categorias.map(c => ({ etiqueta: c.categoria, valor: c.valor })),
      total: capital
    })}

    ${graficoDias(dias)}

    <div class="detail-section-title">Gastos de ${escapeHtml(r.etiqueta.toLowerCase())}</div>
    ${gastosHtml}
  `;
}

// ============================================================
// Formulario de gasto
// ============================================================

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
