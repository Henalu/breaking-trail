---
title: "Exportar registros seleccionados desde una lista en ServiceNow"
description: "Cómo crear una UI Action que exporte solo los registros marcados en una lista. Por qué window y GlideURLV2 fallan y cómo resolverlo con top.location."
categoria: ui-actions
tags: [ui-action, javascript, client-script, listas, export, glide]
fecha: 2026-03-04
dificultad: intermedio
servicenow_version: [Xanadu, Zurich]
resuelto: true
---

## El problema

Tienes una lista en ServiceNow con cientos de registros. Necesitas exportar a Excel solo los que has marcado manualmente, no toda la query. El botón nativo de exportación no distingue entre registros seleccionados y no seleccionados: exporta todo lo que devuelve el filtro activo.

La solución obvia es crear una UI Action de lista con un script cliente que construya la query a partir de los checkboxes marcados. El problema aparece cuando intentas leer el contexto de la lista desde ese script.

---

## Por qué ocurre

Las listas en ServiceNow no se renderizan en el frame principal del navegador. Se cargan dentro de un **iframe embebido**, lo que tiene consecuencias directas en qué objetos de JavaScript están disponibles y cómo se comportan.

Cuando tu UI Action de lista ejecuta su script cliente, está corriendo dentro de ese iframe hijo, no en el contexto del navegador que el usuario ve.

Esto rompe dos enfoques que parecen razonables:

**`GlideURLV2`** no está definido en el contexto de cliente de lista. Es una clase disponible en otros contextos de ServiceNow, pero no en el frame donde corren las UI Actions de lista.

**`window.location`** tampoco funciona como esperas. `window` en el contexto del iframe hijo puede ser `null` o apuntar al frame equivocado, dependiendo de las restricciones same-origin entre frames internos de la plataforma.

---

## Lo que no funcionó primero

El primer intento fue construir la URL con `GlideURLV2`:

```javascript
// ❌ No funciona — GlideURLV2 no está definido en contexto de lista
var url = new GlideURLV2(tableName + '_list.do');
url.addParam('XLS', '');
url.addParam('sysparm_query', query);
top.location.href = url.getURL();
```

El segundo intento fue leer la URL actual con `window.location` para preservar el filtro activo:

```javascript
// ❌ No funciona — window es null en el frame de lista
var params = window.location.search;
```

Ambos fallan silenciosamente o lanzan un error de referencia nula. Sin un `try/catch` los verías en la consola del navegador, pero la UI Action simplemente no haría nada visible.

---

## La solución real

Dos piezas combinadas: `g_list.getChecked()` para obtener los registros marcados, y `top.location` para construir y navegar a la URL de exportación.

```javascript
function exportSelected() {
    try {
        // Obtiene los sys_id de los registros marcados en la lista
        var checkedRecords = g_list.getChecked();
        
        // Construye una query IN con los sys_id seleccionados
        var query = "sys_idIN" + checkedRecords.toString();
        
        var table = g_list.tableName;
        var view = g_list.getView();
        
        // top.location apunta al frame raíz — donde vive la URL real
        var url = table + "_list.do?XLS&sysparm_query=" + query +
                  "&sysparm_view=" + view +
                  "&sysparm_view=print&landscape=true";
        
        top.location.href = url;
        
    } catch (ex) {
        var message = ex.message;
    }
}
```

**Configuración de la UI Action:**

| Campo | Valor |
|-------|-------|
| Table | global (aplica a todas las tablas) |
| Client | true |
| List choice | true |
| List banner button | false |
| Condition | `current.canWrite()` |
| Onclick | `exportSelected()` |

`top` siempre resuelve al frame raíz de la aplicación, que es donde está la URL navegable real. Es la única referencia al contexto de navegador que funciona de forma fiable desde un iframe de lista en ServiceNow.

---

## Cómo verificar que funciona

1. Navega a cualquier lista de la tabla donde instalaste la UI Action
2. Marca 2 o 3 registros con los checkboxes
3. Haz click en el botón de la UI Action
4. El navegador debe iniciar la descarga de un archivo `.xls`
5. Abre el archivo y verifica que contiene **únicamente** los registros que marcaste

Si el archivo contiene más registros de los esperados, revisa que `g_list.getChecked()` no esté devolviendo una cadena vacía — en ese caso la query `sys_idIN` sin valores exportaría todos los registros de la tabla.

---

## Casos edge y advertencias

**En listas con más de 10.000 registros seleccionados**, la URL puede superar el límite de longitud de algunos navegadores. Es un caso improbable en uso real, pero si tu caso de uso implica selecciones masivas considera paginar la exportación.

**La condición `current.canWrite()`** limita el botón a usuarios con permiso de escritura sobre la tabla. Ajústala según tus necesidades — si quieres que cualquier usuario pueda exportar, puedes usar `true` o una condición basada en rol.

---

## Versiones de ServiceNow afectadas

Probado y funcionando en:

| Versión | Estado |
|---------|--------|
| Zurich (patch6-hotfix1) | ✅ Funciona |
| Xanadu | ✅ Funciona |

El comportamiento de `window` en iframes de lista lleva siendo consistente desde versiones anteriores. No se conocen cambios planificados en este mecanismo de renderizado.
