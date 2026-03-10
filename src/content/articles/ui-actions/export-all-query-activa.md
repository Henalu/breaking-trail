---
title: "UI Action Export ALL: exportar solo lo que el usuario realmente ve"
description: "El export nativo ignora Business Rules before query. Esta UI Action exporta exactamente la query activa, incluso si es invisible para el usuario."
categoria: ui-actions
tags: ["export", "business-rules", "before-query", "lista", "g_list", "client-script"]
fecha: 2026-03-10
dificultad: intermedio
servicenow_version: ["Utah", "Vancouver", "Washington", "Xanadu"]
resuelto: true
---

## El problema

Tienes una tabla con una Business Rule **before query** que filtra registros según el usuario o el contexto (rol, grupo, vista...). El usuario solo ve lo que le corresponde ver.

Hasta ahí todo bien.

El problema llega cuando ese usuario quiere exportar. Hace clic derecho sobre una columna, elige **Export → Excel**, y ServiceNow le exporta **todo**. No lo que ve. Todo.

La Business Rule before query fue ignorada silenciosamente.

---

## Por qué ocurre

El export nativo de lista (`XLS`, `CSV`, `PDF` desde el menú contextual) lanza una petición directa a la tabla sin pasar por el contexto de lista actual. No toma la query que está activa en pantalla: ejecuta su propia consulta, y esa consulta **sí pasa por la before query** en el servidor — pero el parámetro `sysparm_query` que construye el export nativo no incluye los filtros que la before query añadió dinámicamente en la sesión del usuario.

El resultado: el export y la lista viven en contextos separados, y el mecanismo de la before query no garantiza coherencia entre ambos.

> Esto no es un bug de ServiceNow per se — es una limitación de arquitectura del export nativo que se vuelve problemática en cuanto introduces before queries que filtran por contexto de sesión.

---

## Lo que no funcionó primero

**Intento 1: usar `window.location.search`**

En UI Actions de lista, el código client-side corre dentro de un frame embebido. `window` en ese contexto no apunta al frame raíz, y `window.location.search` puede devolver una URL vacía o incorrecta.

La solución es usar `top.location.search`, que siempre referencia el frame raíz donde está la URL real que ve el usuario.

**Intento 2: confiar solo en `g_list.getQuery()`**

`g_list.getQuery()` devuelve la query que el cliente conoce — pero si los filtros se aplicaron sin un reload completo de página, puede no reflejar el estado real. Se usa como fallback, no como fuente primaria.

---

## La solución: UI Action "Export ALL"

Una List Choice action client-side que extrae la query activa de la URL y construye manualmente la petición de exportación.

### Configuración

| Campo | Valor |
|---|---|
| **Name** | Export ALL |
| **Table** | global (aplica a todas las tablas) |
| **Type** | List Choice |
| **Client** | true |
| **Active** | true |
| **Condition** | `current.canWrite()` |
| **On click** | `exportQueried()` |

> **¿Por qué `current.canWrite()` como condición?**
> Es un proxy razonable para "usuario con acceso suficiente para exportar". Ajusta según tu política de seguridad — podrías usar `gs.hasRole('admin')` o una condición más específica.

### Script

```javascript
function exportQueried() {
  try {
    var tabla = g_list.tableName;
    var vista = g_list.getView() || 'default';

    // En UI Actions de lista, el código corre dentro de un frame.
    // 'window' puede ser null en ese contexto — 'top' es siempre el frame raíz
    // y es donde está la URL real que ve el usuario.
    var urlActual = top.location.search;
    var queryActiva = '';

    var params = urlActual.replace('?', '').split('&');
    for (var i = 0; i < params.length; i++) {
      var par = params[i].split('=');
      if (par[0] === 'sysparm_query') {
        queryActiva = decodeURIComponent(par[1] || '');
        break;
      }
    }

    // Fallback si la query no viaja en la URL
    // (filtros aplicados sin reload completo).
    if (!queryActiva || queryActiva === '') {
      queryActiva = g_list.getQuery();
    }

    var urlExportacion = tabla + '_list.do?XLS' +
      '&sysparm_query=' + encodeURIComponent(queryActiva) +
      '&sysparm_view=' + vista +
      '&landscape=true';

    top.location.href = urlExportacion;

  } catch (ex) {
    alert('Error al intentar exportar: ' + ex.message);
  }
}
```

---

## Cómo verificar que funciona

1. Abre una tabla que tenga una Business Rule before query activa para tu usuario.
2. Confirma que la lista muestra menos registros de los que habría sin el filtro.
3. Usa el export nativo (clic derecho → Export → Excel) y comprueba cuántos registros trae. Debería traer de más.
4. Usa **Export ALL** desde el menú de acciones de lista y compara. Debe traer exactamente lo que ves.

Si no ves la UI Action, verifica que está en scope Global y que el usuario cumple la condición (`canWrite()`).

---

## Casos edge y advertencias

**Query vacía → exporta todo**

Si no hay ningún filtro activo y la URL no contiene `sysparm_query`, `queryActiva` quedará vacío. En ese caso, la URL de exportación se construye sin `sysparm_query`, lo que exporta todos los registros visibles para ese usuario según la before query del servidor.

El código tiene una sección comentada que añade un `alert` en este caso. Puedes activarla si prefieres avisar al usuario antes de lanzar un export potencialmente masivo:

```javascript
// if (!queryActiva || queryActiva === '') {
//   alert('No se ha podido determinar la query activa. Asegúrate de tener filtros aplicados antes de exportar.');
//   return;
// }
```

**Vistas personalizadas**

El script captura la vista activa con `g_list.getView()`. Si tu tabla tiene vistas con columnas muy distintas, el export respetará la vista actual. Verifica que los campos que el usuario necesita están incluidos en esa vista.

**Scope de la tabla**

La UI Action está en la tabla `global`, lo que la despliega en todas las listas. Si solo la necesitas en tablas concretas, cambia el valor de **Table** al nombre de la tabla específica.

**Export en Workspaces**

Esta UI Action es para la UI clásica (listas). En Workspaces la arquitectura de listas es diferente y este script no aplica directamente.

---

## Versiones de ServiceNow afectadas

El comportamiento del export nativo ignorando before queries existe al menos desde **Utah**. Verificado en Utah, Vancouver y Washington. El workaround con `top.location.search` funciona en todas esas versiones.

En versiones anteriores a Utah el comportamiento puede variar — si trabajas en Tokyo o San Diego, prueba antes de desplegar en producción.
