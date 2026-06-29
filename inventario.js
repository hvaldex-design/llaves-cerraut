// ============================================================
// inventario.js — vista de Inventario
// ============================================================
import { addItem, updateItem, deleteItem } from "./firebase.js";
import { formatCLP, escapeHtml, showToast } from "./helpers.js";

export const CATEGORIAS = ["Control remoto", "Espadín", "Llave virgen", "Batería / Pila", "Carcasa", "Otro"];

export function renderInventarioView(state) {
  const { inventario } = state;

  if (!inventario.length) {
    return `
      <div class="view-title">Inventario</div>
      <div class="view-subtitle">Tu stock de llaves, controles y repuestos</div>
      <div class="empty">
        <i class="ti ti-box"></i>
        <p>Todavía no tienes productos en inventario.<br>Toca el botón + para agregar el primero.</p>
      </div>
    `;
  }

  const bajoStock = inventario.filter(p => Number(p.stock) <= Number(p.stockMinimo));

  const rows = inventario.map((p) => {
    const isBajo = Number(p.stock) <= Number(p.stockMinimo);
    return `
      <div class="card" data-open-producto="${p.id}">
        <div class="card-row">
          <div>
            <p class="card-title">${escapeHtml(p.nombre)}</p>
            <p class="card-meta">${escapeHtml(p.categoria || "")} ${p.compatibilidad ? "· " + escapeHtml(p.compatibilidad) : ""}</p>
          </div>
          <div style="text-align:right">
            <span class="badge ${isBajo ? "danger" : "ok"}">${p.stock} en stock</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="view-title">Inventario</div>
    <div class="view-subtitle">${inventario.length} producto${inventario.length === 1 ? "" : "s"} registrado${inventario.length === 1 ? "" : "s"}</div>
    ${bajoStock.length ? `
      <div class="card" style="border-color: var(--danger); background: var(--danger-bg);">
        <div class="card-row">
          <p class="card-meta" style="color: var(--danger); margin:0;"><i class="ti ti-alert-triangle"></i> ${bajoStock.length} producto${bajoStock.length === 1 ? "" : "s"} con stock bajo</p>
        </div>
      </div>
    ` : ""}
    ${rows}
  `;
}

export function renderProductoForm(producto = null) {
  const p = producto || {};
  const categoriaActual = p.categoria || CATEGORIAS[0];
  return `
    <div class="sheet-handle"></div>
    <div class="sheet-header">
      <div class="sheet-title">${producto ? "Editar producto" : "Nuevo producto"}</div>
      <button class="sheet-close" data-close-sheet><i class="ti ti-x"></i></button>
    </div>
    <form id="form-producto">
      <div class="field">
        <label>Nombre del producto</label>
        <input name="nombre" placeholder="Xhorse XNDS00EN" value="${escapeHtml(p.nombre || "")}" required>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Categoría</label>
          <select name="categoria" id="select-categoria">
            ${CATEGORIAS.map((c) => `<option value="${c}" ${categoriaActual === c ? "selected" : ""}>${c}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Compatible con</label>
          <input name="compatibilidad" placeholder="Toyota / Lexus" value="${escapeHtml(p.compatibilidad || "")}">
        </div>
      </div>
      <div class="field hidden" id="campo-usa-pila">
        <label>¿Este control usa pila CR2032?</label>
        <div class="segmented" id="usaPila-segmented">
          <button type="button" data-val="si" class="${p.usaPila ? "active" : ""}">Sí</button>
          <button type="button" data-val="no" class="${!p.usaPila ? "active" : ""}">No</button>
        </div>
        <input type="hidden" name="usaPila" id="usaPila-hidden" value="${p.usaPila ? "si" : "no"}">
      </div>
      <div class="field-row">
        <div class="field">
          <label>Stock actual</label>
          <input type="number" name="stock" placeholder="8" value="${p.stock ?? ""}" required min="0" step="1">
        </div>
        <div class="field">
          <label>Stock mínimo</label>
          <input type="number" name="stockMinimo" placeholder="3" value="${p.stockMinimo ?? ""}" min="0" step="1">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Costo unitario</label>
          <input type="number" name="costoUnitario" placeholder="7000" value="${p.costoUnitario ?? ""}" min="0" step="1">
        </div>
        <div class="field">
          <label>Precio de venta</label>
          <input type="number" name="precioVenta" placeholder="15000" value="${p.precioVenta ?? ""}" min="0" step="1">
        </div>
      </div>
      <div class="field">
        <label>Proveedor</label>
        <input name="proveedor" placeholder="Nombre del proveedor" value="${escapeHtml(p.proveedor || "")}">
      </div>
      <button type="submit" class="btn btn-primary">
        <i class="ti ti-check"></i> ${producto ? "Guardar cambios" : "Agregar producto"}
      </button>
    </form>
  `;
}

export function renderProductoDetail(p) {
  const isBajo = Number(p.stock) <= Number(p.stockMinimo);
  const margen = (Number(p.precioVenta) || 0) - (Number(p.costoUnitario) || 0);
  return `
    <div class="sheet-handle"></div>
    <div class="sheet-header">
      <div class="sheet-title">Detalle del producto</div>
      <button class="sheet-close" data-close-sheet><i class="ti ti-x"></i></button>
    </div>

    <div class="detail-header">
      <span class="badge ${isBajo ? "danger" : "ok"}">${isBajo ? "Stock bajo" : "Stock ok"}</span>
    </div>

    <div class="kv-row"><span class="kv-label">Producto</span><span class="kv-value">${escapeHtml(p.nombre)}</span></div>
    <div class="kv-row"><span class="kv-label">Categoría</span><span class="kv-value">${escapeHtml(p.categoria || "—")}</span></div>
    ${p.categoria === "Control remoto" ? `<div class="kv-row"><span class="kv-label">¿Usa pila CR2032?</span><span class="kv-value">${p.usaPila ? "Sí" : "No"}</span></div>` : ""}
    <div class="kv-row"><span class="kv-label">Compatible con</span><span class="kv-value">${escapeHtml(p.compatibilidad || "—")}</span></div>
    <div class="kv-row"><span class="kv-label">Stock actual</span><span class="kv-value mono">${p.stock}</span></div>
    <div class="kv-row"><span class="kv-label">Stock mínimo</span><span class="kv-value mono">${p.stockMinimo ?? 0}</span></div>
    <div class="kv-row"><span class="kv-label">Costo unitario</span><span class="kv-value mono">${formatCLP(p.costoUnitario)}</span></div>
    <div class="kv-row"><span class="kv-label">Precio de venta</span><span class="kv-value mono">${formatCLP(p.precioVenta)}</span></div>
    <div class="kv-row"><span class="kv-label">Margen estimado</span><span class="kv-value mono" style="color: var(--ok)">${formatCLP(margen)}</span></div>
    <div class="kv-row"><span class="kv-label">Proveedor</span><span class="kv-value">${escapeHtml(p.proveedor || "—")}</span></div>

    <div class="detail-section-title">Ajustar stock</div>
    <div class="flex-gap">
      <button class="btn" id="btn-stock-menos"><i class="ti ti-minus"></i> Usar uno</button>
      <button class="btn" id="btn-stock-mas"><i class="ti ti-plus"></i> Sumar uno</button>
    </div>

    <div class="detail-section-title">Acciones</div>
    <div class="flex-gap">
      <button class="btn" id="btn-edit-producto"><i class="ti ti-edit"></i> Editar</button>
      <button class="btn btn-danger" id="btn-delete-producto"><i class="ti ti-trash"></i> Eliminar</button>
    </div>
  `;
}

export function readProductoForm(form) {
  const fd = new FormData(form);
  return {
    nombre: fd.get("nombre")?.trim() || "",
    categoria: fd.get("categoria")?.trim() || "",
    compatibilidad: fd.get("compatibilidad")?.trim() || "",
    usaPila: fd.get("usaPila") === "si",
    stock: Number(fd.get("stock")) || 0,
    stockMinimo: Number(fd.get("stockMinimo")) || 0,
    costoUnitario: Number(fd.get("costoUnitario")) || 0,
    precioVenta: Number(fd.get("precioVenta")) || 0,
    proveedor: fd.get("proveedor")?.trim() || ""
  };
}

export async function saveProducto(uidUser, data, existingId = null) {
  if (existingId) {
    await updateItem(uidUser, "inventario", existingId, data);
    showToast("Producto actualizado", "success");
  } else {
    await addItem(uidUser, "inventario", data);
    showToast("Producto agregado", "success");
  }
}

export async function deleteProducto(uidUser, id) {
  await deleteItem(uidUser, "inventario", id);
  showToast("Producto eliminado", "success");
}

export async function adjustStock(uidUser, producto, delta) {
  const nuevoStock = Math.max(0, Number(producto.stock) + delta);
  await updateItem(uidUser, "inventario", producto.id, { stock: nuevoStock });
}

// Descuenta 1 unidad de stock de un producto por su id (usado al crear un trabajo)
export async function descontarStockPorId(uidUser, inventario, productoId) {
  const producto = inventario.find((p) => p.id === productoId);
  if (!producto) return;
  const nuevoStock = Math.max(0, Number(producto.stock) - 1);
  await updateItem(uidUser, "inventario", productoId, { stock: nuevoStock });
}
