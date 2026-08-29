import { parseFechaLocal, formatDate, toInputValue, telefonoWhatsApp } from "./helpers.js";
import { rangoPeriodo, calcularMetricas, variacion, serieMensual, porServicio, inventarioPorCategoria } from "./metricas.js";

let fallos = 0;
const chequear = (etiqueta, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`  ${ok ? "✓" : "✗"} ${etiqueta}: ${JSON.stringify(real)}${ok ? "" : "  ← esperado " + JSON.stringify(esperado)}`);
};

console.log("\n═══ B-01: las fechas no se corren un día ═══\n");
chequear("1 de agosto se muestra como 1", formatDate("2026-08-01"), "01 ago 2026");
chequear("1 de agosto cae en agosto (mes 7)", parseFechaLocal("2026-08-01").getMonth(), 7);
chequear("1 de enero cae en enero (mes 0)", parseFechaLocal("2026-01-01").getMonth(), 0);
chequear("fecha vacía no rompe", formatDate(""), "");
chequear("fecha inválida no rompe", formatDate("no-es-fecha"), "");

console.log("\n═══ B-06: la fecha por defecto es la local ═══\n");
chequear("29 ago 22:30 en Chile", toInputValue(new Date(2026, 7, 29, 22, 30)), "2026-08-29");
chequear("31 dic 23:59 en Chile",  toInputValue(new Date(2026, 11, 31, 23, 59)), "2026-12-31");
chequear("1 ene 00:05 en Chile",   toInputValue(new Date(2026, 0, 1, 0, 5)), "2026-01-01");

console.log("\n═══ Trabajos del día 1 cuentan en su mes ═══\n");
const trabajos = [
  { fecha:"2026-08-01", precioCobrado:45000, costoTotal:12000, tipoServicio:"Duplicado", vehiculoMarca:"Toyota" },
  { fecha:"2026-08-31", precioCobrado:80000, costoTotal:30000, tipoServicio:"Pérdida de llaves", vehiculoMarca:"Kia" },
  { fecha:"2026-07-15", precioCobrado:30000, costoTotal:10000, tipoServicio:"Apertura", vehiculoMarca:"Toyota" }
];
const pagos = [{ tipo:"gasto", fecha:"2026-08-10", monto:15000 }];
const r = rangoPeriodo("mes", new Date(2026, 7, 15));
const m = calcularMetricas(trabajos, pagos, r.desde, r.hasta);
chequear("trabajos de agosto (incluye el 1 y el 31)", m.cantidad, 2);
chequear("etiqueta del período", r.etiqueta, "Agosto 2026");

console.log("\n═══ B-07: una sola fórmula de ganancia ═══\n");
chequear("ingresos", m.ingresos, 125000);
chequear("materiales", m.costoMateriales, 42000);
chequear("gastos manuales incluidos", m.gastos, 15000);
chequear("ganancia = ingresos − materiales − gastos", m.ganancia, 125000 - 42000 - 15000);
chequear("margen", m.margen, 54);
chequear("ticket promedio", m.ticket, 62500);

console.log("\n═══ Períodos ═══\n");
for (const [p, esperado] of [["hoy", 0], ["semana", 0], ["anio", 3]]) {
  const rr = rangoPeriodo(p, new Date(2026, 7, 15));
  chequear(`trabajos en '${p}'`, calcularMetricas(trabajos, pagos, rr.desde, rr.hasta).cantidad, esperado);
}
chequear("variación sin base de comparación", variacion(100, 0), null);
chequear("variación normal", variacion(150, 100), 50);

console.log("\n═══ Agrupaciones ═══\n");
chequear("serie de 3 meses", serieMensual(trabajos, pagos, 3, new Date(2026, 7, 15)).map(x => x.ganancia), [0, 20000, 68000]);
chequear("ganancia por trabajo del mejor servicio", porServicio(trabajos)[0].gananciaPorTrabajo, 50000);

console.log("\n═══ B-15: 'CHIP' y 'chip' son la misma categoría ═══\n");
const inventario = [
  { categoria:"CHIP", stock:2, costoUnitario:1000 },
  { categoria:"chip", stock:3, costoUnitario:1000 },
  { categoria:"Espadín", stock:1, costoUnitario:500 }
];
const cats = inventarioPorCategoria(inventario);
chequear("categorías distintas", cats.length, 2);
chequear("valor de los chips sumado", cats.find(c => c.categoria.toLowerCase() === "chip").valor, 5000);

console.log("\n═══ B-17: teléfonos para WhatsApp ═══\n");
chequear("9 dígitos con 9 adelante", telefonoWhatsApp("9 8765 4321"), "56987654321");
chequear("ya trae el 56", telefonoWhatsApp("+56 9 8765 4321"), "56987654321");
chequear("8 dígitos sin el 9", telefonoWhatsApp("8765 4321"), "56987654321");
chequear("vacío devuelve vacío", telefonoWhatsApp(""), "");

console.log(fallos === 0 ? "\n✅ TODAS LAS PRUEBAS PASARON\n" : `\n❌ ${fallos} PRUEBAS FALLARON\n`);
process.exit(fallos ? 1 : 0);
