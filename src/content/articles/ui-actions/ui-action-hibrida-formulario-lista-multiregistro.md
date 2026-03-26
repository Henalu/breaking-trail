---
title: "UI Action híbrida: formulario y lista con soporte multi-registro"
description: "Cómo construir una UI Action que funcione en formulario y lista, procese varios registros y conserve el contexto de la lista al terminar."
categoria: ui-actions
tags:
  - ui-action
  - glideajax
  - listas
  - formulario
  - client-script
  - multi-registro
fecha: 2026-03-26
dificultad: intermedio
servicenow_version:
  - "Utah"
  - "Vancouver"
  - "Washington"
  - "Xanadu"
resuelto: true
---

## El problema

Necesitas una misma UI Action para dos contextos distintos en ServiceNow:

- Desde formulario, debe ejecutar lógica server-side directa sobre `current` y dejar al usuario en el registro.
- Desde lista, debe procesar varios registros seleccionados a la vez y conservar los filtros activos después de ejecutar.

A primera vista parece que debería bastar con una UI Action clásica de servidor. En la práctica no funciona así: el formulario y la lista exponen APIs distintas, y el comportamiento de redirect cambia por completo entre ambos contextos.

---

## Por qué ocurre

Desde formulario, una UI Action server-side tiene acceso a `current`, `action.setRedirectURL()` y `gs.addInfoMessage()`. Ese flujo es cómodo porque el servidor conoce exactamente qué registro se está procesando.

Desde lista, el botón se ejecuta en cliente dentro del contexto de la lista. Ahí no existe `current` como registro único y el soporte multi-registro depende de `g_list.getChecked()`, que devuelve los `sys_id` seleccionados separados por comas.

El problema adicional es el redirect. El servidor puede reenviar al formulario o a una lista genérica, pero no conoce de forma fiable la URL real que el usuario está viendo en ese momento con sus filtros, vista y paginación. Esa URL vive en el navegador, no en el contexto server-side de la UI Action.

---

## Lo que no funcionó primero

**Convertir la acción en puramente server-side (`client: false`)**

```javascript
action.setRedirectURL(current.getTableName() + '_list');
```

Esto vuelve a una lista, pero pierde el filtro activo. El usuario aterriza en la lista base, no en el contexto desde el que lanzó la acción.

**Reutilizar `gsftSubmit()` como si la lista fuera un formulario**

```javascript
gsftSubmit(null, g_form.getFormElement(), 'cerrar_tarea');
```

En lista no existe `g_form`. `gsftSubmit()` es válido para formulario, no para acciones multi-registro sobre `g_list`.

**Intentar recuperar la URL desde servidor**

```javascript
action.setRedirectURL(gs.getSession().getUrlOnStack());
```

`getUrlOnStack()` no representa de forma fiable la lista visible con sus filtros. En este caso termina devolviendo una URL interna de sesión o una navegación que no restaura el contexto que el usuario esperaba.

---

## La solución real

El patrón que sí funciona es una **UI Action híbrida**:

- `Client = true` para poder capturar la ejecución desde lista.
- Un bloque server-side dentro del mismo script para el caso de formulario.
- `gsftSubmit()` para relanzar la misma UI Action en servidor cuando vienes desde formulario.
- GlideAjax para delegar al servidor el procesamiento multi-registro desde lista.
- `top.location.reload()` al final del flujo de lista para conservar el contexto exacto de la página actual.

### Configuración de la UI Action

| Campo | Valor |
|-------|-------|
| Action name | `cerrar_tarea` |
| Client | `true` |
| Form button | `true` |
| List action | `true` |
| List choice | `true` |
| Show multiple update | `true` |
| Onclick | `return cerrarTarea();` |

### Script de la UI Action

```javascript
function cerrarTarea() {
    if (typeof g_form != 'undefined') {
        gsftSubmit(null, g_form.getFormElement(), 'cerrar_tarea');
        return false;
    }

    var taskIds = g_list.getChecked();

    if (!taskIds) {
        alert('Selecciona al menos un registro.');
        return false;
    }

    var ga = new GlideAjax('TaskBulkProcessorAjax');
    ga.addParam('sysparm_name', 'cerrarTarea');
    ga.addParam('sysparm_task_ids', taskIds);

    ga.getXMLAnswer(function() {
        // Recarga la lista actual sin perder filtro, vista ni paginación.
        top.location.reload();
    });

    return false;
}

// Cuando el script corre en servidor, window no existe.
if (typeof window == 'undefined')
    serverResolve();

function serverResolve() {
    if (current.assigned_to.nil()) {
        current.assigned_to = gs.getUserID();
    }

    current.state = '3'; // Closed Complete
    current.update();

    gs.addInfoMessage('Tarea ' + current.number + ' cerrada correctamente.');
    action.setRedirectURL(current);
}
```

El detalle importante es la bifurcación de contexto. El mismo artefacto resuelve dos rutas:

| Contexto | Ejecución | Resultado |
|----------|-----------|-----------|
| Formulario | `cerrarTarea()` -> `gsftSubmit()` -> `serverResolve()` | Actualiza `current` y vuelve al registro |
| Lista | `cerrarTarea()` -> GlideAjax | Procesa varios `sys_id` y recarga la lista actual |

### Método GlideAjax en el Script Include

El método debe vivir en un Script Include marcado como `Client callable`. En este ejemplo se llama `TaskBulkProcessorAjax`.

`g_list.getChecked()` devuelve una cadena con varios `sys_id` separados por comas. Si el servidor hace `gr.get(taskIds)`, solo procesará el primero. Hay que separar la cadena e iterar.

```javascript
cerrarTarea: function() {
    var taskIds = this.getParameter('sysparm_task_ids');

    if (!taskIds) {
        return '0';
    }

    var ids = taskIds.split(',');
    var procesados = 0;

    for (var i = 0; i < ids.length; i++) {
        var id = ids[i].trim();
        if (!id) continue;

        var tarea = new GlideRecord('sc_task');
        if (!tarea.get(id)) {
            gs.warn('TaskBulkProcessorAjax: registro no encontrado: ' + id);
            continue;
        }

        if (tarea.assigned_to.nil()) {
            tarea.assigned_to = gs.getUserID();
        }

        tarea.state = '3'; // Closed Complete
        tarea.update();

        procesados++;
    }

    return procesados.toString();
},
```

Si necesitas mostrar el número de registros procesados en cliente, `getXMLAnswer()` ya recibe ese valor como cadena. Para este patrón concreto no hace falta usarlo: la recarga de la lista basta para reflejar el cambio.

---

## Cómo verificar que funciona

**Desde formulario**

1. Abre un registro que cumpla la condición de la UI Action.
2. Ejecuta el botón desde el formulario.
3. Verifica que el registro se actualiza, aparece el `info message` y sigues en el mismo formulario.

**Desde lista**

1. Abre la lista con un filtro reconocible.
2. Marca dos o tres registros con el checkbox.
3. Ejecuta la UI Action desde el menú de lista.
4. La página debe recargarse en la misma lista, con el mismo filtro y la misma vista.
5. Verifica que solo se procesaron los registros seleccionados.

Si al volver a cargar se pierde el filtro, la acción está redirigiendo desde servidor en vez de cerrar el flujo con `top.location.reload()` desde cliente.

---

## Casos edge y advertencias

**`top.location.reload()` conserva contexto, pero no muestra un resumen de resultados.** Si necesitas feedback granular de cuántos registros se procesaron o cuáles fallaron, devuelve un JSON desde GlideAjax y muestra un mensaje antes de recargar.

**El path de formulario sigue siendo mono-registro.** `serverResolve()` trabaja sobre `current`, así que solo resuelve un registro cada vez. El soporte multi-registro existe únicamente en el flujo de lista.

**La lógica de negocio queda duplicada entre UI Action y Script Include.** En ejemplos pequeños es aceptable. Si la transición de estado crece o empieza a reutilizarse desde más lugares, extrae esa lógica a una Script Include común para evitar divergencias.

**`g_list.getChecked()` devuelve una cadena CSV, no un array.** Si olvidas el `split(',')`, el servidor interpretará mal la entrada y normalmente procesará solo el primer `sys_id`.

---

## Versiones de ServiceNow afectadas

| Versión | Estado |
|---------|--------|
| Utah | ✅ Funciona |
| Vancouver | ✅ Funciona |
| Washington | ✅ Funciona |
| Xanadu | ✅ Funciona |

El patrón depende de APIs estables (`g_list`, GlideAjax, `top.location`) y no de un comportamiento específico de una única release, así que es razonable reutilizarlo en familias cercanas.
