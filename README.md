# CRM Editorial: Clientes, Leads y Contratos

Página web estática en JavaScript para registrar clientes por fecha, canal de captación, referidos, seguimientos y contratos. Está pensada para funcionar en GitHub Pages y almacenar la información en Google Sheets usando Google Apps Script como backend.

## Estructura incluida

- `index.html`: interfaz principal.
- `styles.css`: diseño visual, responsive y profesional.
- `app.js`: lógica del formulario, dashboard, filtros, gráficos y conexión con Google Sheets.
- `google_apps_script.gs`: backend que debe pegarse en Google Apps Script.

## Columnas que se guardan en Google Sheets

La base parte de la matriz original: nombres, apellidos, contacto, servicio, origen/red social, estado, seguimiento día 3, seguimiento día 8, seguimiento día 15/30 y observaciones. Además, se agregan campos necesarios para gestión comercial y contractual:

- id
- fechaRegistro
- nombres
- apellidos
- contacto
- cedulaRuc
- correo
- direccion
- ciudad
- servicio
- redSocial
- origenDetalle
- esReferido
- referidoPor
- estado
- huboContrato
- numeroContrato
- fechaContrato
- valorContrato
- formaPago
- seguimientoDia3
- seguimientoDia8
- seguimientoDia15
- proximoSeguimiento
- asesor
- observaciones
- createdAt
- updatedAt

## Configuración de Google Sheets

1. Crea un Google Sheet nuevo.
2. En el Google Sheet, abre **Extensiones > Apps Script**.
3. Borra el contenido inicial y pega el código de `google_apps_script.gs`.
4. Guarda el proyecto.
5. Ve a **Implementar > Nueva implementación**.
6. Selecciona tipo **Aplicación web**.
7. Configura:
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier persona con el enlace**.
8. Autoriza los permisos.
9. Copia la URL terminada en `/exec`.
10. Abre `app.js` y pega esa URL en:

```js
const CONFIG = {
  APPS_SCRIPT_URL: "PEGA_AQUI_TU_URL_EXEC",
  API_TOKEN: ""
};
```

## Publicar en GitHub Pages

1. Crea un repositorio en GitHub.
2. Sube `index.html`, `styles.css` y `app.js` a la raíz del repositorio.
3. En GitHub, entra a **Settings > Pages**.
4. En **Build and deployment**, selecciona:
   - Source: Deploy from a branch.
   - Branch: main / root.
5. Guarda y abre la URL generada por GitHub Pages.

## Modo local

Si `APPS_SCRIPT_URL` está vacío, la página funcionará en modo local con `localStorage`. Esto sirve para pruebas visuales, pero no guarda en Google Sheets. Para operación real, configura Apps Script.
