---
title: "Rebalanceo automático de tareas cuando se reduce la capacidad de un agente en AWA"
description: "Cómo implementar una Business Rule que desasigne tareas automáticamente cuando la capacidad máxima de un agente baja, usando work item size override por puntos."
categoria: awa
tags: [awa, business-rule, capacidad, rebalanceo, work-item-size, glide-record]
fecha: 2026-03-04
dificultad: avanzado
servicenow_version: [Xanadu, Zurich, Yokohama]
resuelto: true
---

## El problema

Un agente tiene asignadas varias tareas a través de AWA. Su capacidad máxima se reduce — ya sea manualmente por un supervisor, por una regla de negocio, o porque su turno cambia. El agente queda sobrecapacitado: su carga actual supera su nuevo límite.

AWA no reacciona ante este cambio. No desasigna nada, no redistribuye. Las tareas siguen asignadas al agente aunque ya no tenga capacidad para atenderlas según la configuración del canal. El resultado es un agente técnicamente sobrecargado que AWA no volverá a considerar para nuevas asignaciones hasta que su carga baje por sí sola.

---

## Por qué ocurre

AWA calcula la capacidad disponible de un agente en el momento de asignar trabajo. Cuando hay una nueva tarea en cola, comprueba si el agente tiene hueco y asigna. Pero no ejecuta esa comprobación en sentido inverso: si la capacidad del agente baja después de que el trabajo ya fue asignado, AWA no revisa las asignaciones existentes.

El trigger correcto es la tabla `awa_agent_capacity`, que registra la capacidad máxima y la carga aplicada de cada agente. Una Business Rule sobre esa tabla, filtrando cambios en `max_capacity` o `applied_max_capacity`, permite reaccionar en el momento exacto en que se produce la reducción.

### El papel del work item size

Por defecto, AWA trata cada tarea como una unidad de carga equivalente al `default_work_item_size` configurado en el Service Channel. Esto funciona cuando todas las tareas tienen el mismo peso relativo.

Cuando las tareas tienen pesos distintos — porque su complejidad, duración o prioridad varía — puedes usar el **work item size override** en `awa_work_item` para asignar un tamaño específico a cada tarea. En ese caso, la carga real del agente no es simplemente "número de tareas", sino la suma de los tamaños individuales de cada una.

Si tu implementación usa este mecanismo, necesitas un campo en tu tabla de tareas que almacene ese peso — en este artículo lo llamamos `work_points`. El algoritmo de rebalanceo usa ese campo para calcular exactamente cuánta carga hay que liberar.

---

## Lo que no funcionó primero

El primer enfoque fue una condición en la BR que comprobara directamente si `current.workload > current.max_capacity`. El problema: `workload` es un campo calculado que puede no estar actualizado en el momento exacto en que dispara la BR. En algunos casos la comparación devolvía falso aunque el agente estuviera sobrecapacitado, y la BR no hacía nada.

La solución fue calcular la carga real manualmente en el script, iterando sobre las tareas activas del agente y sumando sus puntos. Es más costoso, pero fiable.

---

## La solución real

Una Business Rule sobre `awa_agent_capacity` que calcula la carga real del agente, la compara con la nueva capacidad máxima, y desasigna tareas empezando por las menos urgentes hasta que la carga queda dentro del límite.

**Configuración de la Business Rule:**

| Campo | Valor |
|-------|-------|
| Table | `awa_agent_capacity` |
| When | after |
| Update | true |
| Filter condition | `max_capacity CHANGES OR applied_max_capacity CHANGES` |

**Script:**

```javascript
(function executeRule(current, previous) {

    // Si la capacidad no bajó, no hay nada que rebalancear
    if (current.max_capacity >= previous.max_capacity ||
        current.max_capacity >= current.workload) {
        return;
    }

    var max = parseFloat(current.max_capacity);
    var cargaActual = 0;
    var tareas = [];

    // Calcular la carga real iterando sobre las tareas activas del agente.
    // Sustituye 'x_your_table' por la tabla configurada en tu Service Channel.
    // Sustituye 'work_points' por el campo que almacena el peso de cada tarea,
    // o usa una constante si todas las tareas tienen el mismo peso.
    var grWork = new GlideRecord('x_your_table');
    grWork.addEncodedQuery('active=true^assigned_to=' + current.user);
    grWork.orderByDesc('expected_start'); // Ver sección "Criterio de desasignación"
    grWork.query();

    while (grWork.next()) {
        var puntos = parseFloat(grWork.work_points || 0);
        cargaActual += puntos;
        tareas.push({
            sys_id: grWork.sys_id.toString(),
            puntos: puntos
        });
    }

    // Si la carga real ya está dentro del límite, no hacer nada
    if (cargaActual <= max) {
        return;
    }

    // Desasignar tareas hasta que la carga quede dentro del nuevo límite
    var acumulado = cargaActual;

    for (var i = 0; i < tareas.length; i++) {
        if (acumulado <= max) break;

        var grTask = new GlideRecord('x_your_table');
        if (grTask.get(tareas[i].sys_id)) {
            grTask.assigned_to = '';
            grTask.update();
            acumulado -= tareas[i].puntos;
        }
    }

})(current, previous);
```

---

## Criterio de desasignación

El script ordena las tareas por `expected_start` descendente — desasigna primero las que tienen fecha de inicio más lejana, es decir, las menos urgentes. Es una decisión de negocio, no una restricción técnica. Las alternativas más comunes:

| Criterio | Orden | Cuándo usarlo |
|----------|-------|---------------|
| Menos urgentes primero | `orderByDesc('expected_start')` | Priorizar tareas con fecha más próxima |
| Más recientes primero | `orderByDesc('sys_created_on')` | LIFO — desasignar lo último asignado |
| Menos prioritarias primero | `orderBy('priority')` | Si tienes un campo de prioridad numérica |
| Más pesadas primero | Ordenar array por `puntos` desc | Liberar carga máxima con menos desasignaciones |

Elige el criterio que mejor refleje la lógica de negocio de tu canal. El mecanismo de desasignación es el mismo en todos los casos — solo cambia el `orderBy` antes del `query()`.

---

## Cómo verificar que funciona

1. Asigna varias tareas a un agente via AWA con pesos distintos (si usas `work_points`)
2. Confirma que la suma de pesos supera el límite que vas a establecer
3. Reduce `max_capacity` del agente en `awa_agent_capacity`
4. Verifica que las tareas con fecha más futura han quedado con `assigned_to` vacío
5. Verifica que la suma de `work_points` de las tareas que quedan asignadas está dentro del nuevo límite

Si ninguna tarea se desasigna, revisa si `current.max_capacity >= previous.max_capacity` está evaluando correctamente — es la condición de salida temprana del script.

---

## Casos edge y advertencias

**Tareas sin `work_points`** — si el campo está vacío o es nulo, el script lo trata como 0. Esa tarea no contribuye a la carga calculada y nunca se desasignará. Si tienes tareas sin peso definido, decide si deben tener un valor por defecto y gestiona ese caso explícitamente.

**Carga calculada vs carga de AWA** — el script calcula la carga sumando los puntos de tu tabla. AWA calcula la carga usando `awa_work_item`. Si las dos tablas no están perfectamente sincronizadas, puede haber diferencias. El script puede considerar que el agente está en límite cuando AWA todavía no, o viceversa.

**Ejecución concurrente** — si varios agentes reducen capacidad simultáneamente, cada BR se ejecuta de forma independiente. No hay problema de concurrencia en la lógica, pero el volumen de updates puede ser alto en escenarios masivos.

**La condición `current.max_capacity >= current.workload`** — usa el campo `workload` de `awa_agent_capacity`, que es la carga que AWA tiene registrada. Si confías en ese campo, esta condición de salida temprana es suficiente. Si no, elimínala y deja que el script calcule la carga real siempre.

---

## Versiones de ServiceNow afectadas

Probado y funcionando en:

| Versión | Estado |
|---------|--------|
| Yokohama | ✅ Funciona |
| Zurich | ✅ Funciona |
| Xanadu | ✅ Funciona |
