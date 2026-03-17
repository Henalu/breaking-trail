---
title: "Abrir múltiples registros desde una DA de lista: g_aw no está disponible"
description: "g_aw no existe en DA de lista. location.href solo abre el último registro. La solución es top.open con GlideAjax al Script Include con prefijo de scope."
categoria: workspaces
tags: ["declarative-actions", "workspace", "lista", "top-open", "g_aw", "glideajax", "client-script"]
fecha: 2026-03-17
dificultad: intermedio
servicenow_version: ["Xanadu", "Zurich"]
resuelto: true
---

## El problema

Tienes una Declarative Action de tipo List en el workspace. Al ejecutarla, necesitas abrir varios registros relacionados — registros de otra tabla vinculados a los registros seleccionados a través de un campo GlideList o una relación.

El objetivo natural era abrir esos registros como pestañas internas del workspace. Lo que descubres rápidamente es que ninguno de los mecanismos habituales funciona como esperas en este contexto.

---

## Por qué ocurre

El Client Script de una DA de lista se ejecuta en un sandbox del workspace con acceso limitado al DOM y a las APIs del navegador. Este sandbox es diferente al contexto de un formulario o de un Event Handler de UI Builder.

La consecuencia principal: `g_aw` (la API `GlideAgentWorkspace`) **no está inyectada en este contexto**. Es el mecanismo documentado para abrir registros como pestañas internas del workspace, pero ServiceNow no lo expone en el sandbox de las DAs de lista. Confirmado como defecto conocido sin solución oficial hasta Zurich.

El segundo problema: `window` en el sandbox del workspace apunta a un iframe hijo con restricciones same-origin que impiden la apertura de nuevas pestañas. `top` resuelve al frame raíz del navegador, donde sí está disponible `open`.

---

## Lo que no funcionó primero

### `g_aw.openRecord`

La API documentada para abrir registros como pestañas internas del workspace.

```javascript
// ❌ g_aw es undefined en el Client Script de una DA de lista
g_aw.openRecord('mi_tabla', sysId);
```

No produce error descriptivo — simplemente falla porque `g_aw` no existe en este contexto.

### `window.open`

```javascript
// ❌ no ocurre nada visible
window.open('mi_tabla.do?sys_id=' + sysId, '_blank');
```

`window` apunta al iframe del workspace. Las restricciones same-origin bloquean la apertura de pestañas desde ese contexto.

### `location.href` en bucle

Navega correctamente dentro del workspace para un único registro, pero en un bucle cada iteración sobreescribe la anterior. Solo se abre el último registro.

```javascript
// ⚠️ solo abre el último — cada iteración cancela la anterior
for (var i = 0; i < sysIds.length; i++) {
    location.href = '/x/mi_scope/mi_workspace/record/mi_tabla/' + sysIds[i];
}
```

### URL de lista del workspace con `sysparm_query`

Construir una URL de lista del workspace con la query `IN` de los sys_ids tampoco funciona. El parámetro `sysparm_query` no tiene efecto en las URLs de lista de workspace custom — el estado de la lista está codificado en el `tiny-id` de la URL y no puede construirse dinámicamente desde cliente.

---

## La solución

`top.open` sí funciona desde el sandbox de una DA de lista. Abre pestañas del navegador — no pestañas internas del workspace — pero es el único mecanismo que permite abrir múltiples registros de forma fiable desde este contexto.

```javascript
function abrirRegistrosRelacionados() {
    try {
        var seleccionados = g_list.getChecked();

        if (!seleccionados || seleccionados === '') {
            alert('Selecciona al menos un registro antes de ejecutar esta acción.');
            return;
        }

        // Llamada al Script Include con el prefijo de scope explícito
        var ga = new GlideAjax('x_mi_scope.MiScriptInclude');
        ga.addParam('sysparm_name', 'obtenerRegistrosRelacionados');
        ga.addParam('sysparm_record_ids', seleccionados);

        ga.getXMLAnswer(function(respuesta) {
            if (!respuesta || respuesta === '') {
                alert('No se encontraron registros relacionados en los registros seleccionados.');
                return;
            }

            var sysIds = respuesta.split(',');
            for (var i = 0; i < sysIds.length; i++) {
                var sysId = sysIds[i].trim();
                if (sysId !== '') {
                    top.open('mi_tabla_relacionada.do?sys_id=' + sysId, '_blank');
                }
            }
        });

    } catch (ex) {
        alert('Error al procesar la acción: ' + ex.message);
    }
}
```

El Script Include del lado servidor recibe los sys_ids seleccionados, recupera los registros relacionados y devuelve sus sys_ids como string separado por comas. El Client Script itera y abre cada uno con `top.open`.

---

## GlideAjax en DA de lista: el prefijo de scope es obligatorio

A diferencia de UI Builder (donde `GlideAjax` no está disponible), el sandbox de las DA de Client Script **sí tiene `GlideAjax`**. Sin embargo, para llamar a un Script Include en un scope custom hay que incluir el prefijo explícitamente:

```javascript
// ❌ no llega al Script Include — falla silenciosamente, sin error en logs
var ga = new GlideAjax('MiScriptInclude');

// ✅ correcto
var ga = new GlideAjax('x_mi_scope.MiScriptInclude');
```

Sin el prefijo la llamada no produce error visible pero tampoco ejecuta el Script Include ni genera logs. Es uno de los fallos más difíciles de diagnosticar en este contexto porque todo parece funcionar — simplemente no ocurre nada.

---

## Cómo verificar que funciona

1. Selecciona varios registros en la lista del workspace y ejecuta la DA.
2. El navegador debe abrir una pestaña nueva por cada registro relacionado encontrado.
3. Si ningún registro tiene relacionados, debe aparecer el `alert` de aviso.
4. Para verificar el prefijo de scope: abre la consola de red del navegador y confirma que la llamada GlideAjax devuelve un `answer` con los sys_ids esperados.

---

## Casos edge y advertencias

**Los registros se abren en el navegador, no en el workspace.** Es la limitación de fondo. `top.open` abre pestañas del navegador independientes. Si la tabla destino tiene formulario configurado en el workspace, las pestañas mostrarán UI clásica embebida o el formulario del workspace dependiendo de la URL que uses (`tabla.do` vs URL del workspace). Decide cuál es más útil para tu caso.

**Bloqueador de popups.** Abrir múltiples pestañas con `top.open` en un bucle puede activar el bloqueador de popups del navegador a partir de la segunda o tercera pestaña. Avisa al usuario en la documentación interna para que permita popups del dominio de ServiceNow.

**Número elevado de registros.** Si la selección puede devolver decenas de sys_ids, abrir una pestaña por cada uno es inviable. En ese caso considera redirigir a una vista de lista con la query `sys_idIN<ids>` en UI clásica, donde el parámetro sí tiene efecto.

**`g_aw` puede estar disponible en versiones futuras.** ServiceNow ha reconocido la limitación. Si en una release posterior `g_aw` queda disponible en DAs de lista, el patrón preferido sería `g_aw.openRecord` para mantener la navegación dentro del workspace.

---

## Resumen de mecanismos disponibles en DA de lista

| Mecanismo | Disponible | Abre múltiples | Dentro del workspace |
|---|---|---|---|
| `g_aw.openRecord` | ❌ no disponible | — | — |
| `window.open` | ❌ bloqueado por iframe | — | — |
| `location.href` | ✅ | ❌ solo el último | ✅ |
| `top.open` | ✅ | ✅ | ❌ pestaña del navegador |

---

## Versiones de ServiceNow afectadas

| Versión | Estado |
|---------|--------|
| Xanadu | Limitación confirmada en producción |
| Zurich | Limitación confirmada en producción |
