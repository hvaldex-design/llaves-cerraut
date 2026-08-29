// ============================================================
// metricas.js — una sola fórmula de ganancia para toda la app
// ============================================================
// Antes el panel de inicio calculaba ingresos − costos y Finanzas calculaba
// ingresos − costos − gastos, con la misma etiqueta "ganancia". Acá queda una
// sola definición, siempre acotada a un período explícito.
//
//   ingresos        = lo cobrado a los clientes en el período
//   costoMateriales = el costo de la llave de cada trabajo
//   gastos          = los gastos manuales registrados en Finanzas
//   ganancia        = ingresos − costoMateriales − gastos
import { parseFechaLocal, toInputValue } from "./helpers.js";

export const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
export const MESES_CORTOS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
export const DIAS_CORTOS = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
export const DIAS_LARGOS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];

export const PERIODOS = [
  { id: "hoy",    label: "Hoy" },
  { id: "semana", label: "Semana" },
  { id: "mes",    label: "Mes" },
  { id: "anio",   label: "Año" }
];

function inicioDelDia(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

/**
 * Rango [desde, hasta) del período pedido y del período anterior equivalente,
 * todo en hora local.
 */
export function rangoPeriodo(periodo, ref = new Date()) {
  const hoy = inicioDelDia(ref);

  if (periodo === "hoy") {
    const desde = hoy;
    const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);
    const desdeAnt = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1);
    return { desde, hasta, desdeAnt, hastaAnt: desde, etiqueta: "hoy", etiquetaAnterior: "ayer" };
  }

  if (periodo === "semana") {
    // La semana parte el lunes
    const diaSemana = (hoy.getDay() + 6) % 7;
    const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - diaSemana);
    const hasta = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + 7);
    const desdeAnt = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() - 7);
    return { desde, hasta, desdeAnt, hastaAnt: desde, etiqueta: "esta semana", etiquetaAnterior: "la semana pasada" };
  }

  if (periodo === "anio") {
    const desde = new Date(hoy.getFullYear(), 0, 1);
    const hasta = new Date(hoy.getFullYear() + 1, 0, 1);
    const desdeAnt = new Date(hoy.getFullYear() - 1, 0, 1);
    return { desde, hasta, desdeAnt, hastaAnt: desde, etiqueta: String(hoy.getFullYear()), etiquetaAnterior: String(hoy.getFullYear() - 1) };
  }

  // mes (por defecto)
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  const desdeAnt = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const mesAnt = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  return {
    desde, hasta, desdeAnt, hastaAnt: desde,
    etiqueta: `${MESES[hoy.getMonth()]} ${hoy.getFullYear()}`,
    etiquetaAnterior: MESES[mesAnt.getMonth()].toLowerCase()
  };
}

export function enRango(item, desde, hasta) {
  const f = parseFechaLocal(item?.fecha);
  if (!f) return false;
  return f >= desde && f < hasta;
}

export function filtrarPorRango(items, desde, hasta) {
  return items.filter(i => enRango(i, desde, hasta));
}

const suma = (arr, campo) => arr.reduce((s, x) => s + (Number(x[campo]) || 0), 0);

/**
 * Métricas de un rango. `pagos` son los gastos manuales.
 */
export function calcularMetricas(trabajos, pagos, desde, hasta) {
  const trabajosDel = filtrarPorRango(trabajos, desde, hasta);
  const gastosDel = filtrarPorRango(pagos.filter(p => p.tipo === "gasto"), desde, hasta);

  const ingresos = suma(trabajosDel, "precioCobrado");
  const costoMateriales = suma(trabajosDel, "costoTotal");
  const gastos = suma(gastosDel, "monto");
  const ganancia = ingresos - costoMateriales - gastos;

  return {
    trabajos: trabajosDel,
    cantidad: trabajosDel.length,
    ingresos,
    costoMateriales,
    gastos,
    ganancia,
    margen: ingresos > 0 ? Math.round(ganancia / ingresos * 100) : null,
    ticket: trabajosDel.length ? Math.round(ingresos / trabajosDel.length) : 0
  };
}

// Variación porcentual entre dos valores, cuidando la división por cero
export function variacion(actual, anterior) {
  if (anterior === 0) return actual === 0 ? 0 : null;   // null = "sin base de comparación"
  return Math.round((actual - anterior) / Math.abs(anterior) * 100);
}

/**
 * Serie de los últimos N meses: [{ clave, etiqueta, ingresos, costos, gastos, ganancia, cantidad }]
 */
export function serieMensual(trabajos, pagos, meses = 12, ref = new Date()) {
  const serie = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    const desde = d;
    const hasta = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const m = calcularMetricas(trabajos, pagos, desde, hasta);
    serie.push({
      clave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      etiqueta: MESES_CORTOS[d.getMonth()],
      anio: d.getFullYear(),
      cantidad: m.cantidad,
      ingresos: m.ingresos,
      costos: m.costoMateriales + m.gastos,
      ganancia: m.ganancia,
      ticket: m.ticket
    });
  }
  return serie;
}

// ---------- Agrupaciones ----------

function agrupar(trabajos, clave) {
  const mapa = new Map();
  for (const t of trabajos) {
    const k = clave(t);
    const actual = mapa.get(k) || { clave: k, cantidad: 0, ingresos: 0, costos: 0, ganancia: 0 };
    actual.cantidad += 1;
    actual.ingresos += Number(t.precioCobrado) || 0;
    actual.costos += Number(t.costoTotal) || 0;
    actual.ganancia = actual.ingresos - actual.costos;
    mapa.set(k, actual);
  }
  return [...mapa.values()].map(x => ({
    ...x,
    gananciaPorTrabajo: x.cantidad ? Math.round(x.ganancia / x.cantidad) : 0,
    ticket: x.cantidad ? Math.round(x.ingresos / x.cantidad) : 0,
    margen: x.ingresos > 0 ? Math.round(x.ganancia / x.ingresos * 100) : 0
  }));
}

export function porServicio(trabajos) {
  return agrupar(trabajos, t => t.tipoServicio || "Sin tipo").sort((a, b) => b.ganancia - a.ganancia);
}

export function porMarca(trabajos) {
  return agrupar(trabajos, t => (t.vehiculoMarca || "Sin marca").trim()).sort((a, b) => b.ganancia - a.ganancia);
}

export function porDiaSemana(trabajos) {
  const conteo = [0, 0, 0, 0, 0, 0, 0];
  for (const t of trabajos) {
    const f = parseFechaLocal(t.fecha);
    if (f) conteo[f.getDay()] += 1;
  }
  // Se devuelve empezando por lunes
  return [1, 2, 3, 4, 5, 6, 0].map(i => ({
    dia: DIAS_CORTOS[i],
    diaLargo: DIAS_LARGOS[i],
    cantidad: conteo[i]
  }));
}

// Valor de la bodega agrupado por categoría.
// Se agrupa ignorando mayúsculas y tildes, para que "CHIP" y "chip" no
// aparezcan como dos categorías distintas. Se muestra la forma más usada.
export function inventarioPorCategoria(inventario) {
  const clave = (c) => String(c || "Otro").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const mapa = new Map();

  for (const p of inventario) {
    const k = clave(p.categoria);
    const valor = (Number(p.stock) || 0) * (Number(p.costoUnitario) || 0);
    const actual = mapa.get(k) || { valor: 0, etiquetas: new Map() };
    actual.valor += valor;
    const etiqueta = (p.categoria || "Otro").trim();
    actual.etiquetas.set(etiqueta, (actual.etiquetas.get(etiqueta) || 0) + 1);
    mapa.set(k, actual);
  }

  return [...mapa.values()]
    .map(({ valor, etiquetas }) => ({
      categoria: [...etiquetas.entries()].sort((a, b) => b[1] - a[1])[0][0],
      valor
    }))
    .filter(x => x.valor > 0)
    .sort((a, b) => b.valor - a.valor);
}

export { toInputValue };
