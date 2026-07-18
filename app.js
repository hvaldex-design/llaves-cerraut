// ============================================================
// app.js — núcleo de la aplicación
// ============================================================
import { auth, loginWithGoogle, logout, watchAuth, watchCollection, updateItem } from "./firebase.js";
import { uploadMedia } from "./cloudinary.js";
import { showToast } from "./helpers.js";
import {
  renderTrabajosView, renderTrabajoForm, renderTrabajoDetail,
  readTrabajoForm, saveTrabajo, saveTrabajoYDevolverId, deleteTrabajo, addMediaToTrabajo,
  removeMediaFromTrabajo, calcularCostoAutomatico
} from "./trabajos.js";
import {
  renderPagosView, renderPagoForm, readPagoForm, savePago, deletePago
} from "./pagos.js";
import {
  renderInventarioView, renderProductoForm, renderProductoDetail,
  readProductoForm, saveProducto, deleteProducto, adjustStock
} from "./inventario.js";

const state = {
  user: null,
  view: "trabajos", // trabajos | pagos | inventario
  trabajos: [],
  pagos: [],
  inventario: [],
  unsubscribers: [],
  sheet: null // { type, payload }
};

const root = document.getElementById("app");

// ---------------- Auth ----------------

watchAuth((user) => {
  state.user = user;
  if (user) {
    subscribeData();
    renderApp();
  } else {
    state.unsubscribers.forEach((fn) => fn());
    state.unsubscribers = [];
    renderLogin();
  }
});

function subscribeData() {
  state.unsubscribers.forEach((fn) => fn());
  state.unsubscribers = [
    watchCollection(state.user.uid, "trabajos", (items) => { state.trabajos = items; renderCurrentView(); }),
    watchCollection(state.user.uid, "pagos", (items) => { state.pagos = items; renderCurrentView(); }),
    watchCollection(state.user.uid, "inventario", (items) => { state.inventario = items; renderCurrentView(); })
  ];
}

function renderLogin() {
  root.innerHTML = `
    <div class="login-screen">
      ${keyIconSvg(64)}
      <div class="login-title">Llaves <span>CerrAuto</span></div>
      <div class="login-subtitle">Tus trabajos, pagos e inventario de cerrajería automotriz, en un solo lugar.</div>
      <button class="btn btn-google" id="btn-login">
        <i class="ti ti-brand-google"></i> Continuar con Google
      </button>
      <div class="login-footnote">Tus datos se guardan de forma privada y solo tú puedes verlos.</div>
    </div>
  `;
  document.getElementById("btn-login").addEventListener("click", async () => {
    try {
      await loginWithGoogle();
    } catch (e) {
      showToast("No se pudo iniciar sesión. Intenta de nuevo.", "error");
    }
  });
}

// ---------------- Shell de la app ----------------

function renderApp() {
  root.innerHTML = `
    <div class="topbar">
      <div class="brand">
        ${keyIconSvg(28)}
        <div class="brand-text">Llaves <span>CerrAuto</span></div>
      </div>
      <button class="topbar-action" id="btn-logout"><i class="ti ti-logout"></i></button>
    </div>
    <div class="view" id="view-container"></div>
    <button class="fab" id="fab-add"><i class="ti ti-plus"></i></button>
    <nav class="bottomnav">
      <div class="bottomnav-inner">
        <button class="navbtn" data-view="trabajos"><i class="ti ti-key"></i>Trabajos</button>
        <button class="navbtn" data-view="pagos"><i class="ti ti-chart-bar"></i>Finanzas</button>
        <button class="navbtn" data-view="inventario"><i class="ti ti-box"></i>Stock</button>
      </div>
    </nav>
  `;

  document.getElementById("btn-logout").addEventListener("click", async () => {
    await logout();
    showToast("Sesión cerrada", "success");
  });

  document.querySelectorAll(".navbtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.view = btn.dataset.view;
      renderCurrentView();
    });
  });

  document.getElementById("fab-add").addEventListener("click", () => {
    if (state.view === "trabajos") openSheet("trabajo-form");
    else if (state.view === "pagos") openSheet("pago-form");
    else openSheet("producto-form");
  });

  renderCurrentView();
}

function renderCurrentView() {
  if (!state.user) return;
  document.querySelectorAll(".navbtn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === state.view);
  });

  const container = document.getElementById("view-container");
  if (!container) return;

  if (state.view === "trabajos") {
    container.innerHTML = renderTrabajosView(state);
    container.querySelectorAll("[data-open-trabajo]").forEach((card) => {
      card.addEventListener("click", () => openSheet("trabajo-detail", card.dataset.openTrabajo));
    });
    // Buscador
    const buscarInput = document.getElementById("buscar-trabajo");
    if (buscarInput) {
      buscarInput.addEventListener("input", () => {
        const q = buscarInput.value.toLowerCase().trim();
        const cards = container.querySelectorAll(".trabajo-card");
        let visible = 0;
        cards.forEach(c => {
          const match = !q || c.dataset.search.includes(q);
          c.classList.toggle("hidden", !match);
          if (match) visible++;
        });
        const sinRes = document.getElementById("sin-resultados");
        if (sinRes) sinRes.classList.toggle("hidden", visible > 0 || !q);
      });
    }
  } else if (state.view === "pagos") {
    container.innerHTML = renderPagosView(state);
    container.querySelectorAll("[data-open-pago]").forEach((card) => {
      card.addEventListener("click", () => openSheet("pago-form", card.dataset.openPago));
    });
  } else {
    container.innerHTML = renderInventarioView(state);
    container.querySelectorAll("[data-open-producto]").forEach((card) => {
      card.addEventListener("click", () => openSheet("producto-detail", card.dataset.openProducto));
    });
  }
}

// ---------------- Helpers de creación de trabajo con media ----------------

async function uploadMediaWrapper(file, onProgress) {
  return uploadMedia(file, onProgress);
}

async function saveTrabajoConMedia(uidUser, data, inventario, mediaLocal) {
  const newId = await saveTrabajoYDevolverId(uidUser, data, inventario);
  if (mediaLocal.length) {
    await updateItem(uidUser, "trabajos", newId, { media: mediaLocal });
  }
}

// ---------------- Sheets (modales inferiores) ----------------

function openSheet(type, id = null) {
  state.sheet = { type, id };
  renderSheet();
}

function closeSheet() {
  const backdrop = document.getElementById("sheet-backdrop");
  if (backdrop) backdrop.remove();
  state.sheet = null;
}

function renderSheet() {
  const existing = document.getElementById("sheet-backdrop");
  if (existing) existing.remove();

  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";
  backdrop.id = "sheet-backdrop";
  backdrop.innerHTML = `<div class="sheet" id="sheet-content"></div>`;
  document.body.appendChild(backdrop);

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeSheet();
  });

  const content = document.getElementById("sheet-content");
  const { type, id } = state.sheet;

  if (type === "trabajo-form") {
    const trabajo = id ? state.trabajos.find((t) => t.id === id) : null;
    // Mientras se crea/edita, mantenemos una copia local de media para poder agregar/quitar antes de guardar
    const mediaLocal = trabajo ? [...(trabajo.media || [])] : [];
    content.innerHTML = renderTrabajoForm(trabajo, state.inventario);
    bindCloseButtons();

    const selectControl = document.getElementById("select-control");
    const selectEspadin = document.getElementById("select-espadin");
    const selectTipoServicio = document.getElementById("select-tipo-servicio");
    const inputPincode = document.getElementById("input-pincode");
    const inputCostoTotal = document.getElementById("input-costo-total");

    function recalcularCosto() {
      const opcionControl = selectControl.selectedOptions[0];
      const controlCosto = opcionControl ? Number(opcionControl.dataset.costo || 0) : 0;
      const controlUsaPila = opcionControl ? opcionControl.dataset.pila === "1" : false;
      const espadinSeleccionado = !!selectEspadin.value;  // cualquier espadín suma $300
      const total = calcularCostoAutomatico({
        tipoServicio: selectTipoServicio.value,
        controlCosto,
        controlUsaPila: selectControl.value ? controlUsaPila : false,
        espadinSeleccionado,
        pincode: inputPincode.value
      });
      inputCostoTotal.value = total;
    }

    [selectControl, selectEspadin, selectTipoServicio, inputPincode].forEach((el) => {
      el.addEventListener("input", recalcularCosto);
      el.addEventListener("change", recalcularCosto);
    });
    if (!trabajo) recalcularCosto(); // valor inicial al crear un trabajo nuevo

    function renderMediaTiles() {
      const grid = content.querySelector(".media-grid");
      const tilesHtml = mediaLocal.map((m, i) => `
        <div class="media-thumb ${m.type === "video" ? "is-video" : ""}">
          <img src="${m.thumbUrl || m.url}" alt="">
          <button type="button" class="media-remove-btn" data-remove-local="${i}"><i class="ti ti-x"></i></button>
        </div>
      `).join("");
      grid.querySelectorAll(".media-thumb").forEach((el) => el.remove());
      grid.insertAdjacentHTML("afterbegin", tilesHtml);
      grid.querySelectorAll("[data-remove-local]").forEach((btn) => {
        btn.addEventListener("click", () => {
          mediaLocal.splice(Number(btn.dataset.removeLocal), 1);
          renderMediaTiles();
        });
      });
    }
    renderMediaTiles();

    const mediaInput = document.getElementById("media-input");
    const tile = document.getElementById("media-upload-tile");
    mediaInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files);
      for (const file of files) {
        tile.classList.add("uploading");
        tile.querySelector("span").textContent = "Subiendo...";
        try {
          const result = await uploadMediaWrapper(file, (pct) => {
            tile.querySelector("span").textContent = pct + "%";
          });
          mediaLocal.push(result);
          renderMediaTiles();
        } catch (err) {
          showToast(err.message || "No se pudo subir el archivo.", "error");
        } finally {
          tile.classList.remove("uploading");
          tile.querySelector("span").textContent = "Agregar";
        }
      }
      mediaInput.value = "";
    });

    document.getElementById("form-trabajo").addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = readTrabajoForm(e.target);
      try {
        if (trabajo?.id) {
          await saveTrabajo(state.user.uid, data, state.inventario, trabajo.id, mediaLocal);
        } else {
          // Crear primero el trabajo (esto descuenta stock), luego guardar la media local
          await saveTrabajoConMedia(state.user.uid, data, state.inventario, mediaLocal);
        }
        closeSheet();
      } catch (err) {
        showToast("No se pudo guardar el trabajo.", "error");
      }
    });
  }

  else if (type === "trabajo-detail") {
    const trabajo = state.trabajos.find((t) => t.id === id);
    if (!trabajo) return closeSheet();
    content.innerHTML = renderTrabajoDetail(trabajo);
    bindCloseButtons();

    document.getElementById("btn-edit-trabajo").addEventListener("click", () => openSheet("trabajo-form", trabajo.id));
    document.getElementById("btn-delete-trabajo").addEventListener("click", async () => {
      if (confirm("¿Eliminar este trabajo? Esta acción no se puede deshacer.")) {
        await deleteTrabajo(state.user.uid, trabajo.id);
        closeSheet();
      }
    });

    content.querySelectorAll("[data-remove-media-detail]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("¿Eliminar esta foto/video?")) return;
        const index = Number(btn.dataset.removeMediaDetail);
        const updatedMedia = await removeMediaFromTrabajo(state.user.uid, trabajo, index);
        trabajo.media = updatedMedia;
        openSheet("trabajo-detail", trabajo.id);
      });
    });

    const mediaInput = document.getElementById("media-input");
    const tile = document.getElementById("media-upload-tile");
    mediaInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files);
      for (const file of files) {
        tile.classList.add("uploading");
        tile.querySelector("span").textContent = "Subiendo...";
        try {
          const updatedMedia = await addMediaToTrabajo(state.user.uid, trabajo, file, (pct) => {
            tile.querySelector("span").textContent = pct + "%";
          });
          trabajo.media = updatedMedia;
          openSheet("trabajo-detail", trabajo.id);
        } catch (err) {
          showToast(err.message || "No se pudo subir el archivo.", "error");
          tile.classList.remove("uploading");
          tile.querySelector("span").textContent = "Agregar";
        }
      }
    });
  }

  else if (type === "pago-form") {
    const pago = id ? state.pagos.find((p) => p.id === id) : null;
    content.innerHTML = renderPagoForm(state.trabajos, pago);
    bindCloseButtons();

    document.getElementById("form-pago").addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = readPagoForm(e.target);
      try {
        await savePago(state.user.uid, data, pago?.id || null);
        closeSheet();
      } catch (err) {
        showToast("No se pudo guardar el gasto.", "error");
      }
    });
  }

  else if (type === "producto-form") {
    const producto = id ? state.inventario.find((p) => p.id === id) : null;
    content.innerHTML = renderProductoForm(producto);
    bindCloseButtons();

    const selectCategoria = document.getElementById("select-categoria");
    const campoUsaPila = document.getElementById("campo-usa-pila");
    const usaPilaButtons = content.querySelectorAll("#usaPila-segmented button");
    const usaPilaHidden = document.getElementById("usaPila-hidden");

    function syncCategoriaUI() {
      campoUsaPila.classList.toggle("hidden", selectCategoria.value !== "Control remoto");
    }
    syncCategoriaUI();
    selectCategoria.addEventListener("change", syncCategoriaUI);

    usaPilaButtons.forEach((b) => {
      b.addEventListener("click", () => {
        usaPilaButtons.forEach((x) => x.classList.toggle("active", x === b));
        usaPilaHidden.value = b.dataset.val;
      });
    });

    document.getElementById("form-producto").addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = readProductoForm(e.target);
      try {
        await saveProducto(state.user.uid, data, producto?.id || null);
        closeSheet();
      } catch (err) {
        showToast("No se pudo guardar el producto.", "error");
      }
    });
  }

  else if (type === "producto-detail") {
    const producto = state.inventario.find((p) => p.id === id);
    if (!producto) return closeSheet();
    content.innerHTML = renderProductoDetail(producto);
    bindCloseButtons();

    document.getElementById("btn-edit-producto").addEventListener("click", () => openSheet("producto-form", producto.id));
    document.getElementById("btn-delete-producto").addEventListener("click", async () => {
      if (confirm("¿Eliminar este producto del inventario?")) {
        await deleteProducto(state.user.uid, producto.id);
        closeSheet();
      }
    });
    document.getElementById("btn-stock-menos").addEventListener("click", async () => {
      await adjustStock(state.user.uid, producto, -1);
      openSheet("producto-detail", producto.id);
    });
    document.getElementById("btn-stock-mas").addEventListener("click", async () => {
      await adjustStock(state.user.uid, producto, 1);
      openSheet("producto-detail", producto.id);
    });
  }
}

function bindCloseButtons() {
  document.querySelectorAll("[data-close-sheet]").forEach((btn) => {
    btn.addEventListener("click", closeSheet);
  });
}

// ---------------- Icono de marca (llave estilizada) ----------------

function keyIconSvg(size) {
  return `
    <svg class="brand-mark" width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="11" cy="11" r="7.5" stroke="#D97B3F" stroke-width="2.4"/>
      <circle cx="11" cy="11" r="2.4" fill="#D97B3F"/>
      <path d="M16.2 16.2L27 27" stroke="#D97B3F" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M22 21L25 24" stroke="#D97B3F" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M19 24L22 27" stroke="#D97B3F" stroke-width="2.4" stroke-linecap="round"/>
    </svg>
  `;
}
