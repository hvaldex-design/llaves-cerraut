// ============================================================
// inventario.js — Inventario agrupado por categoría con fotos
// ============================================================
import { addItem, updateItem, deleteItem } from "./firebase.js";
import { uploadMedia } from "./cloudinary.js";
import { formatCLP, escapeHtml, showToast } from "./helpers.js";

export const CATEGORIAS = [
  "Control Xhorse",
  "Control KD",
  "Control Genérico",
  "Control Autel",
  "CHIP",
  "Espadín",
  "Carcasa",
  "Llave virgen",
  "Pila / Batería",
  "Otro"
];

// Categorías que son controles remotos (para lógica de pila y selector)
export const CATEGORIAS_CONTROL = ["Control Xhorse", "Control KD", "Control Genérico", "Control Autel", "Control remoto"];
export const CATEGORIAS_ESPADIN = ["Espadín"];
export const CATEGORIAS_TRANSPONDER_BASE = ["CHIP", "Chip", "chip"];

// Devuelve todas las categorías que son transponder:
// las base + las categorías personalizadas guardadas que el usuario marcó como chip
export function getCategoriaTransponder() {
  // Solo muestra productos con categoría "CHIP" (en cualquier capitalización)
  // más cualquier categoría custom que el usuario haya guardado como chip
  try {
    const saved = JSON.parse(localStorage.getItem("cerrauto_categorias_custom") || "[]");
    return [...new Set(["CHIP", "Chip", "chip", ...saved])];
  } catch {
    return ["CHIP", "Chip", "chip"];
  }
}

export const CATEGORIAS_TRANSPONDER = CATEGORIAS_TRANSPONDER_BASE;

export function renderInventarioView(state) {
  const { inventario } = state;

  if (!inventario.length) {
    return `
      <div class="view-title">Stock</div>
      <div class="view-subtitle">Tu inventario de insumos</div>
      <div class="empty">
        <i class="ti ti-box"></i>
        <p>Todavía no tienes productos en inventario.<br>Toca el botón + para agregar el primero.</p>
      </div>
    `;
  }

  // Agrupar por categoría
  const grupos = {};
  for (const cat of CATEGORIAS) grupos[cat] = [];
  for (const p of inventario) {
    const cat = p.categoria || "Otro";
    if (!grupos[cat]) grupos[cat] = [];
    grupos[cat].push(p);
  }

  const bajosStock = inventario.filter(p => Number(p.stock) <= Number(p.stockMinimo));

  let html = `
    <div class="view-title">Stock</div>
    <div class="view-subtitle">${inventario.length} producto${inventario.length === 1 ? "" : "s"} en inventario</div>
  `;

  if (bajosStock.length) {
    html += `
      <div class="card" style="border-color:var(--danger);background:var(--danger-bg);margin-bottom:14px;">
        <div class="card-row">
          <p class="card-meta" style="color:var(--danger);margin:0;">
            <i class="ti ti-alert-triangle"></i> ${bajosStock.length} producto${bajosStock.length === 1 ? "" : "s"} con stock bajo
          </p>
        </div>
      </div>
    `;
  }

  for (const [cat, items] of Object.entries(grupos)) {
    if (!items.length) continue;
    html += `<div class="inv-group-title">${escapeHtml(cat)} <span class="inv-group-count">${items.length}</span></div>`;
    html += `<div class="inv-grid">`;
    for (const p of items) {
      const isBajo = Number(p.stock) <= Number(p.stockMinimo);
      html += `
        <div class="inv-card" data-open-producto="${p.id}">
          <div class="inv-card-img">
            ${p.fotoUrl
              ? `<img src="${escapeHtml(p.fotoUrl)}" alt="${escapeHtml(p.nombre)}">`
              : `<div class="inv-card-noimg"><i class="ti ti-${CATEGORIAS_CONTROL.includes(p.categoria) ? 'device-remote' : p.categoria === 'Espadín' ? 'key' : 'box'}"></i></div>`}
            <span class="inv-stock-badge ${isBajo ? 'danger' : 'ok'}">${p.stock}</span>
          </div>
          <div class="inv-card-body">
            <p class="inv-card-name">${escapeHtml(p.nombre)}</p>
            ${p.compatibilidad ? `<p class="inv-card-compat">${escapeHtml(p.compatibilidad.slice(0,30))}${p.compatibilidad.length > 30 ? "…" : ""}</p>` : ""}
          </div>
        </div>
      `;
    }
    html += `</div>`;
  }

  return html;
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
        <label>Foto del producto</label>
        <div class="foto-producto-upload" id="foto-producto-zona">
          ${p.fotoUrl
            ? `<img src="${escapeHtml(p.fotoUrl)}" id="foto-producto-preview" class="foto-producto-preview">`
            : `<div class="foto-producto-placeholder" id="foto-producto-placeholder">
                <i class="ti ti-camera"></i>
                <span>Subir foto</span>
               </div>`}
          <input type="file" id="foto-producto-input" accept="image/*" style="display:none">
          <input type="hidden" name="fotoUrl" id="foto-producto-url" value="${escapeHtml(p.fotoUrl || "")}">
        </div>
        <div id="foto-producto-progress" class="hidden" style="font-size:12px;color:var(--copper);margin-top:6px;text-align:center;">Subiendo foto...</div>
      </div>

      <div class="field">
        <label>Categoría</label>
        <select name="categoria" id="select-categoria">
          ${(() => {
            try {
              const custom = JSON.parse(localStorage.getItem("cerrauto_categorias_custom") || "[]");
              const todas = [...new Set([...CATEGORIAS, ...custom])];
              return todas.map(c => `<option value="${c}" ${categoriaActual === c ? "selected" : ""}>${c}</option>`).join("");
            } catch {
              return CATEGORIAS.map(c => `<option value="${c}" ${categoriaActual === c ? "selected" : ""}>${c}</option>`).join("");
            }
          })()}
          <option value="__nueva__">+ Nueva categoría...</option>
        </select>
        <input type="text" name="categoriaNueva" id="input-categoria-nueva"
               placeholder="Escribe el nombre de la nueva categoría"
               style="margin-top:8px;display:none;"
               value="">
      </div>

      <div class="field">
        <label>Nombre / Código del producto</label>
        <input name="nombre" placeholder="Ej: XKHY05EN, KD-B31, TOY43R..." value="${escapeHtml(p.nombre || "")}" required>
      </div>

      <div class="field">
        <label>Compatible con</label>
        <input name="compatibilidad" placeholder="Ej: Toyota, Hyundai, Kia..." value="${escapeHtml(p.compatibilidad || "")}">
      </div>

      <div class="field hidden" id="campo-usa-pila">
        <label>¿Este control usa pila CR2032?</label>
        <div class="segmented" id="usaPila-segmented">
          <button type="button" data-val="si" class="${p.usaPila !== false ? "active" : ""}">Sí</button>
          <button type="button" data-val="no" class="${p.usaPila === false ? "active" : ""}">No</button>
        </div>
        <input type="hidden" name="usaPila" id="usaPila-hidden" value="${p.usaPila === false ? "no" : "si"}">
      </div>

      <div class="field-row">
        <div class="field">
          <label>Stock actual</label>
          <input type="number" name="stock" placeholder="0" value="${p.stock ?? ""}" required min="0" step="1">
        </div>
        <div class="field">
          <label>Stock mínimo</label>
          <input type="number" name="stockMinimo" placeholder="1" value="${p.stockMinimo ?? ""}" min="0" step="1">
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label>Costo unitario</label>
          <input type="number" name="costoUnitario" placeholder="0" value="${p.costoUnitario ?? ""}" min="0" step="1">
        </div>
        <div class="field">
          <label>Precio de venta</label>
          <input type="number" name="precioVenta" placeholder="0" value="${p.precioVenta ?? ""}" min="0" step="1">
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

    ${p.fotoUrl ? `
      <div style="text-align:center;margin-bottom:16px;">
        <img src="${escapeHtml(p.fotoUrl)}" style="width:140px;height:140px;object-fit:contain;border-radius:12px;border:1px solid var(--border);background:var(--bg-input);">
      </div>` : ""}

    <div class="detail-header">
      <span class="badge ${isBajo ? "danger" : "ok"}">${isBajo ? "Stock bajo" : "Stock ok"}</span>
    </div>

    <div class="kv-row"><span class="kv-label">Producto</span><span class="kv-value">${escapeHtml(p.nombre)}</span></div>
    <div class="kv-row"><span class="kv-label">Categoría</span><span class="kv-value">${escapeHtml(p.categoria || "—")}</span></div>
    ${CATEGORIAS_CONTROL.includes(p.categoria) ? `<div class="kv-row"><span class="kv-label">¿Usa pila CR2032?</span><span class="kv-value">${p.usaPila === false ? "No" : "Sí"}</span></div>` : ""}
    <div class="kv-row"><span class="kv-label">Compatible con</span><span class="kv-value">${escapeHtml(p.compatibilidad || "—")}</span></div>
    <div class="kv-row"><span class="kv-label">Stock actual</span><span class="kv-value mono">${p.stock}</span></div>
    <div class="kv-row"><span class="kv-label">Stock mínimo</span><span class="kv-value mono">${p.stockMinimo ?? 0}</span></div>
    <div class="kv-row"><span class="kv-label">Costo unitario</span><span class="kv-value mono">${formatCLP(p.costoUnitario)}</span></div>
    <div class="kv-row"><span class="kv-label">Precio de venta</span><span class="kv-value mono">${formatCLP(p.precioVenta)}</span></div>
    <div class="kv-row"><span class="kv-label">Margen estimado</span><span class="kv-value mono" style="color:var(--ok)">${formatCLP(margen)}</span></div>
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
  const catSelect = fd.get("categoria")?.trim() || "";
  const catNueva = fd.get("categoriaNueva")?.trim() || "";
  const categoriaFinal = catSelect === "__nueva__" ? catNueva : catSelect;

  // Guardar la categoría nueva en localStorage para que aparezca en próximas veces
  if (catSelect === "__nueva__" && catNueva) {
    try {
      const saved = JSON.parse(localStorage.getItem("cerrauto_categorias_custom") || "[]");
      if (!saved.includes(catNueva)) {
        saved.push(catNueva);
        localStorage.setItem("cerrauto_categorias_custom", JSON.stringify(saved));
      }
    } catch {}
  }

  return {
    nombre: fd.get("nombre")?.trim() || "",
    categoria: categoriaFinal,
    compatibilidad: fd.get("compatibilidad")?.trim() || "",
    usaPila: fd.get("usaPila") !== "no",
    fotoUrl: fd.get("fotoUrl") || "",
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

export async function descontarStockPorId(uidUser, inventario, productoId) {
  const producto = inventario.find(p => p.id === productoId);
  if (!producto) return;
  const nuevoStock = Math.max(0, Number(producto.stock) - 1);
  await updateItem(uidUser, "inventario", productoId, { stock: nuevoStock });
}

export async function subirFotoProducto(file, onProgress) {
  return uploadMedia(file, onProgress);
}
