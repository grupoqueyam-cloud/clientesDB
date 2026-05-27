# Corrección de guardado en Google Sheets

Esta versión corrige el problema donde la interfaz actualizaba gráficas pero no escribía filas en Google Sheets.

## Archivos que debes reemplazar

- `app.js`
- `google_apps_script.gs`

## Cambio principal

La versión anterior guardaba con `fetch(..., mode: "no-cors")`. Algunos navegadores, especialmente Safari, pueden enviar una respuesta opaca o bloquear el proceso sin mostrar el error real.

Esta versión guarda, actualiza y elimina usando JSONP por GET:

- `action=create`
- `action=update`
- `action=delete`
- `payload={...}`
- `callback=...`

Así el navegador sí recibe una respuesta confirmada de Apps Script.

## Pasos obligatorios

1. Abre el Google Sheet.
2. Ve a **Extensiones > Apps Script**.
3. Borra el código anterior.
4. Pega todo el contenido de `google_apps_script.gs`.
5. Ejecuta la función `pruebaConexion` y autoriza permisos.
6. Ejecuta la función `pruebaGuardar` y revisa que se cree una fila en la hoja `Clientes`.
7. Ve a **Implementar > Administrar implementaciones > Editar**.
8. En versión selecciona **Nueva versión**.
9. Configura:
   - Ejecutar como: **Yo**
   - Acceso: **Cualquier persona** o **Cualquier persona con el enlace**
10. Copia la URL `/exec` y pégala en `app.js`.
11. Sube `app.js` a GitHub Pages y recarga con `Cmd + Shift + R` o `Ctrl + Shift + R`.

## Prueba directa

Abre tu URL así:

```text
https://script.google.com/macros/s/TU_ID/exec?action=create&callback=test&payload=%7B%22nombres%22%3A%22Prueba%22%2C%22apellidos%22%3A%22Web%22%2C%22contacto%22%3A%220999999999%22%2C%22fechaRegistro%22%3A%222026-05-27%22%2C%22huboContrato%22%3A%22No%22%2C%22esReferido%22%3A%22No%22%7D
```

Debe responder algo como:

```js
test({"ok":true,"message":"Operación guardada correctamente.", ...});
```

Y debe aparecer una fila en Google Sheets.
