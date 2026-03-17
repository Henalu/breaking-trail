---
title: "Cómo navegar a un registro del workspace desde un Event Handler de UI Builder"
description: "window.open abre el navegador, no el workspace. El mecanismo es return { external: { url, target } }, que el framework de Next Experience intercepta y gestiona."
categoria: ui-builder
tags: ["ui-builder", "workspace", "navegacion", "event-handler", "next-experience", "return-external"]
fecha: 2026-03-17
dificultad: intermedio
servicenow_version: ["Xanadu", "Zurich"]
resuelto: true
---

## El problema

Desde un Event Handler de UI Builder necesitas abrir un registro concreto dentro del workspace — no en una pestaña nueva del navegador, sino como una pestaña interna del workspace que el usuario pueda gestionar sin perder el contexto actual.

El mecanismo habitual de `window.open` o `top.open` funciona, pero abre pestañas del navegador. El registro se muestra fuera del workspace, sin la navegación lateral, sin las acciones configuradas, y el usuario pierde el contexto de donde vino.

---

## Por qué ocurre

Los Event Handlers de UI Builder no se ejecutan en el contexto directo del navegador — son funciones gestionadas por el framework de Next Experience. Esto tiene una consecuencia importante: cuando la función devuelve un valor, el framework lo intercepta antes de que llegue al navegador.

ServiceNow aprovecha este mecanismo para implementar navegación interna del workspace: si el Event Handler devuelve un objeto con una clave `external`, el framework lo interpreta como una instrucción de navegación y la ejecuta dentro del workspace en lugar de delegarla al navegador.

`window.open` y `top.open` no usan este mecanismo — saltan directamente al DOM del navegador — por eso abren pestañas externas.

---

## Lo que no funcionó primero

### `window.open` y `top.open`

Abren el registro en una pestaña del navegador independiente. El registro se abre en UI clásica o como página suelta, sin los componentes del workspace.

```javascript
// ❌ abre pestaña del navegador, no pestaña del workspace
window.open('/mi_tabla.do?sys_id=' + sysId, '_blank');
top.open('/mi_tabla.do?sys_id=' + sysId, '_blank');
```

### Redirigir con `location.href`

Navega al registro dentro del workspace para un único registro, pero provoca un reload completo de la página. Si hay que abrir varios registros en un bucle, cada iteración sobreescribe la anterior y solo se abre el último.

```javascript
// ⚠️ reload completo de página, solo funciona para un registro
location.href = '/x/mi_scope/mi_workspace/record/mi_tabla/' + sysId;
```

### `g_aw.openRecord`

La API `GlideAgentWorkspace` está documentada para abrir registros como pestañas internas del workspace, pero su disponibilidad en Event Handlers de UI Builder no es consistente entre versiones ni entre tipos de componente.

---

## La solución

Los Event Handlers de UI Builder admiten un objeto de retorno especial que el framework interpreta como instrucción de navegación. Devolver `{ external: { url, target } }` delega la navegación al framework del workspace.

```javascript
function evaluateEvent({ api, event }) {
    var WORKSPACE_BASE_URL = '/x/mi_scope/mi_workspace'; // URL base de tu workspace
    var TABLA = 'mi_tabla';

    var sysId = event && event.payload && event.payload.sys_id;

    if (!sysId) {
        return { external: null }; // cancela la navegación sin error
    }

    return {
        external: {
            url: WORKSPACE_BASE_URL + '/record/' + TABLA + '/' + encodeURIComponent(sysId),
            target: '_self' // misma pestaña del workspace
        }
    };
}
```

El framework recibe el objeto devuelto, intercepta la clave `external` y abre el registro como pestaña interna del workspace.

Devolver `{ external: null }` cancela la navegación limpiamente cuando no hay sys_id disponible.

---

## Extracción defensiva del sys_id

El sys_id del registro a abrir puede llegar por distintas rutas dependiendo del componente que dispara el evento. El patrón defensivo consiste en buscar en varios candidatos antes de abortar:

```javascript
function evaluateEvent({ api, event }) {
    var WORKSPACE_BASE_URL = '/x/mi_scope/mi_workspace';
    var TABLA = 'mi_tabla';

    function extraerSysId(event) {
        if (!event) return null;

        // Payload estándar de lista o componente
        var payload = event.payload || {};
        if (payload.sys_id) return payload.sys_id;
        if (payload.sysId) return payload.sysId;

        // Payload anidado en contexto de componente custom
        var ctx = event.context;
        if (ctx && ctx.item && ctx.item.value && ctx.item.value.sys_id) {
            return ctx.item.value.sys_id;
        }

        return null;
    }

    var sysId = extraerSysId(event);

    if (!sysId) {
        return { external: null };
    }

    return {
        external: {
            url: WORKSPACE_BASE_URL + '/record/' + TABLA + '/' + encodeURIComponent(sysId),
            target: '_self'
        }
    };
}
```

Si ninguno de los candidatos tiene valor, devuelve `{ external: null }` en lugar de construir una URL con un sys_id vacío.

---

## Cómo verificar que funciona

1. Configura el Event Handler con el patrón `return external`.
2. Dispara el evento desde el componente. El workspace debe abrir el registro como una pestaña interna — sin abrir una pestaña del navegador.
3. Verifica que la pestaña interna tiene los componentes del workspace (acciones, panel lateral, navegación) y no es una vista de UI clásica suelta.
4. Introduce un caso donde el sys_id no exista — el Event Handler debe devolver `{ external: null }` sin producir error ni navegación inesperada.

---

## Casos edge y advertencias

**Produce reload de la pestaña del navegador.** Aunque el registro se abre como pestaña interna del workspace, la navegación provoca un reload completo de la página. El usuario ve brevemente el estado de carga del workspace antes de que aparezca el registro destino. Es aceptable en la mayoría de casos, pero hay que tenerlo en cuenta si el workspace tiene un tiempo de carga elevado.

**Solo abre un registro.** Este mecanismo devuelve un único objeto de navegación. Si necesitas abrir varios registros simultáneamente, este patrón no es aplicable. Ver [Abrir múltiples registros desde una DA de lista](/articulos/workspaces/abrir-multiples-registros-desde-da-lista).

**Exclusivo de Event Handlers de UI Builder.** El patrón `return external` es específico del framework de UI Builder. No funciona en Client Scripts de DA de lista, UI Actions clásicas ni Client Scripts de formulario — en esos contextos el objeto devuelto se descarta.

**URL del workspace.** La URL base varía entre workspaces custom (`/x/<scope>/<workspace>`) y workspaces OOB (`/now/workspace/<nombre>`). Verifica la URL base en la configuración del workspace antes de construir las URLs.

---

## Versiones de ServiceNow afectadas

| Versión | Estado |
|---------|--------|
| Xanadu | Funcionando en producción |
| Zurich | Funcionando en producción |
