---
title: "El patrón de herencia de Declarative Actions: cómo ServiceNow usa Action Name para sobrescribir lógica por tabla"
description: "ServiceNow implementa un patrón de herencia en DAs usando Action Name como clave. Una acción global como base, múltiples scoped como overrides por tabla."
categoria: workspaces
tags: ["declarative-actions", "workspace", "next-experience", "action-name", "scoped-apps", "uxf"]
fecha: 2026-03-06
dificultad: avanzado
servicenow_version: ["Zurich"]
resuelto: true
---

## El problema

Tienes una Declarative Action en Global sobre `task` y otra en un scope sobre `incident`, ambas con el mismo `Action Name`. Desactivas la de `incident` — la acción sigue apareciendo en el workspace. Desactivas la de `task` — la acción desaparece.

¿Por qué una DA en Global sobre `task` controla la visibilidad de una acción en `incident`? ¿Y qué pasa con la lógica — cuál de las dos se ejecuta?

---

## Por qué ocurre

ServiceNow implementa un patrón de herencia en Declarative Actions usando el campo `Action Name` como clave de vinculación.

El mecanismo tiene dos capas:

**Capa 1 — Visibilidad (quién controla si la acción aparece)**
La DA en **Global** sobre la tabla padre (`task`) es el punto de registro que el framework UXF usa para exponer la acción en el workspace. Está vinculada a `sys_ux_action_config` vía la tabla M2M `sys_ux_m2m_action_assignment_action_config`. Sin esta DA global, el framework no sabe que la acción existe.

**Capa 2 — Lógica (qué se ejecuta cuando el usuario hace clic)**
La DA en **scope** sobre la tabla hija (`incident`) aporta la lógica específica para esa tabla. El framework la localiza por `Action Name` idéntico y la ejecuta en lugar de la lógica base de la global.

```
Global (task)      →  punto de registro UXF + lógica base
Scoped (incident)  →  override de lógica para incident
                       (mismo Action Name = vinculación)
```

Si la DA scoped no existe, se ejecuta la lógica de la global. Si existe con el mismo `Action Name`, la scoped sobrescribe la lógica de la global para esa tabla específica.

---

## Lo que no funcionó primero

Asumir que el `Action Name` era solo una etiqueta de naming. La coincidencia entre la DA de `task` y la de `incident` parecía convención de nomenclatura, no un mecanismo técnico.

El hallazgo se produjo al cambiar el `Action Name` de la DA de `incident` durante una investigación sobre visibilidad de DAs en workspaces. Al cambiar el nombre, la acción dejó de usar la lógica completa de `incident` y ejecutó solo la lógica mínima de `task`. El `Action Name` no es una etiqueta — es la clave de vinculación.

---

## La solución real: implementar el patrón correctamente

Para crear una DA que use este patrón en tablas propias:

### 1. DA base en Global

Crea una DA mínima en Global sobre la tabla padre (o directamente sobre tu tabla custom si no hay jerarquía).

```
Scope: Global
Table: <tu tabla o tabla padre>
Action Name: <nombre_accion>
Server Script: // lógica base o vacía
```

Esta DA es el punto de registro. El framework la vincula a `sys_ux_action_config` y la expone en el workspace.

### 2. DA de lógica en tu scope

Crea la DA con la lógica real en tu scope, apuntando a tu tabla específica.

```
Scope: <tu scope>
Table: <tu tabla>
Action Name: <nombre_accion>  ← idéntico al de la DA global
Server Script: // lógica completa
```

El `Action Name` idéntico hace que el framework ejecute esta lógica en lugar de la base cuando el registro es de esta tabla.

### 3. Verificar la vinculación

En la DA global, comprueba la related list `M2m Action Assig Ux Action Config`. Debe aparecer vinculada a la `sys_ux_action_config` de tu workspace. Si no aparece automáticamente, revisa que la cadena `sys_ux_page_property → sys_ux_action_config` esté correctamente montada en tu workspace.

---

## Cómo verificar que funciona

1. Con ambas DAs activas: abre un registro de tu tabla en el workspace. La acción debe aparecer y ejecutar la lógica de la DA scoped.
2. Desactiva la DA scoped: la acción debe seguir apareciendo pero ejecutar la lógica base de la global.
3. Desactiva la DA global: la acción debe desaparecer del workspace completamente.

Si el comportamiento es el descrito, el patrón está correctamente implementado.

---

## Casos edge y advertencias

**El patrón escala a múltiples tablas.** Puedes tener una DA global base y tantas DAs scoped como tablas necesites, cada una con su lógica específica y el mismo `Action Name`.

```
Global (task)       →  lógica base
Scoped (incident)   →  lógica para incident
Scoped (problem)    →  lógica para problem
Scoped (change)     →  lógica para change
```

Mismo botón en el workspace, comportamiento diferente según la tabla del registro. Sin condiciones adicionales, sin scripts de routing.

**`Action Exclusion List`.** La DA global puede tener exclusiones explícitas por tabla — tablas donde la acción no debe aparecer aunque hereden de `task`. Esto se gestiona en la related list `Action Exclusion List` del registro global. ServiceNow la usa en `assign_to_me` para excluir tablas como `universal_request` o `pm_project`.

**Sin DA global, la scoped no es suficiente.** Si solo existe la DA scoped sin su equivalente global con el mismo `Action Name`, la acción no aparece en el workspace. La global es el punto de registro — no es opcional en este patrón.

---

## Referencia OOTB: assign_to_me

El ejemplo más claro del patrón en producción:

| | DA Global | DA ITSM Workspace |
|---|---|---|
| **Scope** | Global | ITSM Workspace |
| **Tabla** | task | incident |
| **Action Name** | assign_to_me | assign_to_me |
| **Lógica** | `current.assigned_to = gs.getUserID(); current.update();` | Validaciones completas de grupo, permisos y casos edge |
| **Workspace** | — (ninguno) | Agent Workspace |
| **M2m UX Action Config** | Sí (2 configs vinculadas) | No |

La DA de `task` es mínima a propósito — su función es el registro, no la lógica. La DA de `incident` contiene toda la lógica real porque es donde ocurre la ejecución en producción.

---

## Versiones de ServiceNow afectadas

Confirmado en **Zurich**. El patrón existe al menos desde Washington DC según la estructura OOTB analizada, aunque pendiente de verificación formal en versiones anteriores.

---

## Tablas involucradas

| Tabla | Rol |
|---|---|
| `sys_declarative_action_assignment` | Definición de la DA |
| `sys_ux_action_config` | Configuración de acciones del workspace |
| `sys_ux_m2m_action_assignment_action_config` | Vinculación M2M entre DAs y UX Action Config |
| `sys_workspace_declarative_action_exclusion` | Exclusiones por tabla de la DA global |
