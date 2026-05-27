/**
 * Backend para guardar la página de GitHub Pages en Google Sheets.
 *
 * PASOS:
 * 1. Crea un Google Sheet.
 * 2. Extensiones > Apps Script.
 * 3. Pega este código.
 * 4. Implementar > Nueva implementación > Aplicación web.
 * 5. Ejecutar como: Yo. Acceso: Cualquier persona con el enlace.
 * 6. Copia la URL /exec y pégala en CONFIG.APPS_SCRIPT_URL dentro de app.js.
 */
const SHEET_NAME = 'Clientes';
const SPREADSHEET_ID = ''; // Opcional. Si el script está vinculado al Sheet, déjalo vacío.
const API_TOKEN = ''; // Opcional. Si lo llenas, usa el mismo valor en app.js.

const HEADERS = [
  'id', 'fechaRegistro', 'nombres', 'apellidos', 'contacto', 'cedulaRuc', 'correo', 'direccion', 'ciudad',
  'servicio', 'redSocial', 'origenDetalle', 'esReferido', 'referidoPor', 'estado', 'huboContrato',
  'numeroContrato', 'fechaContrato', 'valorContrato', 'formaPago', 'seguimientoDia3', 'seguimientoDia8',
  'seguimientoDia15', 'proximoSeguimiento', 'asesor', 'observaciones', 'createdAt', 'updatedAt'
];

function doGet(e) {
  try {
    assertToken_(e, null);
    const action = (e.parameter.action || 'list').toLowerCase();
    if (action === 'setup') return json_({ ok: true, message: 'Hoja preparada.', headers: setupSheet_() });
    return json_({ ok: true, data: listRecords_(), headers: HEADERS });
  } catch (error) {
    return json_({ ok: false, message: error.message });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const body = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : '{}');
    assertToken_(e, body);
    const action = String(body.action || '').toLowerCase();
    const payload = body.payload || {};

    if (action === 'create') createRecord_(payload);
    else if (action === 'update') updateRecord_(payload);
    else if (action === 'delete') deleteRecord_(payload.id);
    else throw new Error('Acción no permitida: ' + action);

    return json_({ ok: true, data: listRecords_(), headers: HEADERS });
  } catch (error) {
    return json_({ ok: false, message: error.message });
  } finally {
    lock.releaseLock();
  }
}

function getSpreadsheet_() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  setupSheet_(sheet);
  return sheet;
}

function setupSheet_(sheet) {
  sheet = sheet || (getSpreadsheet_().getSheetByName(SHEET_NAME) || getSpreadsheet_().insertSheet(SHEET_NAME));
  const lastColumn = Math.max(sheet.getLastColumn(), HEADERS.length);
  const firstRow = sheet.getLastRow() > 0 ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];
  const mustResetHeaders = HEADERS.some((header, index) => firstRow[index] !== header);

  if (sheet.getLastRow() === 0 || mustResetHeaders) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#176b87')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');
  sheet.autoResizeColumns(1, HEADERS.length);
  return HEADERS;
}

function listRecords_() {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  return values
    .filter(row => row.some(cell => cell !== '' && cell !== null))
    .map(row => rowToObject_(row));
}

function createRecord_(payload) {
  const sheet = getSheet_();
  const record = normalizeRecord_(payload);
  if (!record.id) record.id = Utilities.getUuid();
  const now = new Date().toISOString();
  record.createdAt = record.createdAt || now;
  record.updatedAt = now;
  sheet.appendRow(HEADERS.map(header => record[header] || ''));
}

function updateRecord_(payload) {
  if (!payload.id) throw new Error('No se recibió ID para actualizar.');
  const sheet = getSheet_();
  const rowNumber = findRowById_(sheet, payload.id);
  if (!rowNumber) throw new Error('No se encontró el registro a actualizar.');

  const current = rowToObject_(sheet.getRange(rowNumber, 1, 1, HEADERS.length).getValues()[0]);
  const record = normalizeRecord_(Object.assign({}, current, payload));
  record.updatedAt = new Date().toISOString();
  sheet.getRange(rowNumber, 1, 1, HEADERS.length).setValues([HEADERS.map(header => record[header] || '')]);
}

function deleteRecord_(id) {
  if (!id) throw new Error('No se recibió ID para eliminar.');
  const sheet = getSheet_();
  const rowNumber = findRowById_(sheet, id);
  if (!rowNumber) throw new Error('No se encontró el registro a eliminar.');
  sheet.deleteRow(rowNumber);
}

function findRowById_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  const index = ids.findIndex(value => String(value) === String(id));
  return index >= 0 ? index + 2 : null;
}

function rowToObject_(row) {
  return HEADERS.reduce((obj, header, index) => {
    const value = row[index];
    obj[header] = value instanceof Date ? Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd') : value;
    return obj;
  }, {});
}

function normalizeRecord_(payload) {
  const record = {};
  HEADERS.forEach(header => record[header] = payload[header] !== undefined && payload[header] !== null ? payload[header] : '');
  record.esReferido = yesNo_(record.esReferido);
  record.huboContrato = yesNo_(record.huboContrato);
  return record;
}

function yesNo_(value) {
  const text = String(value || '').toLowerCase();
  return ['sí', 'si', 'true', '1', 'yes'].indexOf(text) >= 0 ? 'Sí' : 'No';
}

function assertToken_(e, body) {
  if (!API_TOKEN) return;
  const token = (body && body.token) || (e.parameter && e.parameter.token) || '';
  if (token !== API_TOKEN) throw new Error('Token inválido.');
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
