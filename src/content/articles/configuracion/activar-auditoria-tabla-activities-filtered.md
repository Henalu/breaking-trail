---
title: "Activar auditoría en una tabla y visualizarla desde el formulario"
description: "Cómo habilitar la trazabilidad de cambios en una tabla de ServiceNow y mostrarlos con Activities (filtered) en el formulario, sin depender solo de sysaudit."
categoria: configuracion
tags: [auditoria, sysaudit, sys_dictionary, activities, formulario, trazabilidad]
fecha: 2026-03-27
dificultad: basico
servicenow_version: [Utah, Vancouver, Xanadu, Zurich]
resuelto: true
---

## El problema

Necesitas que los cambios sobre registros de una tabla concreta queden trazados de forma fiable y sean consultables desde el propio formulario, sin obligar al usuario a ir manualmente a tablas técnicas del sistema.

Activar la auditoría "por detrás" es la parte técnica. Pero si el usuario tiene que ir a `sysaudit` o ejecutar consultas para ver el historial, la solución es incompleta desde el punto de vista funcional.

---

## Por qué ocurre

La auditoría en ServiceNow opera en dos capas que conviene diferenciar bien:

**Capa técnica — `sysaudit`**
Cuando se marca el campo `Audit` en la definición de una tabla, ServiceNow empieza a registrar cada modificación de campo en la tabla `sysaudit`. Por cada cambio guarda qué campo fue modificado, cuál era el valor anterior y cuál es el nuevo.

**Capa visual — Activities (filtered)**
`sysaudit` guarda la traza de forma persistente y fiable, pero no la presenta de forma contextual al usuario. Para eso existe el elemento `Activities (filtered)` en el Form Layout: muestra en el stream del formulario los cambios de los campos que se configuren, de forma clara y legible.

Las dos capas son complementarias. Una sin la otra da una solución incompleta.

---

## Lo que no funcionó primero

El primer intento fue buscar la tabla en `sys_db_object` para activar la auditoría. Tiene sentido porque esa es la tabla donde se gestionan las definiciones de tablas, pero el campo `Audit` no está ahí directamente expuesto de forma operativa.

El registro que hay que modificar es el de tipo **Collection** en `sys_dictionary`. Cada tabla tiene un registro en `sys_dictionary` con `internal_type = collection` que actúa como cabecera de la definición. Es en ese registro donde aparece el campo `Audit` que activa la trazabilidad.

---

## La solución real

### Paso 1 — Activar la auditoría en la tabla

Navega a `sys_dictionary` y filtra por:

- `Table = [nombre de tu tabla]`
- `Type = collection`

El registro de tipo `collection` es el registro cabecera de la tabla, no una columna concreta. Ábrelo y marca el campo **Audit**.

A partir de ese momento ServiceNow registra los cambios en `sysaudit` para todos los campos de esa tabla.

> **Nota sobre tablas de sistema:** Si lo que necesitas es auditar las eliminaciones en tablas del sistema (tablas técnicas de ServiceNow, no tablas de negocio), la propiedad del sistema `glide.ui.audit_deleted_tables` acepta una lista de tablas separadas por coma. Las tablas incluidas en esa propiedad quedarán auditadas cuando se eliminen registros.

### Paso 2 — Añadir Activities (filtered) al formulario

Entra en un registro de la tabla que acabas de configurar. Abre el **Form Layout** (clic derecho en el header del formulario → `Configure` → `Form Layout`).

En la sección de elementos disponibles localiza **Activities (filtered)** y añádelo al layout del formulario.

### Paso 3 — Configurar qué campos aparecen en el stream

Una vez añadido `Activities (filtered)` al formulario, verás la sección de actividad en el propio registro. Abre su configuración (el icono de ajustes dentro de ese bloque) y selecciona los campos cuyos cambios quieres que sean visibles en el stream.

No tiene sentido mostrar todos los campos: elige los que son relevantes para el seguimiento funcional del registro.

---

## Cómo verificar que funciona

1. Modifica uno de los campos configurados en un registro de la tabla
2. Guarda el registro
3. Baja hasta la sección de Activities en el formulario

Deberías ver una entrada con:
- quién hizo el cambio
- cuándo
- qué campo cambió
- el valor anterior y el nuevo

Para confirmar que la capa técnica también funciona, navega a `sysaudit` y busca registros donde `tablename = [tu tabla]`. Deberías encontrar la misma modificación registrada ahí.

---

## Casos edge y advertencias

**Los cambios anteriores a activar el campo `Audit` no quedan registrados.** La auditoría solo captura lo que ocurre a partir del momento en que se habilita. No hay forma de reconstruir el historial previo desde `sysaudit`.

**Los campos de tipo `Journal` (como `Work notes` o `Additional comments`) no se auditan por este mecanismo.** Tienen su propio sistema de persistencia y ya son visibles de forma nativa en el stream de actividad.

**Si solo marcas `Audit` pero no añades `Activities (filtered)` al formulario**, la trazabilidad técnica existe en `sysaudit` pero el usuario no verá nada diferente en el formulario. Ambas capas son necesarias para la solución completa.

**El volumen de registros en `sysaudit`** puede crecer rápidamente en tablas con alta frecuencia de modificaciones. En entornos con políticas de retención de datos, revisar cuánto tiempo se conservan los registros de auditoría antes de habilitarlo en tablas muy activas.

---

## Versiones de ServiceNow afectadas

El mecanismo de auditoría mediante `sys_dictionary` y `Activities (filtered)` es estable y lleva presente desde versiones antiguas de la plataforma.

| Versión | Estado |
|---------|--------|
| Zurich | ✅ Funciona |
| Xanadu | ✅ Funciona |
| Vancouver | ✅ Funciona |
| Utah | ✅ Funciona |
