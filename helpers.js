// ============================================================
// helpers.js — utilidades compartidas
// ============================================================

export function formatCLP(n) {
  const num = Number(n) || 0;
  return "$" + Math.round(num).toLocaleString("es-CL");
}

// Las fechas se guardan como texto "YYYY-MM-DD". Si se las pasamos directo a
// new Date(), JavaScript las interpreta como medianoche UTC y en Chile terminan
// mostrándose un día antes. Esta función las arma como fecha local.
export function parseFechaLocal(f) {
  if (!f) return null;
  if (f instanceof Date) return isNaN(f.getTime()) ? null : f;
  const texto = String(f).trim();
  const m = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(texto);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(d) {
  const date = parseFechaLocal(d);
  if (!date) return "";
  return date.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

// Devuelve "YYYY-MM-DD" del día de hoy en hora local (toISOString daría UTC,
// que después de las ~20:00 en Chile ya es el día siguiente).
export function toInputValue(date) {
  const d = date instanceof Date ? date : new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function todayInputValue() {
  return toInputValue(new Date());
}

// "YYYY-MM" del mes de una fecha guardada, en hora local
export function mesDe(fecha) {
  const d = parseFechaLocal(fecha);
  return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "";
}

export function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let toastTimer = null;
export function showToast(message, type = "default") {
  const existing = document.getElementById("toast");
  if (existing) existing.remove();
  clearTimeout(toastTimer);

  const el = document.createElement("div");
  el.id = "toast";
  el.className = `toast ${type === "error" ? "error" : type === "success" ? "success" : ""}`;
  el.innerHTML = `
    <i class="ti ti-${type === "error" ? "alert-circle" : type === "success" ? "check" : "info-circle"}"></i>
    <span>${escapeHtml(message)}</span>
  `;
  document.body.appendChild(el);

  toastTimer = setTimeout(() => el.remove(), 3200);
}

// Confirmación propia (reemplaza a confirm(), que en el celular se ve fuera de
// lugar y bloquea la app). Devuelve una promesa que resuelve true/false.
export function confirmar({ titulo, mensaje, aceptar = "Eliminar", peligro = true }) {
  return new Promise((resolve) => {
    const previo = document.getElementById("confirm-backdrop");
    if (previo) previo.remove();

    const backdrop = document.createElement("div");
    backdrop.className = "confirm-backdrop";
    backdrop.id = "confirm-backdrop";
    backdrop.innerHTML = `
      <div class="confirm-box" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <div class="confirm-title" id="confirm-title">${escapeHtml(titulo)}</div>
        ${mensaje ? `<p class="confirm-msg">${escapeHtml(mensaje)}</p>` : ""}
        <div class="confirm-acciones">
          <button type="button" class="btn" data-confirm-no>Cancelar</button>
          <button type="button" class="btn ${peligro ? "btn-danger" : "btn-primary"}" data-confirm-si>${escapeHtml(aceptar)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const cerrar = (valor) => {
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      resolve(valor);
    };
    const onKey = (e) => {
      if (e.key === "Escape") cerrar(false);
      if (e.key === "Enter") cerrar(true);
    };

    backdrop.querySelector("[data-confirm-si]").addEventListener("click", () => cerrar(true));
    backdrop.querySelector("[data-confirm-no]").addEventListener("click", () => cerrar(false));
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) cerrar(false); });
    document.addEventListener("keydown", onKey);
    backdrop.querySelector("[data-confirm-si]").focus();
  });
}

// Normaliza un teléfono chileno al formato que espera wa.me (56XXXXXXXXX).
// Devuelve "" si no logra armar algo razonable.
export function telefonoWhatsApp(tel) {
  const d = String(tel || "").replace(/[^0-9]/g, "");
  if (!d) return "";
  if (d.startsWith("56") && d.length >= 11) return d;       // ya trae país
  if (d.length === 9 && d.startsWith("9")) return "56" + d;  // 9 1234 5678
  if (d.length === 8) return "569" + d;                      // 1234 5678
  return d;                                                  // extranjero u otro largo
}
