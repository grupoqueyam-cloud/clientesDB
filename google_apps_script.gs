/**
 * Backend definitivo para GitHub Pages + Google Sheets.
 *
 * CAMBIO CLAVE:
 * - Permite guardar, editar y eliminar mediante JSONP por GET.
 * - Esto evita bloqueos de Safari/Chrome/GitHub Pages con POST no-cors.
 * - Mantiene doPost como respaldo, pero el app.js usa JSONP para todo.
 *
 * PASOS:
 * 1. Abre tu Google Sheet.
 * 2. Extensiones > Apps Script.
 * 3. Borra el código anterior y pega este archivo completo.
 * 4. Ejecuta manualmente la función pruebaConexion y autoriza permisos.
 * 5. Implementar > Administrar implementaciones > Editar > Nueva versión.
 * 6. Ejecutar como: Yo.
 * 7. Acceso: Cualquier persona o Cualquier persona con el enlace.
 * 8. Copia la URL /exec y pégala en app.js.
 */
const SHEET_NAME = 'Clientes';
const SPREADSHEET_ID = ''; // Si el script está dentro del Sheet, déjalo vacío. Si es independiente, pega aquí el ID del Google Sheet.
const API_TOKEN = ''; // Opcional. Si lo llenas, usa el mismo valor en app.js.

const HEADERS = [
  'id', 'fechaRegistro', 'nombres', 'apellidos', 'contacto', 'cedulaRuc', 'correo', 'direccion', 'ciudad',
  'servicio', 'redSocial', 'origenDetalle', 'esReferido', 'referidoPor', 'estado', 'huboContrato',
  'numeroContrato', 'fechaContrato', 'valorContrato', 'formaPago', 'seguimientoDia3', 'seguimientoDia8',
  'seguimientoDia15', 'proximoSeguimiento', 'asesor', 'observaciones', 'createdAt', 'updatedAt'
];

function doGet(e) {
  const lock = LockService.getScriptLock();

  try {
    const action = String((e.parameter && e.parameter.action) || 'list').toLowerCase();
    assertToken_(e, null);

    let result;

    if (action === 'setup') {
      result = { ok: true, message: 'Hoja preparada.', headers: setupSheet_() };
    } else if (action === 'list') {
      result = { ok: true, data: listRecords_(), headers: HEADERS };
    } else if (['create', 'update', 'delete'].indexOf(action) >= 0) {
      lock.waitLock(30000);
      const payload = parsePayloadFromGet_(e);

      if (action === 'create') createRecord_(payload);
      if (action === 'update') updateRecord_(payload);
      if (action === 'delete') deleteRecord_(payload.id);

      result = { ok: true, message: 'Operación guardada correctamente.', data: listRecords_(), headers: HEADERS };
    } else {
      throw new Error('Acción no permitida: ' + action);
    }

    return output_(e, result);
  } catch (error) {
    return output_(e, { ok: false, message: error.message });
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const body = parseBody_(e);
    assertToken_(e, body);

    const action = String(body.action || '').toLowerCase();
    const payload = body.payload || {};

    if (action === 'create') createRecord_(payload);
    else if (action === 'update') updateRecord_(payload);
    else if (action === 'delete') deleteRecord_(payload.id);
    else throw new Error('Acción no permitida: ' + action);

    return output_(e, { ok: true, message: 'Operación guardada correctamente.', data: listRecords_(), headers: HEADERS });
  } catch (error) {
    return output_(e, { ok: false, message: error.message });
  } finally {
    lock.releaseLock();
  }
}

function pruebaConexion() {
  setupSheet_();
  const sheet = getSheet_();
  Logger.log('Conexión correcta. Hoja activa: ' + sheet.getName());
}

function pruebaGuardar() {
  createRecord_({
    fechaRegistro: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    nombres: 'Prueba',
    apellidos: 'Sistema',
    contacto: '0999999999',
    servicio: 'Prueba de conexión',
    redSocial: 'Sistema',
    esReferido: 'No',
    estado: 'Prueba',
    huboContrato: 'No',
    observaciones: 'Registro creado desde Apps Script para validar escritura.'
  });
  Logger.log('Registro de prueba guardado correctamente.');
}

function parsePayloadFromGet_(e) {
  const raw = e && e.parameter && e.parameter.payload ? e.parameter.payload : '{}';
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error('Payload inválido. No se pudo leer la información enviada desde la página.');
  }
}

function parseBody_(e) {
  const contents = e && e.postData && e.postData.contents ? e.postData.contents : '';

  if (contents) {
    try {
      return JSON.parse(contents);
    } catch (err) {
      // Cuando se envía como formulario, llega por e.parameter.data.
    }
  }

  if (e && e.parameter && e.parameter.data) {
    return JSON.parse(e.parameter.data);
  }

  return {};
}

function getSpreadsheet_() {
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No se pudo abrir el Google Sheet. Si el script no está dentro de la hoja, debes llenar SPREADSHEET_ID.');
  return ss;
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
  if (!record.id) record.id = 'CLI-' + new Date().getTime() + '-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  const now = new Date().toISOString();
  record.createdAt = record.createdAt || now;
  record.updatedAt = now;
  sheet.appendRow(HEADERS.map(header => record[header] !== undefined && record[header] !== null ? record[header] : ''));
}

function updateRecord_(payload) {
  if (!payload.id) throw new Error('No se recibió ID para actualizar.');
  const sheet = getSheet_();
  const rowNumber = findRowById_(sheet, payload.id);
  if (!rowNumber) throw new Error('No se encontró el registro a actualizar.');

  const current = rowToObject_(sheet.getRange(rowNumber, 1, 1, HEADERS.length).getValues()[0]);
  const record = normalizeRecord_(Object.assign({}, current, payload));
  record.updatedAt = new Date().toISOString();
  sheet.getRange(rowNumber, 1, 1, HEADERS.length).setValues([HEADERS.map(header => record[header] !== undefined && record[header] !== null ? record[header] : '')]);
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
    if (value instanceof Date) {
      if (header.toLowerCase().includes('fecha')) {
        obj[header] = Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      } else {
        obj[header] = value.toISOString();
      }
    } else {
      obj[header] = value;
    }
    return obj;
  }, {});
}

function normalizeRecord_(payload) {
  const record = {};
  HEADERS.forEach(header => record[header] = payload && payload[header] !== undefined && payload[header] !== null ? payload[header] : '');
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
  const token = (body && body.token) || (e && e.parameter && e.parameter.token) || '';
  if (token !== API_TOKEN) throw new Error('Token inválido.');
}

function output_(e, obj) {
  const callback = e && e.parameter && e.parameter.callback ? String(e.parameter.callback) : '';
  const payload = JSON.stringify(obj);

  if (callback) {
    const safeCallback = callback.replace(/[^a-zA-Z0-9_.$]/g, '');
    return ContentService
      .createTextOutput(`${safeCallback}(${payload});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}
