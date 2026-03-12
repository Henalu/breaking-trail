---
title: "Cómo configurar las listas del panel lateral en un Workspace de ServiceNow"
description: "Cómo configurar las listas del panel lateral en Workspaces de ServiceNow: tablas sys_ux_list, categorías, filtros y applicability paso a paso."
categoria: workspaces
tags:
  - workspaces
  - ux-list
  - list-menu
  - configuracion
  - sys_ux_list
fecha: 2026-03-11
dificultad: intermedio
servicenow_version:
  - "Vancouver"
  - "Washington DC"
  - "Xanadu"
resuelto: true
---

## El problema

Quieres añadir o modificar una lista en el panel lateral de un Workspace —por ejemplo, añadir una vista "Alta Prioridad" bajo la sección Tasks— y no encuentras dónde configurarlo.

No está en el Workspace record. No está en UI Builder. No está en List Layout.

Buscas en los sitios obvios y no aparece nada.

## Por qué ocurre

Las listas del panel lateral de un Workspace no se configuran donde uno esperaría. Están gestionadas por un conjunto de tablas UX internas específicas (`sys_ux_*`) que no aparecen en los menús habituales de configuración.

La lógica está fragmentada en cuatro tablas relacionadas jerárquicamente, lo que hace que sea difícil de encontrar si no sabes exactamente dónde mirar.

## Lo que no funcionó primero

- Buscar en el Workspace record → no hay ninguna sección de listas
- Intentar configurarlo desde UI Builder → las listas del panel no son componentes UX editables desde ahí
- Buscar en List Layout → eso controla los campos visibles en la lista, no qué listas aparecen en el menú

## La solución real

### Estructura de tablas involucradas

La jerarquía de configuración es la siguiente:

```
sys_ux_list_menu_config        ← Contenedor principal (1 por Workspace)
  └── sys_ux_list_category     ← Secciones del menú (Tasks, Requests, My Work...)
        └── sys_ux_list        ← Listas concretas con tabla, query y ordenación
              └── _sys_ux_applicability_m2m_list_list  ← Audiencias que pueden ver cada lista
```

**`sys_ux_list_menu_config` — UX List Menu Configuration**
Define el contenedor de menú de listas asociado a un Workspace concreto. Es el punto de entrada de toda la configuración.

**`sys_ux_list_category` — UX List Category**
Representa las secciones del menú lateral. Ejemplos típicos:
- Tasks
- Requests
- My Work

**`sys_ux_list` — UX Lists**
Aquí se define cada lista individual:
- Tabla origen (`task`, `incident`, `sc_req_item`...)
- Encoded query / filtro
- Ordenación
- Campos de visualización

**`sys_ux_applicability_m2m_list_list` — List Applicability**
Controla qué audiencias o roles ven cada lista. Si una lista no aparece para un usuario, el problema casi siempre está aquí.

### Ejemplo completo

Objetivo: tener esto en el panel lateral del Workspace:

```
Tasks
  └── Open
  └── Assigned to me
  └── High Priority
```

**Paso 1 — Localiza el UX List Menu Configuration del Workspace**

Navega a `sys_ux_list_menu_config` y filtra por el Workspace que estás configurando.

**Paso 2 — Crea o reutiliza la categoría**

En `sys_ux_list_category`, crea una entrada:
```
Name: Tasks
List Menu Config: [el que encontraste en el paso 1]
```

**Paso 3 — Crea las listas dentro de esa categoría**

En `sys_ux_list`, crea una entrada por cada lista:

| Lista | Tabla | Encoded Query |
|---|---|---|
| Open | `task` | `state=open` |
| Assigned to me | `task` | `assigned_to=javascript:gs.getUserID()` |
| High Priority | `task` | `priority=1` |

Para cada una, asigna la categoría creada en el paso 2.

**Paso 4 — Configura la applicability**

En `sys_ux_applicability_m2m_list`, crea una entrada por lista indicando qué audiencia puede verla:

```
List: [la lista que creaste]
Audience: [la audiencia del Workspace]
```

Si no configuras este paso, la lista no aparecerá para ningún usuario aunque esté correctamente definida.

## Cómo verificar que funciona

1. Abre el Workspace en el navegador
2. Mira el panel lateral — la nueva sección o lista debe aparecer
3. Si no aparece: revisa `sys_ux_applicability_m2m_list` primero (es la causa más frecuente)
4. Fuerza un hard refresh (`Ctrl+Shift+R`) para descartar caché de UI

## Casos edge y advertencias

**La lista aparece en algunos usuarios pero no en otros**
Revisa `sys_ux_applicability_m2m_list`. La audience asignada puede no incluir a todos los usuarios esperados. Verifica los roles que componen esa audience.

**Cambios que no se reflejan inmediatamente**
Las listas del Workspace tienen caché. Si modificas una configuración existente y no ves el cambio, espera unos minutos o fuerza refresh. En instancias de desarrollo, puedes limpiar la caché desde `cache.do`.

## Versiones de ServiceNow afectadas

Esta arquitectura de tablas `sys_ux_*` está presente desde **Vancouver** en adelante. En versiones anteriores (San Diego, Tokyo) la estructura puede variar ligeramente.

Probado en: Vancouver, Washington DC, Xanadu.
