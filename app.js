import { state, setLogoTaller, setNombreTaller, adjustStock, saveHistorialEntry } from "./state.js";
import { renderNavbar, renderMainTab, renderStockTab, renderStatsTab, renderSheetContainer, renderProductDetail, renderConfigTaller, renderToast, showToast } from "./ui.js";
import { searchEspadines, getEspadinById, marcasPopulares, tiposUso, tiposVehiculo } from "./espadines.js";

export function initApp() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <header class="app-header">
      <div class="brand">
        ${keyIconSvg(28)}
        <h1 class="brand-title">CerrAuto</h1>
      </div>
      <button class="btn-icon" id="btn-config" aria-label="Configuración">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </button>
    </header>

    <main class="app-main" id="main-content"></main>

    ${renderNavbar()}
    ${renderSheetContainer()}
    ${renderToast()}
  `;

  bindEvents();
  renderCurrentView();
}

export function renderApp() {
  renderCurrentView();
}

function bindEvents() {
  // Config
  document.getElementById("btn-config")?.addEventListener("click", () => {
    openSheet("config-taller");
  });

  // Nav tabs
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const tab = e.currentTarget.dataset.tab;
      state.currentTab = tab;

      document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
      e.currentTarget.classList.add("active");

      renderCurrentView();
    });
  });

  // Evento backdrop modal
  const backdrop = document.getElementById("sheet-backdrop");
  if (backdrop) {
    backdrop.addEventListener("click", closeSheet);
  }
}

function renderCurrentView() {
  const container = document.getElementById("main-content");
  if (!container) return;

  if (state.currentTab === "main") {
    container.innerHTML = renderMainTab();
    bindMainEvents();
  } else if (state.currentTab === "stock") {
    container.innerHTML = renderStockTab();
    bindStockEvents();
  } else if (state.currentTab === "stats") {
    container.innerHTML = renderStatsTab();
    bindStatsEvents();
  }
}

// ---------------- TAB BUSCADOR PRINCIPAL ----------------

function bindMainEvents() {
  const inputSearch = document.getElementById("main-search");
  const selectMarca = document.getElementById("filter-marca");
  const selectTipo = document.getElementById("filter-tipo");
  const grid = document.getElementById("results-grid");

  function updateResults() {
    const query = inputSearch ? inputSearch.value : "";
    const marca = selectMarca ? selectMarca.value : "";
    const tipo = selectTipo ? selectTipo.value : "";

    const resultados = searchEspadines({ query, marca, tipo });

    if (!grid) return;

    if (resultados.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <p>No se encontraron espadines con esos filtros.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = resultados
      .map((item) => {
        const userStock = state.userStock[item.id] || 0;
        const stockBadgeClass = userStock > 0 ? "stock-ok" : "stock-zero";

        return `
          <div class="card-espadin" data-id="${item.id}">
            <div class="card-header">
              <span class="card-codigo">${item.codigo}</span>
              <span class="badge-stock ${stockBadgeClass}">${userStock} un.</span>
            </div>
            <h3 class="card-title">${item.nombre}</h3>
            <p class="card-compat">${item.marcasCompatibles.join(", ")}</p>
            <div class="card-footer">
              <span class="card-tipo">${item.tipoUso}</span>
              <button class="btn-text">Ver detalle →</button>
            </div>
          </div>
        `;
      })
      .join("");

    // Eventos click tarjetas
    grid.querySelectorAll(".card-espadin").forEach((card) => {
      card.addEventListener("click", () => {
        const id = card.dataset.id;
        openSheet("producto-detail", id);
      });
    });
  }

  if (inputSearch) inputSearch.addEventListener("input", updateResults);
  if (selectMarca) selectMarca.addEventListener("change", updateResults);
  if (selectTipo) selectTipo.addEventListener("change", updateResults);

  // Inicial
  updateResults();
}

// ---------------- TAB STOCK ----------------

function bindStockEvents() {
  const inputSearch = document.getElementById("stock-search");
  const filterEstado = document.getElementById("stock-filter-estado");
  const listContainer = document.getElementById("stock-list");

  function updateStockList() {
    const query = inputSearch ? inputSearch.value.toLowerCase() : "";
    const estado = filterEstado ? filterEstado.value : "todos";

    const todos = searchEspadines({ query: "" });

    const filtrados = todos.filter((item) => {
      const stock = state.userStock[item.id] || 0;

      // Filtro por texto
      const matchText =
        item.nombre.toLowerCase().includes(query) ||
        item.codigo.toLowerCase().includes(query) ||
        item.marcasCompatibles.some((m) => m.toLowerCase().includes(query));

      if (!matchText) return false;

      // Filtro por estado
      if (estado === "disponible") return stock > 0;
      if (estado === "agotado") return stock === 0;

      return true;
    });

    if (!listContainer) return;

    if (filtrados.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <p>No hay productos en esta categoría.</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = filtrados
      .map((item) => {
        const stock = state.userStock[item.id] || 0;
        return `
          <div class="stock-item-row" data-id="${item.id}">
            <div class="stock-item-info">
              <strong>${item.codigo}</strong>
              <span>${item.nombre}</span>
            </div>
            <div class="stock-item-actions">
              <button class="btn-stock-adj minus" data-id="${item.id}" data-delta="-1">-</button>
              <span class="stock-count ${stock === 0 ? "zero" : ""}">${stock}</span>
              <button class="btn-stock-adj plus" data-id="${item.id}" data-delta="1">+</button>
            </div>
          </div>
        `;
      })
      .join("");

    // Eventos ajuste rápido de stock
    listContainer.querySelectorAll(".btn-stock-adj").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const delta = parseInt(btn.dataset.delta, 10);

        if (state.user) {
          await adjustStock(state.user.uid, id, delta);
          updateStockList();
        }
      });
    });

    // Click en la fila para abrir detalle
    listContainer.querySelectorAll(".stock-item-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.classList.contains("btn-stock-adj")) return;
        openSheet("producto-detail", row.dataset.id);
      });
    });
  }

  if (inputSearch) inputSearch.addEventListener("input", updateStockList);
  if (filterEstado) filterEstado.addEventListener("change", updateStockList);

  updateStockList();
}

// ---------------- TAB ESTADÍSTICAS ----------------

function bindStatsEvents() {
  // Por si se agregan interacciones a stats
}

// ---------------- MANEJO DE MODALES / BOTTOM SHEET ----------------

export function openSheet(type, data = null) {
  const container = document.getElementById("sheet-container");
  const backdrop = document.getElementById("sheet-backdrop");

  if (!container || !backdrop) return;

  renderSheetContent(type, data);

  backdrop.classList.add("open");
  container.classList.add("open");
}

export function closeSheet() {
  const container = document.getElementById("sheet-container");
  const backdrop = document.getElementById("sheet-backdrop");

  if (container) container.classList.remove("open");
  if (backdrop) backdrop.classList.remove("open");
}

function renderSheetContent(type, data) {
  const content = document.getElementById("sheet-content");
  if (!content) return;

  if (type === "producto-detail") {
    const producto = getEspadinById(data);
    if (!producto) return;

    const currentStock = state.userStock[producto.id] || 0;
    content.innerHTML = renderProductDetail(producto, currentStock);

    bindCloseButtons();

    // Eventos sumar/restar dentro del modal
    document.getElementById("btn-stock-menos")?.addEventListener("click", async () => {
      await adjustStock(state.user.uid, producto.id, -1);
      openSheet("producto-detail", producto.id);
    });

    document.getElementById("btn-stock-mas")?.addEventListener("click", async () => {
      await adjustStock(state.user.uid, producto.id, 1);
      openSheet("producto-detail", producto.id);
    });
  } else if (type === "config-taller") {
    content.innerHTML = renderConfigTaller();
    bindCloseButtons();

    // Preview de logo
    const inputLogoFile = document.getElementById("input-logo-taller");
    if (inputLogoFile) {
      inputLogoFile.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const preview = document.getElementById("logo-preview");
          if (preview) preview.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;">`;
          setLogoTaller(ev.target.result);
        };
        reader.readAsDataURL(file);
      });
    }

    // Quitar logo
    document.getElementById("btn-remove-logo")?.addEventListener("click", () => {
      localStorage.removeItem("cerrauto_taller_logo");
      openSheet("config-taller");
    });

    // Toggle de tema desde config
    document.querySelectorAll("#tema-segmented button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.documentElement.dataset.tema = btn.dataset.tema;
        localStorage.setItem("cerrauto_tema", btn.dataset.tema);
        document.querySelectorAll("#tema-segmented button").forEach((b) =>
          b.classList.toggle("active", b === btn)
        );
      });
    });

    // Guardar nombre
    document.getElementById("btn-guardar-taller")?.addEventListener("click", () => {
      const inputNombre = document.getElementById("input-nombre-taller");
      if (inputNombre) {
        const nombre = inputNombre.value.trim();
        setNombreTaller(nombre);
        showToast("Configuración guardada", "success");
        closeSheet();
        renderApp();
        renderCurrentView();
      }
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
