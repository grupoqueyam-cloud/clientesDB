# CRM Clientes Editorial - Versión con control de actualización

Esta versión agrega un **panel de control de actualización** para evitar que el sistema redibuje gráficas o sincronice automáticamente mientras el usuario está intentando bajar al formulario.

## Archivos que debes reemplazar en GitHub Pages

Reemplaza estos archivos:

- `index.html`
- `styles.css`
- `app.js`

El archivo `google_apps_script.gs` puede mantenerse, pero se incluye nuevamente en este paquete.

## Configuración principal en `app.js`

Pega tu URL real de Apps Script aquí:

```js
const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/TU_ID/exec",
  API_TOKEN: "",
  AUTO_LOAD_ON_START: false,
  AUTO_REFRESH_MINUTES: 5
};
```

Se recomienda dejar `AUTO_LOAD_ON_START: false` para que la página no intente conectarse automáticamente al abrir. Usa el botón **Actualizar datos**.

## Uso del nuevo control

- **Actualizar datos**: consulta Google Sheets y actualiza la tabla/KPIs.
- **Actualizar gráficas**: redibuja los gráficos solo cuando lo necesites.
- **Ir al formulario**: baja directamente a la sección de ingreso de clientes.
- **Ir a la tabla**: baja a la base de datos.
- **Autoactualizar cada 5 min**: opcional; no redibuja gráficas para no mover el scroll.

## Prueba de Apps Script

Abre esta URL en el navegador:

```text
https://script.google.com/macros/s/TU_ID/exec?action=list&callback=test
```

Debe devolver algo como:

```js
test({"ok":true,"data":[],"headers":[...]});
```

Si devuelve una página de error o login, revisa la implementación de Apps Script: debe estar como **Aplicación web**, ejecutar como **Yo** y acceso **Cualquier persona con el enlace**.
