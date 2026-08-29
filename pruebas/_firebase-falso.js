// Firestore simulado en memoria
export const bd = { inventario: new Map(), trabajos: new Map(), movimientos: [] };
export let escrituras = 0;

export async function addItem(uid, col, data) {
  const id = col + "-" + Math.random().toString(36).slice(2, 8);
  if (col === "movimientos") bd.movimientos.push({ id, ...data });
  else bd[col].set(id, { id, ...data });
  return { id };
}
export async function updateItem(uid, col, id, data) {
  escrituras++;
  bd[col].set(id, { ...bd[col].get(id), ...data });
}
export async function deleteItem(uid, col, id) { bd[col].delete(id); }
export async function aplicarStockEnLote(uid, cambios) {
  for (const { id, stock } of cambios) {
    escrituras++;
    bd.inventario.set(id, { ...bd.inventario.get(id), stock });
  }
}
export function resetEscrituras() { escrituras = 0; }
