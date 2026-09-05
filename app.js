// ============================================================
// app.js — núcleo de la aplicación
// ============================================================
import { auth, loginWithGoogle, logout, watchAuth, watchCollection, updateItem, registrarFalloDeEscritura } from "./firebase.js";
import { uploadMedia } from "./cloudinary.js";
import { showToast, formatDate, escapeHtml, confirmar, telefonoWhatsApp } from "./helpers.js";
import { renderDashboard, renderDashboardDetail } from "./dashboard.js";
import { PERIODOS } from "./metricas.js";
import { sugerirMarcas, sugerirModelos } from "./vehiculos.js";
import {
  cargarConfigTaller, guardarConfigTaller, getConfigTallerActual,
  getNombreTaller, getLogoTaller, setConfigLocal, renderConfigTaller
} from "./taller.js";
import {
  renderTrabajosView, renderTrabajoForm, renderTrabajoDetail,
  readTrabajoForm, saveTrabajo, deleteTrabajo, addMediaToTrabajo,
  removeMediaFromTrabajo, calcularCostoDeTrabajo, generarMensajeWhatsApp
} from "./trabajos.js";
import {
  renderPagosView, renderPagoForm, renderPagoDetail, readPagoForm, savePago, deletePago
} from "./pagos.js";
import {
  renderInventarioView, renderProductoForm, renderProductoDetail,
  readProductoForm, saveProducto, deleteProducto, adjustStock,
  subirFotoProducto, exportarDatosCSV, renderHistorialProducto,
  esCategoria, CATEGORIAS_CONTROL
} from "./inventario.js";

const state = {
  user: null,
  view: "inicio",       // inicio | trabajos | pagos | inventario
  periodo: localStorage.getItem("cerrauto_periodo") || "mes",
  trabajos: [],
  pagos: [],
  inventario: [],
  movimientos: [],
  cargado: { trabajos: false, pagos: false, inventario: false },
  conexion: { error: null, desdeCache: false },
  filtros: {},          // se conserva entre re-renders
  unsubscribers: [],
  sheet: null           // { type, id }
};

const root = document.getElementById("app");

// ---------------- Auth ----------------

// Avisa al respaldo de index.html que los módulos cargaron bien, para que no
// reemplace la pantalla por el mensaje de error.
window.dispatchEvent(new Event("cerrauto:listo"));

// Accesos directos del ícono instalado: ?vista=inventario, ?accion=nuevo-trabajo
const params = new URLSearchParams(location.search);
const vistaInicial = params.get("vista");
const accionInicial = params.get("accion");
if (["inicio", "trabajos", "pagos", "inventario"].includes(vistaInicial)) {
  state.view = vistaInicial;
}

watchAuth(async (user) => {
  state.user = user;
  if (user) {
    await cargarConfigTaller(user.uid);
    subscribeData();
    renderApp();
    if (accionInicial === "nuevo-trabajo") {
      openSheet("trabajo-form");
      history.replaceState(null, "", location.pathname);
    }
  } else {
    state.unsubscribers.forEach((fn) => fn());
    state.unsubscribers = [];
    state.cargado = { trabajos: false, pagos: false, inventario: false };
    renderLogin();
  }
});

// Recibe los datos de una colección. Ante un error NO se vacía la lista: se
// conserva lo último bueno y se avisa arriba, porque una lista vacía se
// confunde con "no tienes nada guardado".
function recibir(nombre, asignar, { render = true } = {}) {
  return (items, meta = {}) => {
    if (meta.error) {
      state.conexion = { error: meta.error, desdeCache: true };
    } else {
      if (items) asignar(items);
      state.cargado[nombre] = true;
      state.conexion = { error: null, desdeCache: !!meta.desdeCache };
    }
    if (render) renderCurrentView();
    else actualizarBandaConexion();
  };
}

function subscribeData() {
  state.unsubscribers.forEach((fn) => fn());
  state.unsubscribers = [
    watchCollection(state.user.uid, "trabajos",    recibir("trabajos",   (i) => { state.trabajos = i; })),
    watchCollection(state.user.uid, "pagos",       recibir("pagos",      (i) => { state.pagos = i; })),
    watchCollection(state.user.uid, "inventario",  recibir("inventario", (i) => { state.inventario = i; })),
    watchCollection(state.user.uid, "movimientos", recibir("movimientos",(i) => { state.movimientos = i; }), "fecha")
  ];
}

// Banda de estado de conexión bajo la barra superior
function actualizarBandaConexion() {
  const banda = document.getElementById("banda-conexion");
  if (!banda) return;
  const { error, desdeCache } = state.conexion;
  const sinRed = !navigator.onLine;

  if (error) {
    banda.className = "banda-conexion error";
    banda.innerHTML = `<i class="ti ti-alert-triangle"></i> No se pudo conectar. Estás viendo los últimos datos guardados.`;
  } else if (sinRed || desdeCache) {
    banda.className = "banda-conexion offline";
    banda.innerHTML = `<i class="ti ti-cloud-off"></i> Sin conexión — los cambios se guardan y se suben cuando vuelva la señal.`;
  } else {
    banda.className = "banda-conexion oculta";
    banda.innerHTML = "";
  }
}

window.addEventListener("online", actualizarBandaConexion);
window.addEventListener("offline", actualizarBandaConexion);

// Las escrituras no bloquean la interfaz: el dato se guarda en el teléfono al
// tiro y se sube cuando hay señal. Si el servidor termina rechazando el cambio
// (permisos, regla de validación), hay que avisar acá, porque para ese momento
// el formulario ya se cerró.
registrarFalloDeEscritura((error, donde) => {
  const permisos = error?.code === "permission-denied";
  showToast(
    permisos
      ? `Sin permiso para guardar en ${donde}. Revisa las reglas de Firestore.`
      : `No se pudo guardar en ${donde}. El cambio quedó pendiente.`,
    "error"
  );
});

// Separa "Llaves CerrAuto" en "Llaves" + "CerrAuto" para pintar la última
// palabra con el color de acento.
function partirNombre(nombre) {
  const partes = String(nombre || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return { principal: "Llaves", final: "CerrAuto" };
  if (partes.length === 1) return { principal: partes[0], final: "" };
  return { principal: partes.slice(0, -1).join(" "), final: partes[partes.length - 1] };
}

function renderLogin() {
  const { principal, final } = partirNombre(getNombreTaller());
  root.innerHTML = `
    <div class="login-screen">
      ${keyIconSvg(64)}
      <div class="login-title">${escapeHtml(principal)} <span>${escapeHtml(final)}</span></div>
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

function applyTema() {
  const saved = localStorage.getItem("cerrauto_tema") || "dark";
  document.documentElement.dataset.tema = saved;
}

function renderApp() {
  applyTema();
  const logo = getLogoTaller();
  const { principal, final } = partirNombre(getNombreTaller());
  const temaActual = document.documentElement.dataset.tema === "light" ? "light" : "dark";

  root.innerHTML = `
    <div class="topbar">
      <div class="brand">
        ${logo
          ? `<img src="${escapeHtml(logo)}" class="brand-logo-img" alt="">`
          : keyIconSvg(28)}
        <div class="brand-text">${escapeHtml(principal)} <span>${escapeHtml(final)}</span></div>
      </div>
      <div style="display:flex;gap:4px;align-items:center;">
        <button class="topbar-action" id="btn-toggle-tema" title="Cambiar modo">
          <i class="ti ti-${temaActual === "light" ? "moon" : "sun"}"></i>
        </button>
        <button class="topbar-action" id="btn-config-taller" title="Configurar taller">
          <i class="ti ti-settings"></i>
        </button>
        <button class="topbar-action" id="btn-logout" title="Cerrar sesión">
          <i class="ti ti-logout"></i>
        </button>
      </div>
    </div>
    <div class="banda-conexion oculta" id="banda-conexion"></div>
    <div class="view" id="view-container"></div>
    <button class="fab" id="fab-add"><i class="ti ti-plus"></i></button>
    <nav class="bottomnav">
      <div class="bottomnav-inner">
        <button class="navbtn" data-view="inicio"><i class="ti ti-home"></i>Inicio</button>
        <button class="navbtn" data-view="trabajos"><i class="ti ti-key"></i>Trabajos</button>
        <button class="navbtn" data-view="pagos"><i class="ti ti-chart-bar"></i>Finanzas</button>
        <button class="navbtn" data-view="inventario"><i class="ti ti-box"></i>Stock</button>
      </div>
    </nav>
  `;

  document.getElementById("btn-logout").addEventListener("click", async () => {
    if (!await confirmar({
      titulo: "¿Cerrar sesión?",
      mensaje: "Vas a tener que volver a entrar con tu cuenta de Google.",
      aceptar: "Cerrar sesión",
      peligro: false
    })) return;
    await logout();
    showToast("Sesión cerrada", "success");
  });

  document.getElementById("btn-toggle-tema").addEventListener("click", () => {
    const actual = document.documentElement.dataset.tema || "dark";
    const nuevo = actual === "light" ? "dark" : "light";
    document.documentElement.dataset.tema = nuevo;
    localStorage.setItem("cerrauto_tema", nuevo);
    // Actualizar ícono del botón sin re-renderizar todo
    const iconEl = document.querySelector("#btn-toggle-tema i");
    if (iconEl) {
      iconEl.className = nuevo === "light" ? "ti ti-moon" : "ti ti-sun";
    }
  });

  document.getElementById("btn-config-taller").addEventListener("click", () => {
    openSheet("config-taller");
  });

  document.querySelectorAll(".navbtn").forEach((btn) => {
    btn.addEventListener("click", () => cambiarVista(btn.dataset.view));
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

  // Mostrar/ocultar FAB según la vista
  const fab = document.getElementById("fab-add");
  if (fab) fab.classList.toggle("hidden", state.view === "inicio");

  const container = document.getElementById("view-container");
  if (!container) return;

  actualizarBandaConexion();

  // Se conserva el scroll para que un cambio llegado de la nube no te mueva
  // la pantalla mientras estás mirando la lista.
  const scrollPrevio = window.scrollY;

  if (!state.cargado.trabajos && !state.cargado.inventario && !state.conexion.error) {
    container.innerHTML = renderEsqueleto();
    return;
  }

  if (state.view === "inicio") {
    container.innerHTML = renderDashboard(state);
    bindSelectorPeriodo(container);

    document.getElementById("btn-dash-nuevo-trabajo")?.addEventListener("click", () => {
      openSheet("trabajo-form");
    });

    container.querySelectorAll("[data-open-producto-alerta]").forEach((row) => {
      row.addEventListener("click", () => {
        cambiarVista("inventario");
        openSheet("producto-detail", row.dataset.openProductoAlerta);
      });
    });

    container.querySelector("[data-ir-a]")?.addEventListener("click", (e) => {
      cambiarVista(e.currentTarget.dataset.irA);
    });

    container.querySelectorAll("[data-dash-detail]").forEach((card) => {
      const abrir = () => openSheet("dash-detail", card.dataset.dashDetail);
      card.addEventListener("click", abrir);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); }
      });
    });

    const cardUltimo = container.querySelector("[data-open-trabajo]");
    cardUltimo?.addEventListener("click", () => openSheet("trabajo-detail", cardUltimo.dataset.openTrabajo));

  } else if (state.view === "trabajos") {
    container.innerHTML = renderTrabajosView(state);
    container.querySelectorAll("[data-open-trabajo]").forEach((card) => {
      card.addEventListener("click", () => openSheet("trabajo-detail", card.dataset.openTrabajo));
    });
    bindFiltrosTrabajos(container);

  } else if (state.view === "pagos") {
    container.innerHTML = renderPagosView(state);
    bindSelectorPeriodo(container);
    container.querySelectorAll("[data-open-pago]").forEach((card) => {
      card.addEventListener("click", () => openSheet("pago-detail", card.dataset.openPago));
    });
    container.querySelectorAll("[data-dash-detail]").forEach((card) => {
      const abrir = () => openSheet("dash-detail", card.dataset.dashDetail);
      card.addEventListener("click", abrir);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); }
      });
    });

  } else {
    container.innerHTML = renderInventarioView(state);

    container.querySelectorAll("[data-open-producto-alerta]").forEach((row) => {
      row.addEventListener("click", () => openSheet("producto-detail", row.dataset.openProductoAlerta));
    });

    container.querySelectorAll("[data-open-producto]").forEach((card) => {
      card.addEventListener("click", (e) => {
        // No abrir el detalle si se tocó un botón rápido de stock
        if (e.target.closest("[data-stock-menos],[data-stock-mas]")) return;
        openSheet("producto-detail", card.dataset.openProducto);
      });
    });

    // Botones rápidos de stock (+/-) sin abrir el detalle
    container.querySelectorAll("[data-stock-menos]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const prod = state.inventario.find((p) => p.id === btn.dataset.stockMenos);
        if (!prod) return;
        if (Number(prod.stock) <= 0) return showToast(`${prod.nombre} ya está en cero`, "error");
        await adjustStock(state.user.uid, prod, -1);
      });
    });
    container.querySelectorAll("[data-stock-mas]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const prod = state.inventario.find((p) => p.id === btn.dataset.stockMas);
        if (prod) await adjustStock(state.user.uid, prod, 1);
      });
    });
  }

  if (scrollPrevio) window.scrollTo({ top: scrollPrevio, behavior: "instant" });
}

function cambiarVista(vista) {
  state.view = vista;
  state.filtros = {};
  renderCurrentView();
  window.scrollTo({ top: 0, behavior: "instant" });
}

// Mientras cargan los datos se muestra la forma de la pantalla, no un spinner
// sobre fondo negro: se siente más rápido y no queda pegado si algo falla.
function renderEsqueleto() {
  return `
    <div class="sk-linea sk-titulo"></div>
    <div class="sk-linea sk-sub"></div>
    <div class="sk-hero"></div>
    <div class="sk-grid">
      <div class="sk-mini"></div><div class="sk-mini"></div>
      <div class="sk-mini"></div><div class="sk-mini"></div>
    </div>
    <div class="sk-linea sk-sub"></div>
    <div class="sk-card"></div>
    <div class="sk-card"></div>
  `;
}

function bindSelectorPeriodo(container) {
  container.querySelectorAll("#periodo-selector button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = btn.dataset.periodo;
      if (!PERIODOS.some((x) => x.id === p) || p === state.periodo) return;
      state.periodo = p;
      localStorage.setItem("cerrauto_periodo", p);
      renderCurrentView();
    });
  });
}

// Los filtros viven en state.filtros para que un cambio llegado de la nube no
// borre lo que estabas escribiendo en el buscador.
function bindFiltrosTrabajos(container) {
  const campos = ["buscar-trabajo", "filtro-marca", "filtro-tipo", "filtro-mes"];

  const aplicar = () => {
    const q = (state.filtros["buscar-trabajo"] || "").toLowerCase().trim();
    const marca = (state.filtros["filtro-marca"] || "").toLowerCase().trim();
    const tipo = (state.filtros["filtro-tipo"] || "").toLowerCase().trim();
    const mes = (state.filtros["filtro-mes"] || "").trim();

    let visibles = 0;
    container.querySelectorAll(".trabajo-card").forEach((c) => {
      const search = c.dataset.search || "";
      const fecha = c.dataset.fecha || "";
      const match = (!q || search.includes(q))
        && (!marca || search.includes(marca))
        && (!tipo || search.includes(tipo))
        && (!mes || fecha.startsWith(mes));
      c.classList.toggle("hidden", !match);
      if (match) visibles++;
    });

    const sinRes = document.getElementById("sin-resultados");
    if (sinRes) sinRes.classList.toggle("hidden", visibles > 0);

    const contador = document.getElementById("contador-trabajos");
    if (contador) {
      const hayFiltro = q || marca || tipo || mes;
      contador.textContent = hayFiltro
        ? `${visibles} de ${state.trabajos.length} trabajos`
        : `${state.trabajos.length} trabajo${state.trabajos.length === 1 ? "" : "s"} registrado${state.trabajos.length === 1 ? "" : "s"}`;
    }
  };

  for (const id of campos) {
    const el = document.getElementById(id);
    if (!el) continue;
    // Restaurar lo que el usuario ya había escrito o elegido
    if (state.filtros[id] != null) el.value = state.filtros[id];
    const onChange = () => { state.filtros[id] = el.value; aplicar(); };
    el.addEventListener("input", onChange);
    el.addEventListener("change", onChange);
  }

  document.getElementById("btn-limpiar-filtros")?.addEventListener("click", () => {
    state.filtros = {};
    for (const id of campos) {
      const el = document.getElementById(id);
      if (el) el.value = "";
    }
    aplicar();
  });

  aplicar();
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
    let trabajo = null;
    if (id === "__duplicado__") {
      trabajo = state.trabajoDuplicado || null;
      state.trabajoDuplicado = null;
    } else if (id) {
      trabajo = state.trabajos.find((t) => t.id === id) || null;
    }
    // Mientras se crea/edita, mantenemos una copia local de media para poder agregar/quitar antes de guardar
    const mediaLocal = trabajo ? [...(trabajo.media || [])] : [];
    content.innerHTML = renderTrabajoForm(trabajo, state.inventario);
    bindCloseButtons();

    // ── Autocompletado de marca y modelo ──
    const inputMarca  = document.getElementById("input-marca");
    const inputModelo = document.getElementById("input-modelo");
    const sugMarca    = document.getElementById("sugerencias-marca");
    const sugModelo   = document.getElementById("sugerencias-modelo");

    function mostrarSugerencias(contenedor, lista, alElegir) {
      if (!contenedor) return;
      if (!lista.length) {
        contenedor.innerHTML = "";
        contenedor.classList.remove("visible");
        return;
      }
      contenedor.innerHTML = lista
        .map(item => `<div class="autocomplete-item" data-valor="${item}">${item}</div>`)
        .join("");
      contenedor.classList.add("visible");
      contenedor.querySelectorAll(".autocomplete-item").forEach(el => {
        el.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          alElegir(el.dataset.valor);
          contenedor.innerHTML = "";
          contenedor.classList.remove("visible");
        });
      });
    }

    inputMarca?.addEventListener("input", () => {
      mostrarSugerencias(sugMarca, sugerirMarcas(inputMarca.value), (valor) => {
        inputMarca.value = valor;
        inputModelo?.focus();
      });
    });

    inputMarca?.addEventListener("blur", () => {
      setTimeout(() => sugMarca?.classList.remove("visible"), 150);
    });

    inputModelo?.addEventListener("input", () => {
      mostrarSugerencias(sugModelo, sugerirModelos(inputMarca?.value, inputModelo.value), (valor) => {
        inputModelo.value = valor;
      });
    });

    inputModelo?.addEventListener("focus", () => {
      // Al enfocar, mostrar todos los modelos de la marca si ya está escrita
      if (inputMarca?.value && !inputModelo.value) {
        mostrarSugerencias(sugModelo, sugerirModelos(inputMarca.value, ""), (valor) => {
          inputModelo.value = valor;
        });
      }
    });

    inputModelo?.addEventListener("blur", () => {
      setTimeout(() => sugModelo?.classList.remove("visible"), 150);
    });

    const inputControlId  = document.getElementById("input-control-id");
    const inputEspadinId  = document.getElementById("input-espadin-id");
    const selectEspadinFallback = document.getElementById("select-espadin-fallback");
    const selectTipoServicio = document.getElementById("select-tipo-servicio");
    const inputPincode = document.getElementById("input-pincode");
    const inputCostoTotal = document.getElementById("input-costo-total");

    const inputTransponderId = document.getElementById("input-transponder-id");

    const campoLlaveVirgen = document.getElementById("campo-llave-virgen");
    const inputLlaveVirgenId = document.getElementById("input-llave-virgen-id");

    function syncLlaveVirgenUI() {
      const esLlaveSimple = selectTipoServicio?.value === "Llave simple";
      if (campoLlaveVirgen) campoLlaveVirgen.classList.toggle("hidden", !esLlaveSimple);
      if (!esLlaveSimple && inputLlaveVirgenId) {
        inputLlaveVirgenId.value = "";
        content.querySelectorAll("[data-lv-id]").forEach(c => {
          c.classList.remove("selected");
          c.querySelector(".inv-selector-check")?.remove();
        });
      }
    }
    syncLlaveVirgenUI();
    selectTipoServicio?.addEventListener("change", () => {
      syncLlaveVirgenUI();
      recalcularCosto();
    });

    // El costo sale de calcularCostoDeTrabajo(), que trabaja con los datos del
    // formulario y el inventario. Antes se armaba acá leyendo atributos del DOM,
    // y el costo del control vivía en una variable que solo se llenaba al hacer
    // clic: al abrir un trabajo guardado arrancaba en cero y el total perdía el
    // control y la pila.
    function recalcularCosto() {
      const form = document.getElementById("form-trabajo");
      if (!form) return;

      const datos = readTrabajoForm(form);
      if (inputCostoTotal) inputCostoTotal.value = calcularCostoDeTrabajo(datos, state.inventario);

      // Avisar si un insumo elegido no tiene costo registrado: el total sale
      // sin sumarle nada y antes eso pasaba callado.
      const aviso = document.getElementById("aviso-sin-costo");
      if (!aviso) return;

      const buscar = (id) => (id ? state.inventario.find((p) => p.id === id) : null);
      const sinCosto = [
        buscar(datos.controlId),
        buscar(datos.transponderInvId),
        buscar(datos.llaveVirgenId),
        buscar(datos.espadinId)
      ].filter((p) => p && !(Number(p.costoUnitario) || 0)).map((p) => p.nombre);

      aviso.classList.toggle("hidden", !sinCosto.length);
      aviso.innerHTML = sinCosto.length
        ? `<i class="ti ti-alert-triangle"></i> ${escapeHtml(sinCosto.join(", "))} no tiene costo registrado en el stock, así que no suma nada al total. Edítalo en Stock para que el cálculo salga bien.`
        : "";
    }

    // Click en card de control
    content.querySelectorAll("[data-ctrl-id]").forEach(card => {
      card.addEventListener("click", () => {
        const yaSeleccionado = inputControlId?.value === card.dataset.ctrlId;
        content.querySelectorAll("[data-ctrl-id]").forEach(c => {
          c.classList.remove("selected");
          c.querySelector(".inv-selector-check")?.remove();
        });
        if (yaSeleccionado) {
          if (inputControlId) inputControlId.value = "";
        } else {
          card.classList.add("selected");
          card.insertAdjacentHTML("beforeend", `<i class="ti ti-check inv-selector-check"></i>`);
          if (inputControlId) inputControlId.value = card.dataset.ctrlId;
          // Actualizar el label del desplegable y cerrarlo
          const label = document.getElementById("label-control-sel");
          if (label) label.textContent = card.querySelector(".inv-selector-name")?.textContent || "Control seleccionado";
          document.getElementById("grid-controles")?.classList.add("cerrado");
        }
        if (yaSeleccionado) {
          const label = document.getElementById("label-control-sel");
          if (label) label.textContent = "Seleccionar control";
        }
        recalcularCosto();
      });
    });

    // Click en card de espadín
    content.querySelectorAll("[data-esp-id]").forEach(card => {
      card.addEventListener("click", () => {
        const yaSeleccionado = inputEspadinId?.value === card.dataset.espId;
        content.querySelectorAll("[data-esp-id]").forEach(c => {
          c.classList.remove("selected");
          c.querySelector(".inv-selector-check")?.remove();
        });
        if (yaSeleccionado) {
          if (inputEspadinId) inputEspadinId.value = "";
        } else {
          card.classList.add("selected");
          card.insertAdjacentHTML("beforeend", `<i class="ti ti-check inv-selector-check"></i>`);
          if (inputEspadinId) inputEspadinId.value = card.dataset.espId;
          // Stock y catálogo son excluyentes: elegir uno limpia el otro para
          // que el espadín no se cobre dos veces.
          if (selectEspadinFallback) selectEspadinFallback.value = "";
        }
        recalcularCosto();
      });
    });

    // Elegir del catálogo deselecciona la tarjeta del stock
    selectEspadinFallback?.addEventListener("change", () => {
      if (!selectEspadinFallback.value) return;
      if (inputEspadinId) inputEspadinId.value = "";
      content.querySelectorAll("[data-esp-id]").forEach(c => {
        c.classList.remove("selected");
        c.querySelector(".inv-selector-check")?.remove();
      });
    });

    // Click en card de transponder
    content.querySelectorAll("[data-tr-id]").forEach(card => {
      card.addEventListener("click", () => {
        const yaSeleccionado = inputTransponderId?.value === card.dataset.trId;
        content.querySelectorAll("[data-tr-id]").forEach(c => {
          c.classList.remove("selected");
          c.querySelector(".inv-selector-check")?.remove();
        });
        if (yaSeleccionado) {
          if (inputTransponderId) inputTransponderId.value = "";
        } else {
          card.classList.add("selected");
          card.insertAdjacentHTML("beforeend", `<i class="ti ti-check inv-selector-check"></i>`);
          if (inputTransponderId) inputTransponderId.value = card.dataset.trId;
          const labelTr = document.getElementById("label-transponder-sel");
          if (labelTr) labelTr.textContent = card.querySelector(".inv-selector-name")?.textContent || "Chip seleccionado";
          document.getElementById("grid-transponders")?.classList.add("cerrado");
        }
        if (yaSeleccionado) {
          const labelTr = document.getElementById("label-transponder-sel");
          if (labelTr) labelTr.textContent = "Seleccionar chip";
        }
        recalcularCosto();
      });
    });

    // Buscadores
    // Toggle del desplegable de controles
    const gridControles = document.getElementById("grid-controles");
    const toggleControles = document.getElementById("toggle-controles");
    toggleControles?.addEventListener("click", () => {
      gridControles?.classList.toggle("cerrado");
      const icono = toggleControles.querySelector("i");
      if (icono) icono.className = gridControles?.classList.contains("cerrado")
        ? "ti ti-chevron-down" : "ti ti-chevron-up";
    });

    // Toggle del desplegable de chips
    const gridTransponders = document.getElementById("grid-transponders");
    const toggleTransponders = document.getElementById("toggle-transponders");
    toggleTransponders?.addEventListener("click", () => {
      gridTransponders?.classList.toggle("cerrado");
      const icono = toggleTransponders.querySelector("i");
      if (icono) icono.className = gridTransponders?.classList.contains("cerrado")
        ? "ti ti-chevron-down" : "ti ti-chevron-up";
    });

    document.getElementById("buscar-control")?.addEventListener("input", e => {
      const q = e.target.value.toLowerCase();
      // Al buscar, abrir el desplegable automáticamente
      if (q) gridControles?.classList.remove("cerrado");
      content.querySelectorAll("[data-ctrl-id]").forEach(c => {
        c.classList.toggle("hidden", !!q && !c.dataset.ctrlSearch?.includes(q));
      });
    });

    // Buscador del catálogo de espadines (cuando no hay espadines en stock)
    document.getElementById("buscar-espadin-catalogo")?.addEventListener("input", e => {
      const q = e.target.value.toLowerCase();
      const sel = document.getElementById("select-espadin-fallback");
      if (!sel) return;
      Array.from(sel.options).forEach(op => {
        if (!op.value) return; // no ocultar "Sin espadín"
        op.hidden = !!q && !op.textContent.toLowerCase().includes(q);
      });
    });
    document.getElementById("buscar-espadin")?.addEventListener("input", e => {
      const q = e.target.value.toLowerCase();
      content.querySelectorAll("[data-esp-id]").forEach(c => {
        c.classList.toggle("hidden", !!q && !c.dataset.espSearch?.includes(q));
      });
    });
    document.getElementById("buscar-transponder")?.addEventListener("input", e => {
      const q = e.target.value.toLowerCase();
      if (q) document.getElementById("grid-transponders")?.classList.remove("cerrado");
      content.querySelectorAll("[data-tr-id]").forEach(c => {
        c.classList.toggle("hidden", !!q && !c.dataset.trSearch?.includes(q));
      });
    });

    // Click en card de llave virgen
    content.querySelectorAll("[data-lv-id]").forEach(card => {
      card.addEventListener("click", () => {
        const yaSeleccionado = inputLlaveVirgenId?.value === card.dataset.lvId;
        content.querySelectorAll("[data-lv-id]").forEach(c => {
          c.classList.remove("selected");
          c.querySelector(".inv-selector-check")?.remove();
        });
        if (yaSeleccionado) {
          if (inputLlaveVirgenId) inputLlaveVirgenId.value = "";
        } else {
          card.classList.add("selected");
          card.insertAdjacentHTML("beforeend", `<i class="ti ti-check inv-selector-check"></i>`);
          if (inputLlaveVirgenId) inputLlaveVirgenId.value = card.dataset.lvId;
        }
        recalcularCosto();
      });
    });

    // Buscador de llaves vírgenes
    document.getElementById("buscar-llave-virgen")?.addEventListener("input", e => {
      const q = e.target.value.toLowerCase();
      content.querySelectorAll("[data-lv-id]").forEach(c => {
        c.classList.toggle("hidden", !!q && !c.dataset.lvSearch?.includes(q));
      });
    });

    selectEspadinFallback?.addEventListener("change", recalcularCosto);
    inputPincode?.addEventListener("input",  recalcularCosto);
    inputPincode?.addEventListener("change", recalcularCosto);
    if (!trabajo) recalcularCosto();

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
      const etiqueta = tile.querySelector("span");
      tile.classList.add("uploading");
      let i = 0;
      for (const file of files) {
        i++;
        const prefijo = files.length > 1 ? `${i}/${files.length} · ` : "";
        etiqueta.textContent = prefijo + "Subiendo...";
        try {
          const result = await uploadMedia(file, (pct) => {
            etiqueta.textContent = prefijo + pct + "%";
          });
          mediaLocal.push(result);
        } catch (err) {
          showToast(err.message || "No se pudo subir el archivo.", "error");
        }
      }
      tile.classList.remove("uploading");
      etiqueta.textContent = "Agregar";
      renderMediaTiles();
      mediaInput.value = "";
    });

    document.getElementById("form-trabajo").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btnSubmit = e.target.querySelector('button[type="submit"]');
      const textoOriginal = btnSubmit?.innerHTML;
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<span class="btn-spinner"></span> Guardando...';
      }
      const data = readTrabajoForm(e.target);
      try {
        await saveTrabajo(
          state.user.uid, data, state.inventario,
          trabajo?.id || null, mediaLocal, trabajo?.id ? trabajo : null
        );
        closeSheet();
      } catch (err) {
        console.error(err);
        showToast("No se pudo guardar el trabajo.", "error");
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = textoOriginal;
        }
      }
    });
  }

  else if (type === "trabajo-detail") {
    const trabajo = state.trabajos.find((t) => t.id === id);
    if (!trabajo) return closeSheet();
    content.innerHTML = renderTrabajoDetail(trabajo, state.inventario);
    bindCloseButtons();

    document.getElementById("btn-edit-trabajo").addEventListener("click", () => openSheet("trabajo-form", trabajo.id));

    // Duplicar trabajo: abre el formulario con los mismos datos pero sin id ni fotos
    document.getElementById("btn-duplicar-trabajo")?.addEventListener("click", () => {
      const copia = { ...trabajo };
      delete copia.id;
      copia.media = [];
      copia.fecha = new Date().toISOString().slice(0, 10);
      copia.cliente = "";
      copia.telefono = "";
      state.trabajoDuplicado = copia;
      openSheet("trabajo-form", "__duplicado__");
    });

    // Compartir por WhatsApp
    document.getElementById("btn-compartir-trabajo")?.addEventListener("click", () => {
      const mensaje = generarMensajeWhatsApp(trabajo, getNombreTaller());
      const tel = telefonoWhatsApp(trabajo.telefono);
      const url = tel
        ? `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`
        : `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
      window.open(url, "_blank", "noopener");
    });

    document.getElementById("btn-delete-trabajo").addEventListener("click", async () => {
      const ok = await confirmar({
        titulo: "¿Eliminar este trabajo?",
        mensaje: "Los insumos que usó vuelven al stock. Esta acción no se puede deshacer.",
        aceptar: "Eliminar"
      });
      if (!ok) return;
      try {
        await deleteTrabajo(state.user.uid, trabajo, state.inventario);
        closeSheet();
      } catch (err) {
        console.error(err);
        showToast("No se pudo eliminar el trabajo.", "error");
      }
    });

    content.querySelectorAll("[data-remove-media-detail]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const ok = await confirmar({
          titulo: "¿Eliminar esta foto?",
          mensaje: "Se quita del trabajo y no se puede recuperar.",
          aceptar: "Eliminar"
        });
        if (!ok) return;
        const index = Number(btn.dataset.removeMediaDetail);
        trabajo.media = await removeMediaFromTrabajo(state.user.uid, trabajo, index);
        openSheet("trabajo-detail", trabajo.id);
      });
    });

    // Se suben TODOS los archivos primero y recién al final se vuelve a dibujar
    // el panel. Antes se redibujaba dentro del bucle y, del segundo archivo en
    // adelante, el progreso se escribía en elementos que ya no estaban.
    const mediaInput = document.getElementById("media-input");
    const tile = document.getElementById("media-upload-tile");
    mediaInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files);
      const etiqueta = tile.querySelector("span");
      tile.classList.add("uploading");
      let i = 0;
      let media = trabajo.media || [];
      for (const file of files) {
        i++;
        const prefijo = files.length > 1 ? `${i}/${files.length} · ` : "";
        etiqueta.textContent = prefijo + "Subiendo...";
        try {
          media = await addMediaToTrabajo(state.user.uid, { ...trabajo, media }, file, (pct) => {
            etiqueta.textContent = prefijo + pct + "%";
          });
        } catch (err) {
          showToast(err.message || "No se pudo subir el archivo.", "error");
        }
      }
      trabajo.media = media;
      tile.classList.remove("uploading");
      etiqueta.textContent = "Agregar";
      openSheet("trabajo-detail", trabajo.id);
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

  else if (type === "pago-detail") {
    const pago = state.pagos.find((p) => p.id === id);
    if (!pago) return closeSheet();
    content.innerHTML = renderPagoDetail(pago);
    bindCloseButtons();

    document.getElementById("btn-edit-pago").addEventListener("click", () => {
      openSheet("pago-form", pago.id);
    });

    document.getElementById("btn-delete-pago").addEventListener("click", async () => {
      const ok = await confirmar({
        titulo: "¿Eliminar este gasto?",
        mensaje: "Esta acción no se puede deshacer.",
        aceptar: "Eliminar"
      });
      if (!ok) return;
      await deletePago(state.user.uid, pago.id);
      closeSheet();
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

    const inputCatNueva = document.getElementById("input-categoria-nueva");

    function syncCategoriaUI() {
      const esControl = esCategoria({ categoria: selectCategoria.value }, CATEGORIAS_CONTROL);
      const esNueva = selectCategoria.value === "__nueva__";
      campoUsaPila.classList.toggle("hidden", !esControl);
      // Usar display:none directamente para evitar conflictos con clase hidden
      if (inputCatNueva) {
        inputCatNueva.style.display = esNueva ? "block" : "none";
        if (esNueva) inputCatNueva.focus();
      }
    }
    syncCategoriaUI();
    selectCategoria.addEventListener("change", syncCategoriaUI);

    usaPilaButtons.forEach((b) => {
      b.addEventListener("click", () => {
        usaPilaButtons.forEach((x) => x.classList.toggle("active", x === b));
        usaPilaHidden.value = b.dataset.val;
      });
    });

    // Subida de foto del producto
    const fotoZona = document.getElementById("foto-producto-zona");
    const fotoInput = document.getElementById("foto-producto-input");
    const fotoUrl = document.getElementById("foto-producto-url");
    const fotoProgress = document.getElementById("foto-producto-progress");

    // El <label for="foto-producto-input"> abre el selector solo. No hay que
    // agregarle un click que llame a fotoInput.click(): el evento del input
    // burbujea de vuelta y termina cancelando el selector de archivos.
    fotoInput?.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      fotoProgress?.classList.remove("hidden");
      fotoProgress.textContent = "Subiendo foto...";
      try {
        const result = await subirFotoProducto(file, (pct) => {
          fotoProgress.textContent = `Subiendo... ${pct}%`;
        });
        fotoUrl.value = result.url;
        const placeholder = document.getElementById("foto-producto-placeholder");
        if (placeholder) placeholder.innerHTML = `<img src="${result.url}" class="foto-producto-preview" style="width:100%;height:100%;object-fit:contain;border-radius:10px;">`;
        const existingImg = fotoZona.querySelector("img");
        if (existingImg) existingImg.src = result.url;
        fotoProgress.textContent = "✓ Foto subida";
        setTimeout(() => fotoProgress?.classList.add("hidden"), 2000);
      } catch (err) {
        fotoProgress.textContent = "Error al subir foto";
        showToast("No se pudo subir la foto.", "error");
      }
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
    content.innerHTML = renderProductoDetail(producto, state.movimientos || []);
    bindCloseButtons();

    // Renderizar historial de movimientos del producto
    const contHistorial = document.getElementById("historial-producto");
    if (contHistorial) {
      contHistorial.innerHTML = renderHistorialProducto(producto, state.movimientos || []);
    }

    document.getElementById("btn-edit-producto").addEventListener("click", () => openSheet("producto-form", producto.id));

    document.getElementById("btn-delete-producto").addEventListener("click", async () => {
      const ok = await confirmar({
        titulo: `¿Eliminar ${producto.nombre}?`,
        mensaje: "Se borra del inventario junto con su foto. El historial de movimientos se conserva.",
        aceptar: "Eliminar"
      });
      if (!ok) return;
      await deleteProducto(state.user.uid, producto);
      closeSheet();
    });

    document.getElementById("btn-stock-menos").addEventListener("click", async () => {
      if (Number(producto.stock) <= 0) return showToast("Ya está en cero", "error");
      await adjustStock(state.user.uid, producto, -1);
      openSheet("producto-detail", producto.id);
    });
    document.getElementById("btn-stock-mas").addEventListener("click", async () => {
      await adjustStock(state.user.uid, producto, 1);
      openSheet("producto-detail", producto.id);
    });
  }

  else if (type === "dash-detail") {
    // id contiene el tipo: trabajos-mes, ingresos-mes, costos-mes, ganancia-mes
    content.innerHTML = renderDashboardDetail(id, state);
    bindCloseButtons();
    // Trabajos dentro del detalle también son clickeables
    content.querySelectorAll("[data-open-trabajo]").forEach(card => {
      card.addEventListener("click", () => {
        closeSheet();
        setTimeout(() => openSheet("trabajo-detail", card.dataset.openTrabajo), 120);
      });
    });
  }

  else if (type === "config-taller") {
    content.innerHTML = renderConfigTaller(state.user?.uid || "");
    bindCloseButtons();

    // El logo se sube a Cloudinary y se guarda su URL. Antes se guardaba la
    // imagen entera en base64 dentro de localStorage: podía pasarse del límite
    // y además no viajaba a otro dispositivo.
    const inputLogo = document.getElementById("input-logo-taller");
    const progresoLogo = document.getElementById("logo-progress");
    inputLogo?.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      progresoLogo?.classList.remove("hidden");
      progresoLogo.textContent = "Subiendo logo...";
      try {
        const result = await uploadMedia(file, (pct) => {
          progresoLogo.textContent = `Subiendo... ${pct}%`;
        });
        setConfigLocal({ logoUrl: result.url });
        const preview = document.getElementById("logo-preview");
        if (preview) preview.innerHTML = `<img src="${escapeHtml(result.url)}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
        progresoLogo.textContent = "✓ Logo listo — toca Guardar para aplicarlo";
      } catch (err) {
        progresoLogo.textContent = err.message || "No se pudo subir el logo.";
        showToast("No se pudo subir el logo.", "error");
      }
    });

    document.getElementById("btn-remove-logo")?.addEventListener("click", () => {
      setConfigLocal({ logoUrl: null });
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

    document.getElementById("btn-exportar-datos")?.addEventListener("click", () => {
      exportarDatosCSV(state.trabajos, state.inventario);
      showToast("Respaldo descargado", "success");
    });

    document.getElementById("btn-copiar-uid")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(state.user.uid);
        showToast("ID copiado", "success");
      } catch {
        showToast("Copia el ID a mano desde el recuadro", "error");
      }
    });

    document.getElementById("btn-guardar-taller").addEventListener("click", async () => {
      const btn = document.getElementById("btn-guardar-taller");
      btn.disabled = true;
      try {
        await guardarConfigTaller(state.user.uid, {
          nombre: document.getElementById("input-nombre-taller").value.trim() || "Llaves CerrAuto",
          logoUrl: getConfigTallerActual().logoUrl,
          precioPila: Number(document.getElementById("input-precio-pila").value) || 0,
          precioEspadin: Number(document.getElementById("input-precio-espadin").value) || 0
        });
        showToast("Configuración guardada", "success");
        closeSheet();
        renderApp();
      } catch (err) {
        console.error(err);
        showToast("No se pudo guardar. Revisa tu conexión.", "error");
        btn.disabled = false;
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
      <circle cx="11" cy="11" r="7.5" stroke="#00A8E8" stroke-width="2.4"/>
      <circle cx="11" cy="11" r="2.4" fill="#00A8E8"/>
      <path d="M16.2 16.2L27 27" stroke="#00A8E8" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M22 21L25 24" stroke="#00A8E8" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M19 24L22 27" stroke="#00A8E8" stroke-width="2.4" stroke-linecap="round"/>
    </svg>
  `;
}
