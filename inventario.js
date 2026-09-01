// ============================================================
// inventario.js — Inventario agrupado por categoría con fotos
// ============================================================
import { addItem, updateItem, deleteItem } from "./firebase.js";
import { uploadMedia, borrarMedia } from "./cloudinary.js";
import { formatCLP, escapeHtml, showToast, parseFechaLocal, todayInputValue } from "./helpers.js";

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
export const CATEGORIAS_ESPADIN = ["Espadín", "Espadin", "Espadines"];
export const CATEGORIAS_LLAVE_VIRGEN = ["Llave virgen", "Llaves vírgenes", "Llave vírgen"];
export const CATEGORIA_CHIP = ["CHIP", "Chip", "Transponder"];

// Compara categorías ignorando mayúsculas, espacios y tildes, para que
// "Espadín", "espadin" y "ESPADINES" cuenten como lo mismo y un producto no
// desaparezca de los selectores por un detalle de escritura.
function normalizar(texto) {
  return String(texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function esCategoria(producto, lista) {
  const cat = normalizar(producto?.categoria);
  if (!cat) return false;
  return lista.some(c => normalizar(c) === cat);
}

// Agrupa controles por prefijo (XK, XS, XN etc. para Xhorse; B, NB, ZB para KD)
function getSubgrupo(nombre, categoria) {
  if (!nombre) return "Otros";
  const n = nombre.toUpperCase().trim();
  if (categoria === "Control Xhorse") {
    // Todos los que empiezan con XK van juntos (XK, XKK, XKGD, XKKF...)
    if (n.startsWith("XK")) return "XK";
    if (n.startsWith("XS")) return "XS";
    if (n.startsWith("XN")) return "XN";
    if (n.startsWith("XE")) return "XE";
    if (n.startsWith("XA")) return "XA";
    if (n.startsWith("XP")) return "XP";
    if (n.startsWith("XR")) return "XR";
    if (n.startsWith("XZ")) return "XZ";
    return "Otros";
  }
  if (categoria === "Control KD") {
    const n2 = nombre.toUpperCase().trim();
    if (n2.startsWith("NB")) return "Serie NB";
    if (n2.startsWith("ZB")) return "Serie ZB";
    if (n2.startsWith("B"))  return "Serie B";
    return "Otros";
  }
  return null;
}

// ============================================================
// Rotación de stock
// ============================================================

// Cuántas unidades salieron por mes de un producto, mirando los movimientos de
// salida de los últimos `dias` días.
export function consumoMensual(producto, movimientos, dias = 90) {
  const desde = Date.now() - dias * 24 * 60 * 60 * 1000;
  let salidas = 0;
  for (const m of movimientos) {
    if (m.productoId !== producto.id || m.tipo !== "salida") continue;
    const f = parseFechaLocal(m.fecha);
    if (f && f.getTime() >= desde) salidas += Number(m.cantidad) || 1;
  }
  return (salidas / dias) * 30;
}

// Días de stock que quedan al ritmo de consumo actual.
// null = no hay consumo registrado, no se puede proyectar.
export function diasDeCobertura(producto, movimientos, dias = 90) {
  const porMes = consumoMensual(producto, movimientos, dias);
  if (porMes <= 0) return null;
  return Math.round((Number(producto.stock) || 0) / (porMes / 30));
}

export function nivelCobertura(dias) {
  if (dias === null) return "sin-datos";
  if (dias < 15) return "critico";
  if (dias < 45) return "alerta";
  return "ok";
}

// Plata inmovilizada en bodega: stock × costo unitario
export function valorInventario(inventario) {
  return inventario.reduce((s, p) => s + (Number(p.stock) || 0) * (Number(p.costoUnitario) || 0), 0);
}

// Productos que necesitan reposición: por días de cobertura si hay historial,
// y si no, por el stock mínimo de siempre.
export function productosParaReponer(inventario, movimientos) {
  return inventario
    .map(p => {
      const dias = diasDeCobertura(p, movimientos);
      const nivel = nivelCobertura(dias);
      const bajoMinimo = Number(p.stock) <= Number(p.stockMinimo || 0);
      return { producto: p, dias, nivel, bajoMinimo };
    })
    .filter(x => x.nivel === "critico" || x.nivel === "alerta" || (x.dias === null && x.bajoMinimo))
    .sort((a, b) => {
      if (a.dias === null) return 1;
      if (b.dias === null) return -1;
      return a.dias - b.dias;
    });
}

function iconoDe(p) {
  if (esCategoria(p, CATEGORIAS_CONTROL)) return "device-remote";
  if (esCategoria(p, CATEGORIA_CHIP)) return "key-filled";
  if (esCategoria(p, CATEGORIAS_ESPADIN) || esCategoria(p, CATEGORIAS_LLAVE_VIRGEN)) return "key";
  return "box";
}

function renderItemCard(p) {
  const isBajo = Number(p.stock) <= Number(p.stockMinimo);
  const icono = iconoDe(p);
  return `
    <div class="inv-card" data-open-producto="${p.id}">
      <div class="inv-card-img">
        ${p.fotoUrl
          ? '<img src="' + escapeHtml(p.fotoUrl) + '" alt="' + escapeHtml(p.nombre) + '">'
          : '<div class="inv-card-noimg"><i class="ti ti-' + icono + '"></i></div>'}
        <span class="inv-stock-badge ${isBajo ? "danger" : "ok"}">${p.stock}</span>
      </div>
      <div class="inv-card-body">
        <p class="inv-card-name">${escapeHtml(p.nombre)}</p>
        ${p.compatibilidad ? '<p class="inv-card-compat">' + escapeHtml(p.compatibilidad.slice(0,30)) + (p.compatibilidad.length > 30 ? "…" : "") + '</p>' : ""}
        <div class="inv-quick-stock">
          <button type="button" class="inv-quick-btn" data-stock-menos="${p.id}"><i class="ti ti-minus"></i></button>
          <span class="inv-quick-val">${p.stock}</span>
          <button type="button" class="inv-quick-btn" data-stock-mas="${p.id}"><i class="ti ti-plus"></i></button>
        </div>
      </div>
    </div>
  `;
}

// Exporta todos los datos (trabajos + inventario) a un archivo CSV descargable
export function exportarDatosCSV(trabajos, inventario) {
  const esc = (v) => {
    const s = String(v ?? "").replace(/"/g, '""');
    return `"${s}"`;
  };

  // Hoja de trabajos
  const headTrabajos = ["Fecha","Cliente","Teléfono","Marca","Modelo","Año","Servicio","Sistema","FCC ID","Frecuencia","Costo total","Precio cobrado","Ganancia","Notas"];
  const filasTrabajos = trabajos.map(t => [
    t.fecha || "", t.cliente || "", t.telefono || "",
    t.vehiculoMarca || "", t.vehiculoModelo || "", t.vehiculoAnio || "",
    t.tipoServicio || "", t.sistema || "", t.fccId || "", t.frecuencia || "",
    t.costoTotal || 0, t.precioCobrado || 0,
    (Number(t.precioCobrado)||0) - (Number(t.costoTotal)||0),
    (t.notas || "").replace(/\n/g, " ")
  ].map(esc).join(","));

  // Hoja de inventario
  const headInv = ["Producto","Categoría","Compatible con","Stock","Stock mínimo","Costo unitario","Precio venta","Proveedor"];
  const filasInv = inventario.map(p => [
    p.nombre || "", p.categoria || "", p.compatibilidad || "",
    p.stock || 0, p.stockMinimo || 0, p.costoUnitario || 0, p.precioVenta || 0, p.proveedor || ""
  ].map(esc).join(","));

  const csv = [
    "=== TRABAJOS ===",
    headTrabajos.map(esc).join(","),
    ...filasTrabajos,
    "",
    "=== INVENTARIO ===",
    headInv.map(esc).join(","),
    ...filasInv
  ].join("\n");

  // Descargar
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `respaldo-cerrauto-${todayInputValue()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function renderInventarioView(state) {
  const { inventario, movimientos = [] } = state;

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

  const reponer = productosParaReponer(inventario, movimientos);
  const capital = valorInventario(inventario);
  const todasCats = [...new Set([...CATEGORIAS, ...inventario.map(p => p.categoria || "Otro")])];
  const grupos = {};
  for (const cat of todasCats) grupos[cat] = [];
  for (const p of inventario) {
    const cat = p.categoria || "Otro";
    if (!grupos[cat]) grupos[cat] = [];
    grupos[cat].push(p);
  }

  let html = `
    <div class="view-title">Stock</div>
    <div class="view-subtitle">${inventario.length} producto${inventario.length === 1 ? "" : "s"} · ${formatCLP(capital)} en bodega</div>
  `;

  if (reponer.length) {
    html += `
      <div class="detail-section-title">Hay que reponer</div>
      <div class="card" style="margin-bottom:14px;padding:6px 14px;">
        ${reponer.slice(0, 6).map(({ producto: p, dias, nivel }) => `
          <div class="cobertura-row" data-open-producto-alerta="${p.id}">
            <span class="cobertura-punto ${nivel}"></span>
            <div class="cobertura-info">
              <div class="cobertura-nombre">${escapeHtml(p.nombre)}</div>
              <div class="cobertura-meta">
                Quedan ${p.stock}${dias !== null ? ` · consumo ${(consumoMensual(p, movimientos)).toFixed(1)}/mes` : " · sin historial de consumo"}
              </div>
            </div>
            <span class="cobertura-dias ${nivel}">${dias !== null ? dias + " días" : "bajo mínimo"}</span>
            <i class="ti ti-chevron-right cobertura-chevron"></i>
          </div>
        `).join("")}
        ${reponer.length > 6 ? `<p class="cobertura-mas">y ${reponer.length - 6} más</p>` : ""}
      </div>
    `;
  }

  for (const [cat, items] of Object.entries(grupos)) {
    if (!items.length) continue;
    const usaSubgrupos = ["Control Xhorse", "Control KD"].includes(cat);
    html += `<div class="inv-group-title">${escapeHtml(cat)} <span class="inv-group-count">${items.length}</span></div>`;
    if (usaSubgrupos) {
      const subgrupos = {};
      for (const p of items) {
        const sg = getSubgrupo(p.nombre, cat) || "Otros";
        if (!subgrupos[sg]) subgrupos[sg] = [];
        subgrupos[sg].push(p);
      }
      for (const [sg, sgItems] of Object.entries(subgrupos)) {
        if (!sgItems.length) continue;
        html += `<div class="inv-subgroup-title">${escapeHtml(sg)} <span class="inv-group-count">${sgItems.length}</span></div>`;
        html += `<div class="inv-grid">`;
        for (const p of sgItems) html += renderItemCard(p);
        html += `</div>`;
      }
    } else {
      html += `<div class="inv-grid">`;
      for (const p of items) html += renderItemCard(p);
      html += `</div>`;
    }
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
        <!-- Es un <label> a propósito: el navegador abre el selector de archivos
             solo, sin un handler de clic. Antes era un <div> con el input adentro
             y el clic se disparaba dos veces, cancelando el selector. -->
        <label class="foto-producto-upload" id="foto-producto-zona" for="foto-producto-input">
          ${p.fotoUrl
            ? `<img src="${escapeHtml(p.fotoUrl)}" id="foto-producto-preview" class="foto-producto-preview" alt="">`
            : `<div class="foto-producto-placeholder" id="foto-producto-placeholder">
                <i class="ti ti-camera"></i>
                <span>Subir foto</span>
               </div>`}
        </label>
        <input type="file" id="foto-producto-input" accept="image/*" style="display:none">
        <input type="hidden" name="fotoUrl" id="foto-producto-url" value="${escapeHtml(p.fotoUrl || "")}">
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

export function renderProductoDetail(p, movimientos = []) {
  const isBajo = Number(p.stock) <= Number(p.stockMinimo);
  const margen = (Number(p.precioVenta) || 0) - (Number(p.costoUnitario) || 0);
  const dias = diasDeCobertura(p, movimientos);
  const nivel = nivelCobertura(dias);
  const porMes = consumoMensual(p, movimientos);
  const inmovilizado = (Number(p.stock) || 0) * (Number(p.costoUnitario) || 0);
  const etiquetaNivel = { critico: "Reponer ahora", alerta: "Reponer pronto", ok: "Stock ok", "sin-datos": isBajo ? "Bajo el mínimo" : "Stock ok" }[nivel];
  const claseBadge = nivel === "critico" ? "danger" : nivel === "alerta" ? "warn" : (isBajo && nivel === "sin-datos" ? "danger" : "ok");
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
      <span class="badge ${claseBadge}">${etiquetaNivel}</span>
    </div>

    <div class="kv-row"><span class="kv-label">Producto</span><span class="kv-value">${escapeHtml(p.nombre)}</span></div>
    <div class="kv-row"><span class="kv-label">Categoría</span><span class="kv-value">${escapeHtml(p.categoria || "—")}</span></div>
    ${esCategoria(p, CATEGORIAS_CONTROL) ? `<div class="kv-row"><span class="kv-label">¿Usa pila CR2032?</span><span class="kv-value">${p.usaPila === false ? "No" : "Sí"}</span></div>` : ""}
    <div class="kv-row"><span class="kv-label">Compatible con</span><span class="kv-value">${escapeHtml(p.compatibilidad || "—")}</span></div>
    <div class="kv-row"><span class="kv-label">Stock actual</span><span class="kv-value mono">${p.stock}</span></div>
    <div class="kv-row"><span class="kv-label">Stock mínimo</span><span class="kv-value mono">${p.stockMinimo ?? 0}</span></div>
    <div class="kv-row"><span class="kv-label">Consumo</span><span class="kv-value mono">${porMes > 0 ? porMes.toFixed(1) + " / mes" : "sin datos"}</span></div>
    <div class="kv-row"><span class="kv-label">Cobertura</span><span class="kv-value mono" style="color:var(--${nivel === "critico" ? "danger" : nivel === "alerta" ? "warn" : "ok"})">${dias !== null ? dias + " días" : "—"}</span></div>
    <div class="kv-row"><span class="kv-label">Costo unitario</span><span class="kv-value mono">${formatCLP(p.costoUnitario)}</span></div>
    <div class="kv-row"><span class="kv-label">Precio de venta</span><span class="kv-value mono">${formatCLP(p.precioVenta)}</span></div>
    <div class="kv-row"><span class="kv-label">Margen estimado</span><span class="kv-value mono" style="color:var(--ok)">${formatCLP(margen)}</span></div>
    <div class="kv-row"><span class="kv-label">Plata inmovilizada</span><span class="kv-value mono">${formatCLP(inmovilizado)}</span></div>
    <div class="kv-row"><span class="kv-label">Proveedor</span><span class="kv-value">${escapeHtml(p.proveedor || "—")}</span></div>

    <div class="detail-section-title">Ajustar stock</div>
    <div class="flex-gap">
      <button class="btn" id="btn-stock-menos"><i class="ti ti-minus"></i> Usar uno</button>
      <button class="btn" id="btn-stock-mas"><i class="ti ti-plus"></i> Sumar uno</button>
    </div>

    <div class="detail-section-title">Historial de movimientos</div>
    <div class="mov-lista" id="historial-producto">
      <p style="color:var(--text-muted);font-size:13px;">Cargando...</p>
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

export async function deleteProducto(uidUser, producto) {
  const id = typeof producto === "string" ? producto : producto.id;
  await deleteItem(uidUser, "inventario", id);
  if (producto?.fotoUrl) borrarMedia({ url: producto.fotoUrl, publicId: producto.fotoPublicId, type: "image" });
  showToast("Producto eliminado", "success");
}

export async function adjustStock(uidUser, producto, delta, motivo = null) {
  const nuevoStock = Math.max(0, Number(producto.stock) + delta);
  await updateItem(uidUser, "inventario", producto.id, { stock: nuevoStock });
  await registrarMovimiento(uidUser, {
    productoId: producto.id,
    productoNombre: producto.nombre,
    tipo: delta > 0 ? "entrada" : "salida",
    cantidad: Math.abs(delta),
    stockAnterior: Number(producto.stock),
    stockNuevo: nuevoStock,
    motivo: motivo || (delta > 0 ? "Ajuste manual (+)" : "Ajuste manual (−)")
  });
}

// Registra un movimiento de stock para trazabilidad
export async function registrarMovimiento(uidUser, datos) {
  try {
    await addItem(uidUser, "movimientos", {
      ...datos,
      fecha: new Date().toISOString()
    });
  } catch (e) {
    console.error("No se pudo registrar el movimiento:", e);
  }
}

// Vista del historial de movimientos de un producto
export function renderHistorialProducto(producto, movimientos) {
  const movsProducto = movimientos
    .filter(m => m.productoId === producto.id)
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))
    .slice(0, 30);

  if (!movsProducto.length) {
    return `<p style="color:var(--text-muted);font-size:13px;padding:8px 0;">Sin movimientos registrados todavía.</p>`;
  }

  return movsProducto.map(m => {
    const esSalida = m.tipo === "salida";
    const fecha = m.fecha ? new Date(m.fecha).toLocaleDateString("es-CL", { day:"2-digit", month:"short", year:"2-digit" }) : "";
    const hora = m.fecha ? new Date(m.fecha).toLocaleTimeString("es-CL", { hour:"2-digit", minute:"2-digit" }) : "";
    return `
      <div class="mov-row">
        <div class="mov-icon ${esSalida ? "salida" : "entrada"}">
          <i class="ti ti-${esSalida ? "arrow-down" : "arrow-up"}"></i>
        </div>
        <div class="mov-info">
          <div class="mov-motivo">${escapeHtml(m.motivo || (esSalida ? "Salida" : "Entrada"))}</div>
          <div class="mov-fecha">${fecha} · ${hora}</div>
        </div>
        <div class="mov-cambio">
          <span class="mov-delta ${esSalida ? "neg" : "pos"}">${esSalida ? "−" : "+"}${m.cantidad || 1}</span>
          <span class="mov-stock">${m.stockAnterior} → ${m.stockNuevo}</span>
        </div>
      </div>
    `;
  }).join("");
}

export async function subirFotoProducto(file, onProgress) {
  return uploadMedia(file, onProgress);
}
