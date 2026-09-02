// ============================================================
// pruebas/humo-render.js — llama a TODAS las funciones de render
// ============================================================
// Se corre dentro del navegador (ver LEEME.md). Existe porque un `${mediaHtml}`
// que quedó apuntando a una variable borrada hacía que el formulario de trabajo
// no se dibujara: es un error de ejecución, no de sintaxis, así que ni el
// chequeo de sintaxis ni las pruebas de lógica lo agarraban.

export async function correrHumo() {
  const tr  = await import("../trabajos.js");
  const inv = await import("../inventario.js");
  const pag = await import("../pagos.js");
  const dash = await import("../dashboard.js");
  const tal = await import("../taller.js");

  const inventario = [
    { id: "c1",  nombre: "XKHY05EN", categoria: "Control Xhorse", stock: 3, stockMinimo: 1, costoUnitario: 8000, precioVenta: 20000, usaPila: true },
    { id: "e1",  nombre: "TOY43R",   categoria: "Espadín",        stock: 9, stockMinimo: 2, costoUnitario: 500 },
    { id: "ch1", nombre: "ID48",     categoria: "CHIP",           stock: 4, stockMinimo: 1, costoUnitario: 3000 },
    { id: "lv1", nombre: "Llave TOY",categoria: "Llave virgen",   stock: 6, stockMinimo: 1, costoUnitario: 2500 },
    { id: "p1",  nombre: "Pila CR2032", categoria: "Pila / Batería", stock: 20, stockMinimo: 5, costoUnitario: 400 }
  ];

  const trabajo = {
    id: "t1", cliente: "Juan Pérez", telefono: "+56912345678",
    vehiculoMarca: "Toyota", vehiculoModelo: "Hilux", vehiculoAnio: "2021",
    tipoServicio: "Duplicado", sistema: "Texas DST80",
    transponderInvId: "ch1", controlId: "c1", espadinId: "e1", llaveVirgenId: "",
    fccId: "M3N-40821302", frecuencia: "433.92 MHz",
    pincode: 0, costoTotal: 12300, precioCobrado: 45000,
    fecha: "2026-08-27", notas: "Nota de prueba",
    media: [{ url: "https://x/y.jpg", thumbUrl: "https://x/y.jpg", type: "image", publicId: "y" }]
  };

  const pago = { id: "g1", tipo: "gasto", descripcion: "Compra de llaves", monto: 25000, fecha: "2026-08-20", formaPago: "Efectivo", notas: "" };
  const movimientos = [{ productoId: "c1", productoNombre: "XKHY05EN", tipo: "salida", cantidad: 1, stockAnterior: 4, stockNuevo: 3, motivo: "Usado en trabajo", fecha: new Date().toISOString() }];

  const state = { trabajos: [trabajo], pagos: [pago], inventario, movimientos, periodo: "mes", user: { uid: "u1" }, cargado: {}, conexion: {} };
  const vacio = { trabajos: [], pagos: [], inventario: [], movimientos: [], periodo: "mes", user: { uid: "u1" }, cargado: {}, conexion: {} };

  const casos = [
    ["renderTrabajosView (con datos)",   () => tr.renderTrabajosView(state)],
    ["renderTrabajosView (vacío)",       () => tr.renderTrabajosView(vacio)],
    ["renderTrabajoForm (nuevo)",        () => tr.renderTrabajoForm(null, inventario)],
    ["renderTrabajoForm (editando)",     () => tr.renderTrabajoForm(trabajo, inventario)],
    ["renderTrabajoForm (sin stock)",    () => tr.renderTrabajoForm(null, [])],
    ["renderTrabajoDetail",              () => tr.renderTrabajoDetail(trabajo, inventario)],
    ["renderTrabajoDetail (sin insumos)",() => tr.renderTrabajoDetail({ ...trabajo, controlId: "", espadinId: "", transponderInvId: "" }, inventario)],
    ["renderInventarioView (con datos)", () => inv.renderInventarioView(state)],
    ["renderInventarioView (vacío)",     () => inv.renderInventarioView(vacio)],
    ["renderProductoForm (nuevo)",       () => inv.renderProductoForm(null)],
    ["renderProductoForm (editando)",    () => inv.renderProductoForm(inventario[0])],
    ["renderProductoDetail",             () => inv.renderProductoDetail(inventario[0], movimientos)],
    ["renderHistorialProducto",          () => inv.renderHistorialProducto(inventario[0], movimientos)],
    ["renderPagosView (con datos)",      () => pag.renderPagosView(state)],
    ["renderPagosView (vacío)",          () => pag.renderPagosView(vacio)],
    ["renderPagoForm (nuevo)",           () => pag.renderPagoForm([trabajo], null)],
    ["renderPagoForm (editando)",        () => pag.renderPagoForm([trabajo], pago)],
    ["renderPagoDetail",                 () => pag.renderPagoDetail(pago)],
    ["renderDashboard (con datos)",      () => dash.renderDashboard(state)],
    ["renderDashboard (vacío)",          () => dash.renderDashboard(vacio)],
    ["renderConfigTaller",               () => tal.renderConfigTaller("uid-de-prueba")]
  ];

  for (const tipo of ["trabajos-mes", "ingresos-mes", "costos-mes", "ganancia-mes"]) {
    casos.push([`renderDashboardDetail (${tipo})`, () => dash.renderDashboardDetail(tipo, state)]);
  }

  const fallos = [];
  const caja = document.createElement("div");
  document.body.appendChild(caja);

  for (const [nombre, fn] of casos) {
    try {
      const html = fn();
      if (typeof html !== "string") throw new Error("no devolvió texto");
      // Se inserta de verdad: así también salta el HTML mal formado.
      caja.innerHTML = html;
      if (/undefined|\[object Object\]|NaN/.test(html)) {
        fallos.push(`${nombre}: el HTML contiene undefined / [object Object] / NaN`);
      }
    } catch (e) {
      fallos.push(`${nombre}: ${e.message}`);
    }
  }

  caja.remove();
  return { total: casos.length, fallos };
}
