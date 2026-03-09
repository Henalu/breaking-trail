---
title: "Cómo llamar a un Script Include desde un Client Script de UI Builder"
description: "Patrón completo: helpers.snHttp en UI Builder → Scripted REST Resource → Script Include. Lógica de servidor reutilizable desde el workspace."
categoria: ui-builder
tags: ["ui-builder", "scripted-rest", "script-include", "helpers.snHttp", "workspace"]
fecha: 2026-03-09
dificultad: avanzado
servicenow_version: ["Zurich"]
resuelto: true
---

# Cómo llamar a un Script Include desde un Client Script de UI Builder

## El problema

Tienes lógica de negocio encapsulada en un Script Include — validaciones, consultas complejas, operaciones sobre registros — y necesitas invocarla desde un Client Script en UI Builder.

El problema: los Client Scripts de UI Builder se ejecutan en el contexto del cliente, no del servidor. No puedes instanciar un Script Include directamente. La pregunta es cómo llegar al servidor de forma limpia, autenticada y reutilizable.

## Por qué ocurre

UI Builder introduce un modelo de componentes donde los scripts del lado del cliente operan en un sandbox JavaScript del navegador. A diferencia de los Client Scripts clásicos (formularios) que tienen acceso a `GlideAjax`, los scripts de UI Builder trabajan con una API diferente: `helpers`.

El helper `helpers.snHttp` es el mecanismo oficial para llamadas HTTP autenticadas desde UI Builder. Usa automáticamente la sesión activa del usuario — sin tokens expuestos en cliente, sin CORS que gestionar manualmente.

El flujo natural es:

```
Client Script (UI Builder)
  → helpers.snHttp (llamada autenticada)
    → Scripted REST Resource (capa API)
      → Script Include (lógica de negocio)
```

Cada capa tiene una responsabilidad clara. El Script Include no sabe nada de HTTP. El Scripted REST Resource no contiene lógica de negocio. El Client Script no accede directamente a datos.

## Lo que no funcionó primero

El primer intento suele ser usar `GlideAjax` desde el Client Script de UI Builder por inercia de los formularios clásicos. No funciona: `GlideAjax` no está disponible en el contexto de UI Builder.

## La solución real con código

### Capa 1 — Script Include (lógica de negocio)

El Script Include no cambia respecto a cómo lo usarías desde cualquier otro contexto server-side. Encapsula la lógica y devuelve un objeto con `ok` y los datos necesarios.

```javascript
var UserInfoUtils = Class.create();
UserInfoUtils.prototype = {
    initialize: function() {},

    /**
     * Devuelve datos básicos de un usuario dado su sys_id.
     *
     * @param {string} userSysId - sys_id del registro sys_user
     * @returns {{ ok: boolean, name?: string, email?: string, department?: string, message?: string }}
     */
    getUserInfo: function(userSysId) {
        if (!userSysId) {
            return { ok: false, message: 'Falta user_sys_id' };
        }

        var gr = new GlideRecord('sys_user');
        if (!gr.get(userSysId)) {
            return { ok: false, message: 'Usuario no encontrado' };
        }

        return {
            ok: true,
            name: gr.getValue('name'),
            email: gr.getValue('email'),
            department: gr.getDisplayValue('department')
        };
    },

    type: 'UserInfoUtils'
};
```

**Nota importante:** el Script Include debe ser `Client callable: false`. No necesita serlo — lo llamamos desde el servidor (el Scripted REST Resource), no desde el cliente directamente.

### Capa 2 — Scripted REST Resource

Crea un **Scripted REST API** (`sys_ws_definition`) con el namespace de tu scope y añade un Resource (`sys_ws_operation`) con método POST.

Configuración del Resource:
- **HTTP method:** POST
- **Relative path:** `/user_info` (o el nombre que corresponda)
- **Requires authentication:** true
- **Requires ACL authorization:** true

Script del Resource:

```javascript
(function process(request, response) {

    var body = request.body.data || {};
    var userSysId = body.user_sys_id;

    // Validación de parámetros de entrada
    if (!userSysId) {
        response.setStatus(400);
        return { ok: false, message: 'Falta user_sys_id' };
    }

    // Instanciamos el Script Include — aquí está la clave del patrón
    var utils = new UserInfoUtils();
    var result = utils.getUserInfo(userSysId);

    if (!result.ok) {
        response.setStatus(500);
    }

    return result;

})(request, response);
```

El Resource Path completo tendrá la forma:
`/api/<namespace>/<api_id>/user_info`

### Capa 3 — Client Script en UI Builder

Tipo: **Event Handler** asociado al evento que necesites (drag & drop, click, cambio de estado, etc.).

```javascript
/**
 * @param {params} params
 * @param {api} params.api
 * @param {any} params.event
 * @param {ApiHelpers} params.helpers
 */
async function handler({ api, event, helpers }) {
    try {
        const payload = event?.payload || {};

        // Extraemos el sys_id del usuario del evento
        const userSysId = payload?.user_sys_id || null;

        if (!userSysId) {
            return;
        }

        // helpers.snHttp gestiona la autenticación automáticamente
        // No necesitamos tokens, headers de sesión ni CSRF manual
        const { response } = await helpers.snHttp(
            '/api/<namespace>/<api_id>/user_info',
            {
                method: 'POST',
                body: {
                    user_sys_id: userSysId
                }
            }
        );

        const result = response?.result;

        if (!result?.ok) {
            console.log('[Handler] Error al obtener datos del usuario:', result?.message);
            return;
        }

        // Actualizamos el estado del componente con los datos recibidos
        api.setState('userName', result.name);
        api.setState('userEmail', result.email);
        api.setState('userDepartment', result.department);

    } catch (e) {
        console.error('[Handler] Error inesperado:', e);
    }
}
```

## Cómo verificar que funciona

1. **Verifica el Scripted REST Resource en el REST API Explorer:**
   - Navega a `System Web Services > Scripted REST APIs`
   - Abre tu API y usa el API Explorer integrado para hacer una llamada POST manual con `{ "user_sys_id": "<sys_id_real>" }`
   - Confirma que recibe el cuerpo, instancia el Script Include y devuelve `{ ok: true, name: "...", email: "...", department: "..." }`

2. **Verifica el Client Script con los logs de consola:**
   - Abre el workspace en una pestaña separada con DevTools abierto
   - Activa el evento (drag & drop, click, etc.)
   - Comprueba en la consola que la llamada a `helpers.snHttp` completa sin errores

3. **Verifica el Script Include de forma aislada:**
   - Usa una Background Script para instanciar el Script Include directamente y probar su lógica
   - Es más rápido que iterar a través de toda la cadena

## Casos edge y advertencias

**Scope y visibilidad del Script Include**

Si el Script Include está en un scope custom (`x_<vendor>_<app>`), el Scripted REST Resource debe estar en el **mismo scope** para poder instanciarlo sin cruzar barreras de scope. Si los necesitas en scopes diferentes, activa `Accessible from: All application scopes` en el Script Include.

**El resultado de `helpers.snHttp` está envuelto en `response.result`**

La respuesta que devuelve el Scripted REST Resource se recibe en el Client Script bajo `response.result`, no directamente en `response`. Es un wrapping que hace la plataforma. El patrón correcto:

```javascript
const { response } = await helpers.snHttp(...);
const myData = response?.result; // aquí está lo que devolvió el Resource
```

**No hacer lógica pesada en el Client Script**

El Client Script solo debe extraer parámetros del evento, llamar al endpoint y actualizar estado de UI. Toda validación de datos, consultas a tablas y lógica de negocio van en el Script Include. Si el Client Script crece, es señal de que algo del servidor se está filtrando al cliente.

**Los errores del Script Include no llegan automáticamente al cliente**

Si el Script Include lanza una excepción no controlada, el Scripted REST Resource devolverá un 500 genérico. Usa bloques try/catch en el Script Include y devuelve siempre `{ ok: false, message: '...' }` en lugar de dejar que explote. El Client Script puede así dar feedback al usuario en lugar de fallar en silencio.

**Record Watchers y bucles de eventos**

Si usas este patrón combinado con un Record Watcher (el watcher detecta un cambio → client script llama al endpoint → el endpoint modifica el registro → watcher detecta el cambio de nuevo), necesitas un mecanismo de guardia para romper el bucle. El patrón más habitual es un flag de estado en el componente (`isReverting`, `isProgrammaticChange`) que se activa antes de llamar al endpoint y se consulta al inicio del handler del watcher para suprimir la respuesta.

## Versiones de ServiceNow afectadas

Patrón aplicable desde **Vancouver** (cuando UI Builder alcanzó madurez para workspaces de producción). Verificado en **Zurich**.

`helpers.snHttp` es el mecanismo estándar documentado por ServiceNow para llamadas autenticadas desde UI Builder. No es un workaround — es la API oficial.
