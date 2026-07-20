// ============================================================
// taller.js — configuración del nombre y logo del taller
// ============================================================

const KEY_NOMBRE = "cerrauto_taller_nombre";
const KEY_LOGO   = "cerrauto_taller_logo"; // base64

export function getNombreTaller() {
  return localStorage.getItem(KEY_NOMBRE) || "Llaves CerrAuto";
}

export function getLogoTaller() {
  return localStorage.getItem(KEY_LOGO) || null;
}

export function setNombreTaller(nombre) {
  localStorage.setItem(KEY_NOMBRE, nombre.trim() || "Llaves CerrAuto");
}

export function setLogoTaller(base64) {
  localStorage.setItem(KEY_LOGO, base64);
}

export function renderConfigTaller() {
  const nombre = getNombreTaller();
  const logo   = getLogoTaller();
  return `
    <div class="sheet-handle"></div>
    <div class="sheet-header">
      <div class="sheet-title">Configuración del taller</div>
      <button class="sheet-close" data-close-sheet><i class="ti ti-x"></i></button>
    </div>

    <div class="field">
      <label>Nombre del taller</label>
      <input id="input-nombre-taller" value="${nombre}" placeholder="Ej: Cerrajería Automotriz Hugo">
    </div>

    <div class="field">
      <label>Logo del taller <span style="color:var(--text-muted)">(imagen cuadrada recomendada)</span></label>
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px;">
        <div id="logo-preview" style="width:56px;height:56px;border-radius:50%;background:var(--bg-input);border:1px solid var(--border);overflow:hidden;display:flex;align-items:center;justify-content:center;">
          ${logo
            ? `<img src="${logo}" style="width:100%;height:100%;object-fit:cover;">`
            : `<i class="ti ti-building-store" style="font-size:22px;color:var(--text-muted);"></i>`}
        </div>
        <label class="btn" style="width:auto;cursor:pointer;">
          <i class="ti ti-upload"></i> Subir logo
          <input type="file" id="input-logo-taller" accept="image/*" style="display:none;">
        </label>
        ${logo ? `<button class="btn btn-ghost" id="btn-remove-logo" style="width:auto;color:var(--danger);">
          <i class="ti ti-trash"></i>
        </button>` : ""}
      </div>
    </div>

    <div class="field">
      <label>Modo de la interfaz</label>
      <div class="segmented" id="tema-segmented">
        <button type="button" data-tema="dark" class="${document.documentElement.dataset.tema !== 'light' ? 'active' : ''}">
          <i class="ti ti-moon"></i> Oscuro
        </button>
        <button type="button" data-tema="light" class="${document.documentElement.dataset.tema === 'light' ? 'active' : ''}">
          <i class="ti ti-sun"></i> Claro
        </button>
      </div>
    </div>

    <button class="btn btn-primary" id="btn-guardar-taller">
      <i class="ti ti-check"></i> Guardar configuración
    </button>
  `;
}
