/*
  CONFIGURACIÓN
  1) Publica google_apps_script.gs como Web App.
  2) Pega aquí la URL terminada en /exec.
  3) Sube estos archivos a GitHub Pages.
*/
const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbyZH0IqWCqleke0KlZGZ9-fGRsr6_X5HC_zyD7wzvkFwE-8dvnTqXfPAN8wXjycvEi4zw/exec", // Ejemplo: "https://script.google.com/macros/s/AKfycb.../exec"
  API_TOKEN: "AKfycbyZH0IqWCqleke0KlZGZ9-fGRsr6_X5HC_zyD7wzvkFwE-8dvnTqXfPAN8wXjycvEi4zw" // Opcional. Debe coincidir con API_TOKEN en Google Apps Script si lo activas.
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
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function apiReady() {
  return CONFIG.APPS_SCRIPT_URL && CONFIG.APPS_SCRIPT_URL.startsWith("https://script.google.com/");
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function uniqueId() {
  return `CLI-${Date.now()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
}

function normalizeYesNo(value) {
  return value === "Sí" || value === true || value === "SI" || value === "Si" ? "Sí" : "No";
}

function setStatus(type, text) {
  const status = $("#apiStatus");
  status.className = `status-pill ${type}`;
  status.textContent = text;
}

function setMessage(text, type = "ok") {
  const message = $("#formMessage");
  message.textContent = text;
  message.className = `form-message ${type}`;
  if (text) setTimeout(() => { message.textContent = ""; }, 4500);
}

async function requestApi(action, payload = {}) {
  if (!apiReady()) {
    return localRequest(action, payload);
  }

  try {
    let response;
    if (action === "list") {
      const url = new URL(CONFIG.APPS_SCRIPT_URL);
      url.searchParams.set("action", "list");
      if (CONFIG.API_TOKEN) url.searchParams.set("token", CONFIG.API_TOKEN);
      response = await fetch(url.toString(), { method: "GET", redirect: "follow" });
    } else {
      response = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, token: CONFIG.API_TOKEN, payload })
      });
    }

    const data = await response.json();
    if (!data.ok) throw new Error(data.message || "No se pudo procesar la solicitud.");
    setStatus("connected", "Conectado a Google Sheets");
    return data;
  } catch (error) {
    console.error(error);
    setStatus("error", "Error de conexión con Google Sheets");
    throw error;
  }
}

function localRequest(action, payload = {}) {
  const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  let data = current;

  if (action === "create") {
    data = [{ ...payload }, ...current];
  }
  if (action === "update") {
    data = current.map((item) => item.id === payload.id ? { ...item, ...payload } : item);
  }
  if (action === "delete") {
    data = current.filter((item) => item.id !== payload.id);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  setStatus("warning", "Modo local: configura Google Sheets");
  return Promise.resolve({ ok: true, data });
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
  $("#leadForm").scrollIntoView({ behavior: "smooth", block: "start" });
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

function renderDashboard(items) {
  const total = items.length;
  const contratos = items.filter((item) => normalizeYesNo(item.huboContrato) === "Sí").length;
  const sinContrato = total - contratos;
  const referidos = items.filter((item) => normalizeYesNo(item.esReferido) === "Sí").length;

  $("#kpiTotal").textContent = total;
  $("#kpiContratos").textContent = contratos;
  $("#kpiSinContrato").textContent = sinContrato;
  $("#kpiReferidos").textContent = referidos;

  const redes = countBy(items, "redSocial");
  const fechas = countBy(items, "fechaRegistro");
  const sortedDates = Object.keys(fechas).filter(Boolean).sort();

  upsertChart("chartContratos", "doughnut", ["Con contrato", "Sin contrato"], [contratos, sinContrato], "Clientes");
  upsertChart("chartRedes", "bar", Object.keys(redes), Object.values(redes), "Clientes por canal");
  upsertChart("chartFechas", "line", sortedDates, sortedDates.map((date) => fechas[date]), "Registros por fecha");
}

function renderCanalFilter() {
  const select = $("#filterCanal");
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

function render() {
  const filtered = getFilteredLeads();
  renderCanalFilter();
  renderDashboard(filtered);
  renderTable(filtered);
}

async function loadLeads() {
  try {
    const response = await requestApi("list");
    leads = (response.data || []).map((item) => ({ ...item, huboContrato: normalizeYesNo(item.huboContrato), esReferido: normalizeYesNo(item.esReferido) }));
    render();
  } catch (error) {
    setMessage(error.message, "error");
  }
}

async function saveLead(event) {
  event.preventDefault();
  const payload = collectFormData();
  const isEditing = Boolean($("#id").value);

  try {
    await requestApi(isEditing ? "update" : "create", payload);
    setMessage(isEditing ? "Registro actualizado correctamente." : "Cliente guardado correctamente.");
    resetForm();
    await loadLeads();
  } catch (error) {
    setMessage(error.message, "error");
  }
}

async function deleteLead(id) {
  const item = leads.find((lead) => lead.id === id);
  const name = item ? `${item.nombres || ""} ${item.apellidos || ""}`.trim() : "este registro";
  if (!confirm(`¿Eliminar ${name || "este registro"}?`)) return;

  try {
    await requestApi("delete", { id });
    setMessage("Registro eliminado.");
    await loadLeads();
  } catch (error) {
    setMessage(error.message, "error");
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

function bindEvents() {
  $("#leadForm").addEventListener("submit", saveLead);
  $("#btnClear").addEventListener("click", resetForm);
  $("#btnSync").addEventListener("click", loadLeads);
  $("#btnExport").addEventListener("click", exportCSV);

  ["#filterSearch", "#filterFrom", "#filterTo", "#filterContrato", "#filterCanal"].forEach((selector) => {
    $(selector).addEventListener("input", render);
    $(selector).addEventListener("change", render);
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
  if (!apiReady()) setStatus("warning", "Modo local: configura Google Sheets");
  await loadLeads();
});
