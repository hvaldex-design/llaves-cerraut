// ============================================================
// taller.js — configuración del taller (nombre, logo, precios)
// ============================================================
// La configuración vive en Firestore (/usuarios/{uid}/config/taller) para que
// viaje con la cuenta a cualquier dispositivo. localStorage se usa solo como
// espejo local, para que la app pinte el nombre y el logo antes de que llegue
// la respuesta de la nube.
import { getConfigTaller, saveConfigTaller } from "./firebase.js";
import { escapeHtml } from "./helpers.js";

const CLAVE_ESPEJO = "cerrauto_taller_config";

// Claves antiguas, para migrar la configuración que ya tenías guardada
const VIEJA_NOMBRE = "cerrauto_taller_nombre";
const VIEJA_LOGO   = "cerrauto_taller_logo";

export const CONFIG_POR_DEFECTO = {
  nombre: "Llaves CerrAuto",
  logoUrl: null,
  precioPila: 1000,      // pila CR2032
  precioEspadin: 400     // corte de espadín
};

let cache = { ...CONFIG_POR_DEFECTO };

function leerEspejo() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_ESPEJO) || "null");
    if (guardado) return guardado;
  } catch {}

  // Migración desde el formato antiguo (nombre y logo sueltos en localStorage)
  const viejoNombre = localStorage.getItem(VIEJA_NOMBRE);
  const viejoLogo = localStorage.getItem(VIEJA_LOGO);
  if (viejoNombre || viejoLogo) {
    return { nombre: viejoNombre || CONFIG_POR_DEFECTO.nombre, logoUrl: viejoLogo || null };
  }
  return null;
}

function escribirEspejo(datos) {
  try { localStorage.setItem(CLAVE_ESPEJO, JSON.stringify(datos)); } catch {}
}

// Lee el espejo local de inmediato (para el primer pintado) y después trae la
// versión de la nube, que manda.
export async function cargarConfigTaller(uid) {
  const local = leerEspejo();
  if (local) cache = { ...CONFIG_POR_DEFECTO, ...local };

  try {
    const remoto = await getConfigTaller(uid);
    if (remoto) {
      cache = { ...CONFIG_POR_DEFECTO, ...remoto };
      escribirEspejo(cache);
    } else if (local) {
      // Primera vez en la nube: subimos lo que había guardado en este equipo
      await saveConfigTaller(uid, cache);
    }
  } catch (e) {
    console.warn("No se pudo leer la configuración del taller:", e);
  }
  return cache;
}

export async function guardarConfigTaller(uid, datos) {
  cache = { ...cache, ...datos };
  escribirEspejo(cache);
  await saveConfigTaller(uid, cache);
  return cache;
}

// Aplica cambios solo en memoria (para la vista previa antes de guardar)
export function setConfigLocal(datos) {
  cache = { ...cache, ...datos };
}

export function getConfigTallerActual() { return { ...cache }; }
export function getNombreTaller()  { return cache.nombre || CONFIG_POR_DEFECTO.nombre; }
export function getLogoTaller()    { return cache.logoUrl || null; }
export function getPrecioPila()    { return Number(cache.precioPila) || 0; }
export function getPrecioEspadin() { return Number(cache.precioEspadin) || 0; }

export function renderConfigTaller(uid = "") {
  const c = getConfigTallerActual();
  const logo = c.logoUrl;
  const temaActual = document.documentElement.dataset.tema === "light" ? "light" : "dark";

  return `
    <div class="sheet-handle"></div>
    <div class="sheet-header">
      <div class="sheet-title">Configuración del taller</div>
      <button class="sheet-close" data-close-sheet><i class="ti ti-x"></i></button>
    </div>

    <div class="field">
      <label>Nombre del taller</label>
      <input id="input-nombre-taller" value="${escapeHtml(c.nombre)}" placeholder="Ej: Cerrajería Automotriz Hugo">
    </div>

    <div class="field">
      <label>Logo del taller <span style="color:var(--text-muted)">(imagen cuadrada recomendada)</span></label>
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px;">
        <div id="logo-preview" style="width:56px;height:56px;border-radius:50%;background:var(--bg-input);border:1px solid var(--border);overflow:hidden;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          ${logo
            ? `<img src="${escapeHtml(logo)}" alt="" style="width:100%;height:100%;object-fit:cover;">`
            : `<i class="ti ti-building-store" style="font-size:22px;color:var(--text-muted);"></i>`}
        </div>
        <label class="btn" style="width:auto;cursor:pointer;">
          <i class="ti ti-upload"></i> Subir logo
          <input type="file" id="input-logo-taller" accept="image/*" style="display:none;">
        </label>
        ${logo ? `<button class="btn btn-ghost" id="btn-remove-logo" style="width:auto;color:var(--danger);" title="Quitar logo">
          <i class="ti ti-trash"></i>
        </button>` : ""}
      </div>
      <div id="logo-progress" class="hidden" style="font-size:12px;color:var(--copper);">Subiendo logo...</div>
    </div>

    <div class="detail-section-title">Precios automáticos</div>
    <p style="font-size:12px;color:var(--text-muted);margin:0 0 12px;">
      Se suman solos al costo de cada trabajo cuando corresponde.
    </p>
    <div class="field-row">
      <div class="field">
        <label>Pila CR2032</label>
        <input type="number" id="input-precio-pila" value="${Number(c.precioPila) || 0}" min="0" step="1">
      </div>
      <div class="field">
        <label>Corte de espadín</label>
        <input type="number" id="input-precio-espadin" value="${Number(c.precioEspadin) || 0}" min="0" step="1">
      </div>
    </div>

    <div class="field">
      <label>Modo de la interfaz</label>
      <div class="segmented" id="tema-segmented">
        <button type="button" data-tema="dark" class="${temaActual === "dark" ? "active" : ""}">
          <i class="ti ti-moon"></i> Oscuro
        </button>
        <button type="button" data-tema="light" class="${temaActual === "light" ? "active" : ""}">
          <i class="ti ti-sun"></i> Claro
        </button>
      </div>
    </div>

    <div class="field">
      <label>Respaldo de datos</label>
      <button type="button" class="btn" id="btn-exportar-datos">
        <i class="ti ti-download"></i> Descargar respaldo (CSV)
      </button>
      <p style="font-size:11px;color:var(--text-muted);margin-top:6px;">
        Descarga todos tus trabajos e inventario en un archivo que puedes abrir en Excel.
      </p>
    </div>

    ${uid ? `
    <div class="field">
      <label>Tu ID de usuario <span style="color:var(--text-muted)">(para las reglas de seguridad)</span></label>
      <div class="uid-box">
        <code id="uid-valor">${escapeHtml(uid)}</code>
        <button type="button" class="btn btn-ghost" id="btn-copiar-uid" style="width:auto;">
          <i class="ti ti-copy"></i>
        </button>
      </div>
    </div>` : ""}

    <button class="btn btn-primary" id="btn-guardar-taller">
      <i class="ti ti-check"></i> Guardar configuración
    </button>
  `;
}
