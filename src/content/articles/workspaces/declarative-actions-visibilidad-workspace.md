---
title: "Declarative Actions no aparecen en el Workspace: la cadena de configuración UXF que nadie documenta"
description: "Tu DA scoped no aparece en el workspace y no hay errores. La causa no es el scope: es una cadena de configuración UXF rota. Diagnóstico y fix."
categoria: workspaces
tags: ["declarative-actions", "workspace", "next-experience", "uxf", "sys_ux_action_config", "scoped-apps"]
fecha: 2026-03-06
dificultad: avanzado
servicenow_version: ["Zurich"]
resuelto: true
---

## El problema

Creas una Declarative Action en tu scope propio. La tabla es correcta, el modelo es correcto, el rol tiene acceso. La activas. Vas al workspace — y no aparece.

Sin errores en logs. Sin mensajes en la consola. La acción simplemente no existe para el framework.

La misma acción, creada en **Global** apuntando a la misma tabla, aparece inmediatamente.

La conclusión obvia es que las DAs en scope propio no funcionan en workspaces. Esa conclusión es incorrecta.

---

## Por qué ocurre

El problema no es el scope. Es que el workspace no tiene correctamente montada la cadena de configuración que el framework UXF usa para saber qué acciones debe exponer.

Esa cadena es:

```
sys_ux_page_registry
    └── sys_ux_page_property (name: actionConfigId)
            └── value = sys_id → sys_ux_action_config
                    └── DAs vinculadas al workspace
```

Cuando el campo `value` de la `sys_ux_page_property` no apunta a un `sys_id` válido de `sys_ux_action_config`, el workspace no tiene referencia de qué acciones mostrar. El framework no lanza error — simplemente no renderiza nada que no esté en Global.

Por eso las DAs en Global siempre funcionaban: el framework UXF las resuelve por defecto sin necesidad de esta cadena. Lo que generaba la falsa impresión de que el problema era de scope.

---

## Lo que no funcionó primero

Crear la DA en Global apuntando a la tabla del scope. Funciona como workaround, pero contamina Global con lógica que debería vivir en el scope propio. No es la solución — es una señal de que algo más está roto.

También se investigó si el patrón de herencia por `Action Name` que usa ServiceNow en sus propias acciones OOTB tenía algo que ver con la visibilidad. No era la causa raíz — es un mecanismo independiente que merece su propio artículo.

---

## La solución

### 1. Localizar la sys_ux_page_property del workspace

Navega a `sys_ux_page_property` y filtra por el nombre de tu workspace. Busca el registro con `name = actionConfigId`.

Verifica el campo `value`. Debe contener el `sys_id` de un registro en `sys_ux_action_config`. Si está vacío o apunta a un sys_id inexistente, ahí está el problema.

**Referencia OOTB:** en el workspace `Service Operations Workspace`, la `sys_ux_page_property actionConfigId` apunta al registro `SOW Admin Center Config` en `sys_ux_action_config`. Ese es el patrón correcto.

### 2. Verificar o crear la sys_ux_action_config

Navega a `sys_ux_action_config` y busca si existe un registro para tu workspace. Si no existe, créalo.

En el registro verás una related list con las DAs vinculadas al workspace. Las acciones que aparezcan aquí son las que el framework expone.

### 3. Vincular la propiedad con la configuración

En la `sys_ux_page_property` de tu workspace, actualiza el campo `value` con el `sys_id` del registro `sys_ux_action_config` correspondiente.

```
sys_ux_page_registry           → página UX de tu workspace
    └── sys_ux_page_property
            name:  actionConfigId
            value: <sys_id de tu sys_ux_action_config>  ← esto es lo que faltaba
```

Tras este cambio, las DAs en scope propio aparecen en el workspace sin necesidad de moverlas a Global.

---

## Cómo verificar que funciona

1. Crea una DA mínima en tu scope apuntando a tu tabla — un `gs.addInfoMessage('test')` es suficiente.
2. Actívala.
3. Abre el workspace y navega a un registro de esa tabla.
4. La acción debe aparecer en el Action Bar.

Si aparece, la cadena está correctamente montada. Si no aparece, revisa que la DA tenga el modelo correcto (`List` para listas, `Form` para formularios) y que el rol del usuario tenga visibilidad sobre el registro `sys_ux_action_config`.

---

## Casos edge y advertencias

**GlideAjax no funciona en DAs.** Si tu lógica original usaba GlideAjax para llamadas asíncronas al servidor, tendrás que reimplementarla como Server Script. Las DAs no soportan GlideAjax en el contexto de Client Script.

**`Record selection required`.** Si la acción opera sobre registros seleccionados de una lista, marca este campo. El framework gestiona automáticamente la selección — no hace falta implementar lógica adicional para recoger los registros seleccionados.

**`Group` y `Order`.** El campo `Group` agrupa acciones bajo un desplegable en el Action Bar. El campo `Order` controla qué acción queda visible directamente y cuáles van al desplegable. Si tienes varias acciones en el mismo grupo, el `Order` más bajo es la que aparece visible por defecto.

---

## Versiones de ServiceNow afectadas

Confirmado en **Zurich**. Pendiente verificar en Washington DC y versiones anteriores.

---

## Tablas involucradas

| Tabla | Rol |
|---|---|
| `sys_declarative_action_assignment` | Definición de la DA |
| `sys_ux_page_registry` | Registro de la página UX del workspace |
| `sys_ux_page_property` | Propiedades de página, incluida `actionConfigId` |
| `sys_ux_action_config` | Configuración de acciones del workspace |
| `sys_ux_m2m_action_assignment_action_config` | Vinculación M2M entre DAs y UX Action Config |
