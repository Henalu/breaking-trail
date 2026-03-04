---
title: "Reasignación automática cuando un agente se desconecta en AWA"
description: "Cómo implementar una Business Rule que reasigne work items al canal AWA cuando un agente pasa a estado offline, sin intervención manual."
categoria: awa
tags: [awa, business-rule, agente, offline, reasignacion, glide-record]
fecha: 2026-03-04
dificultad: intermedio
servicenow_version: [Xanadu, Zurich, Yokohama]
resuelto: true
---

## El problema

Un agente está trabajando en AWA con work items asignados. En mitad de la jornada pasa a estado offline — cierra sesión, pierde conectividad, o su presencia cambia manualmente. Los work items que tenía asignados quedan bloqueados: siguen apareciendo como asignados a ese agente, AWA no los redistribuye, y el canal pierde capacidad efectiva hasta que alguien interviene manualmente.

ServiceNow no reasigna automáticamente los work items cuando un agente pasa a offline. Ese comportamiento hay que construirlo.

---

## Por qué ocurre

AWA gestiona la asignación de trabajo, pero no monitoriza activamente el estado de presencia de los agentes para reaccionar ante cambios. Cuando `awa_agent_presence` registra que un agente ha pasado a offline, el motor de AWA no lanza ningún proceso de redistribución por sí solo.

Los work items en tabla `awa_work_item` siguen en estado `accepted` con el agente asignado. Desde el punto de vista de AWA, ese agente sigue siendo el propietario del trabajo — simplemente está "ocupado". El resultado es trabajo parado sin que nadie lo procese.

El trigger correcto para atacar este problema es la tabla `awa_agent_presence`, que registra cada cambio de estado de presencia de los agentes. Una Business Rule sobre esa tabla, filtrando el cambio de estado activo a offline, es el punto de entrada adecuado.

---

## Lo que no funcionó primero

El primer intento fue usar una Business Rule sobre `awa_work_item` directamente, buscando items en estado `accepted` cuando el agente cambia de estado. El problema es que `awa_work_item` no tiene visibilidad directa del cambio de presencia del agente — hay que cruzar dos tablas y el timing no es fiable en una BR síncrona.

El segundo intento fue usar un Scheduled Job que revisara periódicamente agentes offline con work items asignados. Funciona, pero introduce un delay de varios minutos entre que el agente se desconecta y que el trabajo se redistribuye. En canales con SLA ajustados, ese delay es inaceptable.

La BR sobre `awa_agent_presence` con trigger `after update` resuelve ambos problemas: reacciona en el momento exacto del cambio de presencia y tiene acceso directo al agente que acaba de desconectarse.

---

## La solución real

Una Business Rule sobre `awa_agent_presence` que se dispara cuando el agente pasa de estado activo a offline. Vacía el `assigned_to` de los work items activos asignados a ese agente y pone los `awa_work_item` correspondientes en estado `queued` para que AWA los redistribuya.

**Configuración de la Business Rule:**

| Campo | Valor |
|-------|-------|
| Table | `awa_agent_presence` |
| When | after |
| Update | true |
| Filter condition | `current_presence_state CHANGES FROM [activo] TO [offline]` |

Los sys_id de los estados de presencia varían entre instancias. Consúltalos en tu instancia filtrando la tabla `awa_agent_presence_state`.

**Script:**

```javascript
(function executeRule(current, previous) {

    var agent = current.agent;

    // Sustituye 'x_your_table' por la tabla configurada en tu Service Channel de AWA.
    // Encuéntrala en: AWA > Service Channels > [tu canal] > campo "Table".
    // Habitualmente es una tabla custom que extiende de task o case.
    var grWork = new GlideRecord('x_your_table');
    grWork.addEncodedQuery('assigned_to=' + agent + '^active=true^stateIN-5,1');
    grWork.orderByDesc('sys_created_on');
    grWork.query();

    while (grWork.next()) {

        // Vaciar el asignado — el work item vuelve al pool
        grWork.setValue('assigned_to', '');
        grWork.update();

        // Actualizar el awa_work_item asociado para que AWA recalcule capacidad
        var grAWI = new GlideRecord('awa_work_item');
        grAWI.addEncodedQuery(
            'document_id=' + grWork.getUniqueValue() +
            '^assigned_to=' + agent +
            '^state=accepted' +
            '^rejected=false'
        );
        grAWI.orderByDesc('sys_created_on');
        grAWI.setLimit(100);
        grAWI.query();

        while (grAWI.next()) {
            grAWI.setValue('state', 'queued');
            grAWI.setValue('assigned_to', '');
            grAWI.setValue('assignment_group', '');
            grAWI.update();
        }
    }

})(current, previous);
```

**Por qué se actualiza `awa_work_item` además del work item propio:**

Vaciar `assigned_to` en tu tabla de work items libera el registro visualmente, pero AWA sigue contabilizando ese trabajo como carga del agente hasta que el `awa_work_item` asociado cambia de estado. Si no actualizas `awa_work_item` a `queued`, la capacidad del agente no se libera correctamente y AWA puede rechazar nuevas asignaciones a otros agentes por considerar que el canal está lleno.

---

## Cómo verificar que funciona

1. Asigna manualmente un work item a un agente via AWA
2. Confirma que `awa_work_item` tiene un registro en estado `accepted` para ese agente
3. Cambia el estado de presencia del agente a offline desde `awa_agent_presence`
4. Verifica que el `assigned_to` del work item ha quedado vacío
5. Verifica que el `awa_work_item` asociado ha pasado a estado `queued`
6. Comprueba en el log (`gs.info`) que la BR se ha ejecutado si añadiste trazas

Si los work items no se liberan, revisa los sys_id del filtro de presencia — es el punto de fallo más habitual.

---

## Casos edge y advertencias

**Work items asignados manualmente** — esta BR no distingue entre work items asignados por AWA y los asignados manualmente por un supervisor. Si en tu implementación existen asignaciones manuales que deben preservarse aunque el agente esté offline, necesitas añadir un campo flag que identifique el origen de la asignación y filtrar en consecuencia.

**Agentes que se reconectan rápidamente** — si un agente pierde conectividad brevemente y reconecta en segundos, la BR ya habrá vaciado sus asignaciones. No hay rollback automático: AWA reasignará el trabajo según disponibilidad en ese momento, que puede ser a otro agente. Evalúa si esto es aceptable en tu caso de uso.

**Volumen alto de work items por agente** — el bucle actualiza un registro por iteración. Con agentes que tienen decenas de work items activos, el tiempo de ejecución puede ser notable. Si tu caso de uso implica volúmenes altos, considera mover la lógica a un script en background con `GlideRecord` en modo batch o usar `executeNow` con un Scheduled Script.

**El filtro `stateIN-5,1`** — los valores de estado son específicos de la tabla que uses en tu Service Channel. Ajusta el filtro a los estados que en tu implementación representan trabajo activo pendiente de completar.

---

## Versiones de ServiceNow afectadas

Probado y funcionando en:

| Versión | Estado |
|---------|--------|
| Yokohama | ✅ Funciona |
| Zurich | ✅ Funciona |
| Xanadu | ✅ Funciona |
