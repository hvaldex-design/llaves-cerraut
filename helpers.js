// ============================================================
// helpers.js — utilidades compartidas
// ============================================================

export function formatCLP(n) {
  const num = Number(n) || 0;
  return "$" + Math.round(num).toLocaleString("es-CL");
}

export function formatDate(d) {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

export function todayInputValue() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
