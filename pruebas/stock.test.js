import { ajustarStockTrabajo, insumosDelTrabajo, saveTrabajo, deleteTrabajo } from "./trabajos.js";
import { bd, escrituras, resetEscrituras } from "./firebase.js";

// showToast toca el DOM: lo neutralizamos
globalThis.document = { getElementById: () => null, createElement: () => ({ style:{}, classList:{add(){},remove(){}}, appendChild(){}, remove(){} }), body:{ appendChild(){} } };

const UID = "u1";
let fallos = 0;
const chequear = (etiqueta, real, esperado) => {
  const ok = real === esperado;
  if (!ok) fallos++;
  console.log(`  ${ok ? "✓" : "✗"} ${etiqueta}: ${real}${ok ? "" : "  ← esperado " + esperado}`);
};

function inventarioFresco() {
  bd.inventario.clear(); bd.movimientos.length = 0;
  const items = [
    { id:"ctrl1", nombre:"XKHY05EN", categoria:"Control Xhorse", stock:3, usaPila:true, costoUnitario:12500 },
    { id:"ctrl2", nombre:"XKTO00EN", categoria:"Control Xhorse", stock:5, usaPila:true, costoUnitario:11800 },
    { id:"esp1", nombre:"TOY43R", categoria:"Espadín", stock:10, costoUnitario:1200 },
    { id:"chip1", nombre:"ID48", categoria:"CHIP", stock:8, costoUnitario:4200 },
    { id:"pila1", nombre:"Pila CR2032", categoria:"Pila / Batería", stock:20, costoUnitario:350 }
  ];
  for (const i of items) bd.inventario.set(i.id, { ...i });
  return items.map(i => bd.inventario.get(i.id));
}
const stock = (id) => bd.inventario.get(id).stock;
const inv = () => [...bd.inventario.values()];

console.log("\n═══ B-02: editar un trabajo no debe robar stock ═══\n");

console.log("Caso 1 — se edita solo el precio, los insumos no cambian");
inventarioFresco();
const original = { controlId:"ctrl1", espadinId:"esp1", transponderInvId:"", llaveVirgenId:"", tipoServicio:"Duplicado", precioCobrado:45000 };
await ajustarStockTrabajo(UID, inv(), { despues: original });     // crear
chequear("control tras crear", stock("ctrl1"), 2);
chequear("espadín tras crear", stock("esp1"), 9);
chequear("pila tras crear",    stock("pila1"), 19);

const editado = { ...original, precioCobrado: 50000 };
resetEscrituras();
await ajustarStockTrabajo(UID, inv(), { antes: original, despues: editado });
chequear("control tras editar el precio", stock("ctrl1"), 2);
chequear("espadín tras editar el precio", stock("esp1"), 9);
chequear("pila tras editar el precio",    stock("pila1"), 19);

console.log("\nCaso 2 — se edita 5 veces seguidas (antes perdía 5 unidades)");
inventarioFresco();
await ajustarStockTrabajo(UID, inv(), { despues: original });
for (let i = 0; i < 5; i++) await ajustarStockTrabajo(UID, inv(), { antes: original, despues: original });
chequear("control tras 5 ediciones", stock("ctrl1"), 2);
chequear("espadín tras 5 ediciones", stock("esp1"), 9);

console.log("\nCaso 3 — se cambia el control por otro");
inventarioFresco();
await ajustarStockTrabajo(UID, inv(), { despues: original });
const cambiado = { ...original, controlId:"ctrl2" };
await ajustarStockTrabajo(UID, inv(), { antes: original, despues: cambiado });
chequear("control viejo devuelto", stock("ctrl1"), 3);
chequear("control nuevo descontado", stock("ctrl2"), 4);
chequear("espadín sin tocar", stock("esp1"), 9);

console.log("\nCaso 4 — se agrega un chip al trabajo");
inventarioFresco();
await ajustarStockTrabajo(UID, inv(), { despues: original });
await ajustarStockTrabajo(UID, inv(), { antes: original, despues: { ...original, transponderInvId:"chip1" } });
chequear("chip descontado", stock("chip1"), 7);
chequear("control sin tocar", stock("ctrl1"), 2);

console.log("\nCaso 5 — se elimina el trabajo: todo vuelve");
inventarioFresco();
await ajustarStockTrabajo(UID, inv(), { despues: original });
await ajustarStockTrabajo(UID, inv(), { antes: original });
chequear("control devuelto", stock("ctrl1"), 3);
chequear("espadín devuelto", stock("esp1"), 10);
chequear("pila devuelta",    stock("pila1"), 20);

console.log("\nCaso 6 — servicio sin pila (Apertura) no descuenta la pila");
inventarioFresco();
await ajustarStockTrabajo(UID, inv(), { despues: { ...original, tipoServicio:"Apertura" } });
chequear("pila intacta", stock("pila1"), 20);
chequear("control descontado", stock("ctrl1"), 2);

console.log("\nCaso 7 — formato antiguo: el id del espadín venía en espadinCodigo");
inventarioFresco();
const viejo = { controlId:"", espadinCodigo:"esp1", tipoServicio:"Duplicado" };
await ajustarStockTrabajo(UID, inv(), { despues: viejo });
chequear("espadín antiguo descontado", stock("esp1"), 9);

console.log("\nCaso 8 — código del catálogo (TOY43) no toca el inventario");
inventarioFresco();
await ajustarStockTrabajo(UID, inv(), { despues: { controlId:"", espadinCodigo:"TOY43", tipoServicio:"Duplicado" } });
chequear("espadín intacto", stock("esp1"), 10);

console.log("\nCaso 9 — no se puede descontar bajo cero");
inventarioFresco();
bd.inventario.set("ctrl1", { ...bd.inventario.get("ctrl1"), stock:0 });
await ajustarStockTrabajo(UID, inv(), { despues: original });
chequear("control se queda en 0", stock("ctrl1"), 0);

console.log("\n═══ B-08: las devoluciones quedan registradas ═══\n");
inventarioFresco();
bd.movimientos.length = 0;
await ajustarStockTrabajo(UID, inv(), { despues: original });
const salidas = bd.movimientos.filter(m => m.tipo === "salida").length;
await ajustarStockTrabajo(UID, inv(), { antes: original });
const entradas = bd.movimientos.filter(m => m.tipo === "entrada").length;
chequear("movimientos de salida al crear", salidas, 3);
chequear("movimientos de entrada al eliminar", entradas, 3);

console.log("\n═══ Escrituras: una sola por producto ═══\n");
inventarioFresco();
await ajustarStockTrabajo(UID, inv(), { despues: original });
resetEscrituras();
await ajustarStockTrabajo(UID, inv(), { antes: original, despues: { ...original, controlId:"ctrl2" } });
const { escrituras: e } = await import("./firebase.js");
chequear("escrituras al cambiar de control (2 productos)", e, 2);


// ============================================================
// ============================================================
// Costo del trabajo
// ============================================================
// El espadín se cobra plano cuando la llave lleva paletón: control que no sea
// smart key, o chip / llave virgen sin control. Un XS no lleva paletón.
console.log("\n═══ Costo del trabajo ═══\n");
{
  const { calcularCostoDeTrabajo, detalleDeCostos } = await import("./trabajos.js");
  bd.inventario.clear();
  for (const p of [
    { id:"ctrl",  nombre:"XKTO21EN (2 boton)",  categoria:"Control Xhorse", stock:4,  usaPila:true, costoUnitario:5900 },
    { id:"smart", nombre:"XSTO01EN — SMART KEY",categoria:"Control Xhorse", stock:2,  usaPila:true, costoUnitario:14000 },
    { id:"smart2",nombre:"SMART KEY XHORSE",    categoria:"Control Xhorse", stock:2,  usaPila:true, costoUnitario:15000 },
    { id:"kd",    nombre:"KD-B19-4",            categoria:"Control KD",     stock:3,  usaPila:true, costoUnitario:4500 },
    { id:"chip",  nombre:"Super chip",          categoria:"CHIP",           stock:10, costoUnitario:2000 },
    { id:"lv",    nombre:"Llave virgen TOY",    categoria:"Llave virgen",   stock:6,  costoUnitario:2500 },
    { id:"esp",   nombre:"TOY43R",              categoria:"Espadín",        stock:9,  costoUnitario:800 }
  ]) bd.inventario.set(p.id, p);
  const inventario = [...bd.inventario.values()];
  const vacio = { controlId:"", transponderInvId:"", espadinCodigo:"", espadinId:"", llaveVirgenId:"", pincode:0, tipoServicio:"Duplicado" };
  const costo = (d) => calcularCostoDeTrabajo({ ...vacio, ...d }, inventario);
  const hayEspadin = (d) => detalleDeCostos({ ...vacio, ...d }, inventario).lineas.some(l => l.rol === "Espadín");

  chequear("control Xhorse: control + pila + espadín", costo({ controlId:"ctrl" }), 5900 + 1000 + 400);
  chequear("control KD: control + pila + espadín",     costo({ controlId:"kd" }),   4500 + 1000 + 400);

  chequear("smart key XS no cobra espadín",         costo({ controlId:"smart" }),  14000 + 1000);
  chequear("smart key por nombre no cobra espadín", costo({ controlId:"smart2" }), 15000 + 1000);
  chequear("smart key: no aparece la línea",        hayEspadin({ controlId:"smart" }), false);

  chequear("smart key con chip sigue sin espadín",
    costo({ controlId:"smart", transponderInvId:"chip" }), 14000 + 1000 + 2000);

  chequear("solo chip cobra espadín",         costo({ transponderInvId:"chip" }), 2000 + 400);
  chequear("solo llave virgen cobra espadín", costo({ llaveVirgenId:"lv" }),      2500 + 400);

  chequear("control + chip + llave: un solo espadín",
    costo({ controlId:"ctrl", transponderInvId:"chip", llaveVirgenId:"lv" }), 5900 + 2000 + 2500 + 1000 + 400);

  chequear("espadín del catálogo", costo({ controlId:"ctrl", espadinCodigo:"TOY43" }), 5900 + 1000 + 400);
  chequear("espadín del stock",    costo({ controlId:"ctrl", espadinId:"esp" }),       5900 + 1000 + 400);

  chequear("trabajo vacío", costo({}), 0);
  chequear("Apertura no suma pila", costo({ controlId:"ctrl", tipoServicio:"Apertura" }), 5900 + 400);
  chequear("pincode se suma", costo({ controlId:"ctrl", pincode:15000 }), 5900 + 1000 + 400 + 15000);
}
console.log(fallos === 0 ? "\n✅ TODAS LAS PRUEBAS PASARON\n" : `\n❌ ${fallos} PRUEBAS FALLARON\n`);
process.exit(fallos ? 1 : 0);
