---
title: "Reasignación automática cuando un agente se desconecta en AWA"
description: "Cómo configurar AWA para que los trabajos asignados a un agente desconectado se redistribuyan automáticamente sin intervención manual."
categoria: awa
tags: ["AWA", "Advanced Work Assignment", "agentes", "disponibilidad", "reasignación"]
fecha: 2026-03-04
dificultad: intermedio
servicenow_version: ["Utah", "Vancouver", "Washington DC"]
resuelto: true
---

## El problema

Un agente cierra sesión o pierde conexión con los canales de mensajería. Los trabajos que tenía asignados quedan bloqueados en estado **Assigned** sin avanzar. El supervisor no recibe alerta y el cliente espera sin respuesta.

En logs de AWA (`awa_work_item`) se ve:

```
work_item.state = "assigned"
work_item.agent = "jdoe"
agent.presence = "offline"
```

El trabajo permanece asignado indefinidamente aunque el agente esté offline.

## Por qué ocurre

AWA no monitoriza la presencia del agente de forma continua una vez que el trabajo está asignado. El motor de asignación solo actúa sobre trabajos en estado `pending` o `queued`. Una vez en `assigned`, el trabajo queda fuera del ciclo de reasignación a menos que se configure explícitamente el **Inactivity timeout**.

## Lo que no funcionó primero

- Activar el campo **"Accept timeout"**: solo afecta al tiempo que el agente tiene para aceptar, no a la sesión activa.
- Crear una Business Rule en `awa_agent_presence` para reasignar al cambiar presencia: genera condición de carrera con el propio motor AWA y puede producir asignaciones duplicadas.

## La solución real

### 1. Configurar el Inactivity Timeout en la cola

En **AWA > Queues**, abrir la cola afectada y configurar:

| Campo | Valor recomendado |
|-------|-------------------|
| Inactivity timeout | `300` (segundos) |
| Inactivity timeout action | `Reassign` |

### 2. Activar la monitorización de presencia en el canal

En **AWA > Channels**, verificar que el canal tiene activado:

```
Reassign on logout: true
Logout timeout: 60 (segundos de gracia antes de considerar al agente offline)
```

### 3. Script de verificación (Background Script)

Para revisar el estado actual de trabajos asignados a agentes offline:

```javascript
var gr = new GlideRecord('awa_work_item');
gr.addQuery('state', 'assigned');
gr.query();

while (gr.next()) {
  var agentId = gr.getValue('agent');
  var presence = new GlideRecord('awa_agent_presence');
  presence.addQuery('agent', agentId);
  presence.addQuery('presence', 'offline');
  presence.query();

  if (presence.next()) {
    gs.info('Work item sin agente activo: ' + gr.getValue('number') +
            ' | Agente: ' + gr.getDisplayValue('agent'));
  }
}
```

## Cómo verificar que funciona

1. Asignar un trabajo de prueba a un agente de test.
2. Forzar que el agente pase a offline (cerrar sesión en el portal del agente).
3. Esperar el tiempo configurado en **Inactivity timeout** (ej. 5 minutos).
4. Verificar en `awa_work_item` que el registro cambió de estado a `queued` y tiene el campo `agent` vacío.
5. Confirmar en el log de AWA que aparece el evento `work_item_reassigned`.

## Casos edge y advertencias

- Si el agente se reconecta antes de que expire el timeout, el trabajo **no** se reasigna. Esto es el comportamiento esperado.
- Con **Inactivity timeout** muy bajo (< 60 s) pueden producirse reasignaciones falsas en conexiones inestables.
- En versiones anteriores a **Utah**, el campo `Reassign on logout` no existe en la UI; debe configurarse vía tabla `awa_channel_config` directamente.
- Si el cliente responde durante el timeout, el temporizador **no** se reinicia automáticamente — verificar la configuración de **Customer response timeout** por separado.

## Versiones de ServiceNow afectadas

| Versión | Comportamiento |
|---------|---------------|
| San Diego y anteriores | `Reassign on logout` no disponible en UI |
| Tokyo | Disponible pero con bug conocido (KB1234567) en canales de chat |
| Utah | Comportamiento estable, configuración completa vía UI |
| Vancouver | Igual que Utah, sin cambios relevantes |
| Washington DC | Añade alerta de supervisor cuando se dispara reasignación |
