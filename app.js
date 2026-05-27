/*
  CRM Clientes + Google Sheets + GitHub Pages
  Versión con CONTROL MANUAL DE ACTUALIZACIÓN.

  Problema corregido:
  - Ya no se fuerza la sincronización al cargar la página.
  - Las gráficas no se redibujan en cada movimiento/filtro.
  - Se agrega control manual para actualizar datos, gráficas e ir al formulario.
  - Se preserva el scroll cuando se actualiza el dashboard.
*/
const CONFIG = {
  APPS_SCRIPT_URL: "", // Ejemplo: "https://script.google.com/macros/s/AKfycb.../exec"
  API_TOKEN: "", // Opcional. Debe coincidir con API_TOKEN en Google Apps Script si lo activas.
  AUTO_LOAD_ON_START: false, // Déjalo en false para evitar errores automáticos al abrir la página.
  AUTO_REFRESH_MINUTES: 5
};

const STORAGE_KEY = "crm_clientes_editorial_demo";
const HEADERS = [
  "id", "fechaRegistro", "nombres", "apellidos", "contacto", "cedulaRuc", "correo", "direccion", "ciudad",
  "servicio", "redSocial", "origenDetalle", "esReferido", "referidoPor", "estado", "huboContrato",
  "numeroContrato", "fechaContrato", "valorContrato", "formaPago", "seguimientoDia3", "seguimientoDia8",
  "seguimientoDia15", "proximoSeguimiento", "asesor", "observaciones", "createdAt", "updatedAt"
];

let leads = [];
let charts = {};
let syncTimer = null;
let isSyncing = false;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function apiReady() {
  return CONFIG.APPS_SCRIPT_URL && CONFIG.APPS_SCRIPT_URL.startsWith("https://script.google.com/") && CONFIG.APPS_SCRIPT_URL.endsWith("/exec");
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function uniqueId() {
  return `CLI-${Date.now()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
}

function normalizeYesNo(value) {
  return value === "Sí" || value === true || value === "SI" || value === "Si" || value === "sí" ? "Sí" : "No";
}

function setStatus(type, text) {
  const status = $("#apiStatus");
  if (!status) return;
  status.className = `status-pill ${type}`;
  status.textContent = text;
}

function setMessage(text, type = "ok") {
  const message = $("#formMessage");
  if (!message) return;
  message.textContent = text;
  message.className = `form-message ${type}`;
  if (text) setTimeout(() => { message.textContent = ""; }, 5500);
}

function setSyncMessage(text, type = "neutral") {
  const el = $("#syncMessage");
  if (!el) return;
  el.textContent = text;
  el.className = `sync-message ${type}`;
}

function updateLastSync() {
  const el = $("#lastSyncLabel");
  if (!el) return;
  const now = new Date();
  el.textContent = `Última actualización: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
}

function setBusy(state) {
  isSyncing = state;
  ["#btnSync", "#btnUpdateData", "#btnUpdateDashboard", "#btnSave"].forEach((selector) => {
    const btn = $(selector);
    if (btn) btn.disabled = state;
  });
  document.body.classList.toggle("is-syncing", state);
}

function jsonpRequest(params = {}) {
  return new Promise((resolve, reject) => {
    if (!apiReady()) {
      reject(new Error("La URL de Apps Script no está configurada correctamente. Debe terminar en /exec."));
      return;
    }

    const callbackName = `crmCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const url = new URL(CONFIG.APPS_SCRIPT_URL);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    url.searchParams.set("callback", callbackName);
    if (CONFIG.API_TOKEN) url.searchParams.set("token", CONFIG.API_TOKEN);

    const script = document.createElement("script");
    script.async = true;

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Tiempo de espera agotado. Revisa la implementación de Apps Script y que el acceso sea: Cualquier persona con el enlace."));
    }, 25000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("No se pudo cargar la respuesta de Google Sheets. Abre la URL /exec?action=list&callback=test para verificar permisos."));
    };

    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestApi(action, payload = {}) {
  if (!apiReady()) return localRequest(action, payload);

  let data;
  if (action === "list" || action === "setup") {
    data = await jsonpRequest({ action });
  } else {
    const form = new URLSearchParams();
    form.set("data", JSON.stringify({ action, token: CONFIG.API_TOKEN, payload }));

    await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      body: form
    });

    // Google Apps Script puede tardar unos milisegundos en escribir la fila.
    await sleep(900);
    data = await jsonpRequest({ action: "list" });
  }

  if (!data || !data.ok) throw new Error(data?.message || "No se pudo procesar la solicitud en Google Sheets.");
  setStatus("connected", "Conectado a Google Sheets");
  return data;
}

function localRequest(action, payload = {}) {
  const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  let data = current;

  if (action === "create") data = [{ ...payload }, ...current];
  if (action === "update") data = current.map((item) => item.id === payload.id ? { ...item, ...payload } : item);
  if (action === "delete") data = current.filter((item) => item.id !== payload.id);

  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  setStatus("warning", "Modo local: configura Google Sheets");
  return Promise.resolve({ ok: true, data, headers: HEADERS });
}

function collectFormData() {
  const formData = new FormData($("#leadForm"));
  const item = Object.fromEntries(formData.entries());
  const now = new Date().toISOString();
  const existing = leads.find((lead) => lead.id === item.id);

  item.id = item.id || uniqueId();
  item.fechaRegistro = item.fechaRegistro || todayISO();
  item.esReferido = normalizeYesNo(item.esReferido);
  item.huboContrato = normalizeYesNo(item.huboContrato);
  item.valorContrato = item.valorContrato ? Number(item.valorContrato) : "";
  item.createdAt = existing?.createdAt || now;
  item.updatedAt = now;

  HEADERS.forEach((header) => {
    if (item[header] === undefined || item[header] === null) item[header] = "";
  });

  return item;
}

function fillForm(item) {
  HEADERS.forEach((header) => {
    const input = document.getElementById(header);
    if (input) input.value = item[header] ?? "";
  });
  $("#formTitle").textContent = "Editar registro";
  scrollToElement("leadForm");
}

function resetForm() {
  $("#leadForm").reset();
  $("#id").value = "";
  $("#fechaRegistro").value = todayISO();
  $("#formTitle").textContent = "Nuevo registro";
}

function getFilteredLeads() {
  const search = $("#filterSearch").value.trim().toLowerCase();
  const from = $("#filterFrom").value;
  const to = $("#filterTo").value;
  const contrato = $("#filterContrato").value;
  const canal = $("#filterCanal").value;

  return leads.filter((item) => {
    const date = item.fechaRegistro || "";
    const haystack = Object.values(item).join(" ").toLowerCase();
    const passSearch = !search || haystack.includes(search);
    const passFrom = !from || date >= from;
    const passTo = !to || date <= to;
    const passContrato = !contrato || normalizeYesNo(item.huboContrato) === contrato;
    const passCanal = !canal || item.redSocial === canal;
    return passSearch && passFrom && passTo && passContrato && passCanal;
  }).sort((a, b) => (b.fechaRegistro || "").localeCompare(a.fechaRegistro || ""));
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "Sin dato";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function upsertChart(id, type, labels, data, label) {
  const ctx = document.getElementById(id);
  if (!ctx || !window.Chart) return;

  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(ctx, {
    type,
    data: {
      labels,
      datasets: [{
        label,
        data,
        borderWidth: 2,
        tension: 0.35,
        borderRadius: 12
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      resizeDelay: 250,
      plugins: {
        legend: { position: "bottom" },
        tooltip: { mode: "index", intersect: false }
      },
      scales: type === "doughnut" ? {} : {
        y: { beginAtZero: true, ticks: { precision: 0 } },
        x: { ticks: { maxRotation: 0 } }
      }
    }
  });
}

function renderKpis(items) {
  const total = items.length;
  const contratos = items.filter((item) => normalizeYesNo(item.huboContrato) === "Sí").length;
  const sinContrato = total - contratos;
  const referidos = items.filter((item) => normalizeYesNo(item.esReferido) === "Sí").length;

  $("#kpiTotal").textContent = total;
  $("#kpiContratos").textContent = contratos;
  $("#kpiSinContrato").textContent = sinContrato;
  $("#kpiReferidos").textContent = referidos;
}

function renderCharts(items) {
  const scrollBefore = window.scrollY;
  const total = items.length;
  const contratos = items.filter((item) => normalizeYesNo(item.huboContrato) === "Sí").length;
  const sinContrato = total - contratos;
  const redes = countBy(items, "redSocial");
  const fechas = countBy(items, "fechaRegistro");
  const sortedDates = Object.keys(fechas).filter(Boolean).sort();

  upsertChart("chartContratos", "doughnut", ["Con contrato", "Sin contrato"], [contratos, sinContrato], "Clientes");
  upsertChart("chartRedes", "bar", Object.keys(redes), Object.values(redes), "Clientes por canal");
  upsertChart("chartFechas", "line", sortedDates, sortedDates.map((date) => fechas[date]), "Registros por fecha");

  // Evita que el redibujado de Chart.js mueva la pantalla y bloquee la llegada al formulario.
  requestAnimationFrame(() => window.scrollTo({ top: scrollBefore, left: 0, behavior: "auto" }));
}

function renderCanalFilter() {
  const select = $("#filterCanal");
  if (!select) return;
  const current = select.value;
  const canales = [...new Set(leads.map((item) => item.redSocial).filter(Boolean))].sort();
  select.innerHTML = '<option value="">Todos</option>' + canales.map((canal) => `<option value="${escapeHtml(canal)}">${escapeHtml(canal)}</option>`).join("");
  select.value = canales.includes(current) ? current : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderTable(items) {
  const body = $("#clientTableBody");
  if (!body) return;

  if (!items.length) {
    body.innerHTML = '<tr><td colspan="9" class="empty">No hay registros con los filtros seleccionados.</td></tr>';
    return;
  }

  body.innerHTML = items.map((item) => {
    const fullName = `${item.nombres || ""} ${item.apellidos || ""}`.trim() || "Sin nombre";
    const contratoClass = normalizeYesNo(item.huboContrato) === "Sí" ? "yes" : "no";
    const referidoClass = normalizeYesNo(item.esReferido) === "Sí" ? "yes" : "no";
    return `
      <tr data-id="${escapeHtml(item.id)}">
        <td>${escapeHtml(item.fechaRegistro || "-")}</td>
        <td><strong>${escapeHtml(fullName)}</strong><br><small>${escapeHtml(item.correo || item.cedulaRuc || "")}</small></td>
        <td>${escapeHtml(item.contacto || "-")}</td>
        <td>${escapeHtml(item.servicio || "-")}</td>
        <td><span class="badge info">${escapeHtml(item.redSocial || "Sin dato")}</span></td>
        <td><span class="badge ${referidoClass}">${escapeHtml(normalizeYesNo(item.esReferido))}</span></td>
        <td>${escapeHtml(item.estado || "-")}</td>
        <td><span class="badge ${contratoClass}">${escapeHtml(normalizeYesNo(item.huboContrato))}</span></td>
        <td>
          <div class="row-actions">
            <button class="icon-btn edit" type="button" data-action="edit">Editar</button>
            <button class="icon-btn delete" type="button" data-action="delete">Eliminar</button>
          </div>
        </td>
      </tr>`;
  }).join("");
}

function render({ updateCharts = false } = {}) {
  const filtered = getFilteredLeads();
  renderCanalFilter();
  renderKpis(filtered);
  renderTable(filtered);
  if (updateCharts) renderCharts(filtered);
}

function normalizeList(data) {
  return (data || []).map((item) => ({
    ...item,
    huboContrato: normalizeYesNo(item.huboContrato),
    esReferido: normalizeYesNo(item.esReferido)
  }));
}

async function loadLeads({ updateCharts = true, silent = false } = {}) {
  if (isSyncing) return;
  setBusy(true);
  setSyncMessage("Sincronizando con Google Sheets...", "loading");

  try {
    const response = await requestApi("list");
    leads = normalizeList(response.data);
    render({ updateCharts });
    updateLastSync();
    setSyncMessage("Datos actualizados correctamente.", "ok");
  } catch (error) {
    console.error(error);
    setStatus("error", "Error de conexión con Google Sheets");
    setSyncMessage(error.message, "error");
    if (!silent) setMessage(error.message, "error");
    render({ updateCharts: false });
  } finally {
    setBusy(false);
  }
}

async function saveLead(event) {
  event.preventDefault();
  const payload = collectFormData();
  const isEditing = Boolean($("#id").value);
  const originalLeads = [...leads];

  // Actualización optimista: actualiza interfaz aunque Google tarde en responder.
  if (isEditing) leads = leads.map((item) => item.id === payload.id ? payload : item);
  else leads = [payload, ...leads];
  render({ updateCharts: true });

  setBusy(true);
  setSyncMessage("Guardando registro...", "loading");

  try {
    const response = await requestApi(isEditing ? "update" : "create", payload);
    leads = normalizeList(response.data);
    render({ updateCharts: true });
    updateLastSync();
    setMessage(isEditing ? "Registro actualizado correctamente." : "Cliente guardado correctamente.");
    setSyncMessage("Registro guardado y dashboard actualizado.", "ok");
    resetForm();
  } catch (error) {
    console.error(error);
    // Se conserva la actualización local para que no se bloquee la interfaz.
    leads = originalLeads;
    render({ updateCharts: true });
    setStatus("error", "Error de conexión con Google Sheets");
    setSyncMessage(error.message, "error");
    setMessage("No se pudo confirmar el guardado en Google Sheets. Revisa la conexión y vuelve a actualizar datos.", "error");
  } finally {
    setBusy(false);
  }
}

async function deleteLead(id) {
  const item = leads.find((lead) => lead.id === id);
  const name = item ? `${item.nombres || ""} ${item.apellidos || ""}`.trim() : "este registro";
  if (!confirm(`¿Eliminar ${name || "este registro"}?`)) return;

  const originalLeads = [...leads];
  leads = leads.filter((item) => item.id !== id);
  render({ updateCharts: true });

  setBusy(true);
  setSyncMessage("Eliminando registro...", "loading");
  try {
    const response = await requestApi("delete", { id });
    leads = normalizeList(response.data);
    render({ updateCharts: true });
    updateLastSync();
    setMessage("Registro eliminado.");
    setSyncMessage("Registro eliminado y dashboard actualizado.", "ok");
  } catch (error) {
    console.error(error);
    leads = originalLeads;
    render({ updateCharts: true });
    setMessage(error.message, "error");
    setSyncMessage(error.message, "error");
  } finally {
    setBusy(false);
  }
}

function exportCSV() {
  const rows = getFilteredLeads();
  const csv = [HEADERS.join(",")].concat(rows.map((row) => HEADERS.map((header) => {
    const value = row[header] ?? "";
    return `"${String(value).replaceAll('"', '""')}"`;
  }).join(","))).join("\n");

  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `clientes_${todayISO()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function scrollToElement(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function toggleAutoRefresh(enabled) {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = null;

  if (enabled) {
    syncTimer = setInterval(() => {
      if (!isSyncing) loadLeads({ updateCharts: false, silent: true });
    }, CONFIG.AUTO_REFRESH_MINUTES * 60 * 1000);
    setSyncMessage(`Autoactualización activada cada ${CONFIG.AUTO_REFRESH_MINUTES} minutos.`, "ok");
  } else {
    setSyncMessage("Autoactualización desactivada. Usa Actualizar datos cuando lo necesites.", "neutral");
  }
}

function bindEvents() {
  $("#leadForm").addEventListener("submit", saveLead);
  $("#btnClear").addEventListener("click", resetForm);
  $("#btnSync").addEventListener("click", () => loadLeads({ updateCharts: true }));
  $("#btnUpdateData")?.addEventListener("click", () => loadLeads({ updateCharts: false }));
  $("#btnUpdateDashboard")?.addEventListener("click", () => render({ updateCharts: true }));
  $("#btnGoForm")?.addEventListener("click", () => scrollToElement("leadForm"));
  $("#btnGoFormHero")?.addEventListener("click", () => scrollToElement("leadForm"));
  $("#btnGoTable")?.addEventListener("click", () => scrollToElement("tableSection"));
  $("#btnExport").addEventListener("click", exportCSV);
  $("#toggleAutoRefresh")?.addEventListener("change", (event) => toggleAutoRefresh(event.target.checked));

  ["#filterSearch", "#filterFrom", "#filterTo", "#filterContrato", "#filterCanal"].forEach((selector) => {
    $(selector).addEventListener("input", () => render({ updateCharts: false }));
    $(selector).addEventListener("change", () => render({ updateCharts: false }));
  });

  $("#clientTableBody").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const row = event.target.closest("tr[data-id]");
    const id = row?.dataset.id;
    if (!id) return;

    if (button.dataset.action === "edit") {
      const item = leads.find((lead) => lead.id === id);
      if (item) fillForm(item);
    }
    if (button.dataset.action === "delete") deleteLead(id);
  });

  $("#esReferido").addEventListener("change", (event) => {
    if (event.target.value === "Sí") $("#redSocial").value = "Referido";
  });

  $("#huboContrato").addEventListener("change", (event) => {
    if (event.target.value === "Sí") $("#estado").value = "Contrato firmado";
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  resetForm();
  render({ updateCharts: true });

  if (!apiReady()) {
    setStatus("warning", "Modo local: configura Google Sheets");
    setSyncMessage("URL de Apps Script pendiente. El sistema funcionará en modo local.", "neutral");
    return;
  }

  setStatus("warning", "Conexión lista. Actualiza manualmente.");
  setSyncMessage("Presiona Actualizar datos para sincronizar con Google Sheets.", "neutral");

  if (CONFIG.AUTO_LOAD_ON_START) {
    await loadLeads({ updateCharts: true, silent: true });
  }
});
