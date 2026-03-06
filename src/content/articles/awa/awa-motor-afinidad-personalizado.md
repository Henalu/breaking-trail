---
title: "Cuando AWA Affinity no es suficiente: construye tu propio motor de afinidad"
description: "AWA tiene afinidad nativa pero no siempre refleja tu lógica de negocio. Cómo construir un motor propio con Script Include y Business Rules."
categoria: awa
tags: ["awa", "affinity", "assignment-engine", "script-include", "business-rules", "glideaggregate"]
fecha: 2026-03-06
dificultad: avanzado
servicenow_version: ["Washington", "Xanadu", "Yokohama"]
resuelto: true
---

# Cuando AWA Affinity no es suficiente: construye tu propio motor de afinidad

## El problema

Advanced Work Assignment (AWA) incluye funcionalidad nativa de afinidad: la idea es que el sistema priorice agentes que ya tienen historial con un cliente o entidad concreta, reduciendo el tiempo de resolución y mejorando la experiencia.

En producción, sin embargo, hay escenarios donde la afinidad nativa de AWA no refleja la lógica de negocio real. Por ejemplo:

- La afinidad nativa no considera campos personalizados de tu tabla de trabajo
- El criterio de "afinidad" en tu organización va más allá de lo que AWA puede configurar por defecto
- Necesitas combinar afinidad con otros criterios (capacidad, skills, presencia) en una secuencia específica

El resultado es que el sistema asigna trabajo a agentes sin tener en cuenta quién tiene más contexto real sobre ese cliente o caso — exactamente lo contrario de lo que se espera.

## Por qué ocurre

AWA es un motor genérico. Su configuración de afinidad está diseñada para cubrir el caso común, pero no expone todos los parámetros que una implementación compleja necesita. Cuando tu lógica de asignación depende de campos de tablas custom, de ventanas temporales específicas, o de criterios compuestos, el motor nativo se queda corto sin que haya ningún error visible: simplemente no asigna como esperas.

El problema no es un bug. Es una limitación de diseño que requiere una solución propia.

## Lo que no funcionó primero

Intentar configurar la afinidad nativa de AWA modificando sus parámetros estándar. El motor tiene en cuenta la afinidad, pero en presencia de otros factores (carga del agente, orden de la cola, reglas de skill) el peso de la afinidad no era suficiente para garantizar la priorización esperada.

El comportamiento era no determinista desde la perspectiva del negocio: a veces asignaba al agente "correcto", a veces no. Imposible de auditar y difícil de justificar ante el cliente.

## La solución: un motor propio con Script Include + Business Rule

La arquitectura es sencilla y mantenible:

1. Un **Script Include** encapsula toda la lógica del motor (cálculo de afinidad, ranking)
2. Una **Business Rule** `before` se ejecuta en el momento de la asignación e invoca el motor
3. Si el motor encuentra un candidato mejor, sobrescribe `assigned_to` antes de que el registro se guarde

### Por qué `before` y no `async`

La BR debe ser `before` porque necesitamos modificar el registro en vuelo, antes de que se persista. Una BR `async` llega tarde: el registro ya está guardado con el agente incorrecto y tendríamos que hacer un update posterior, lo que genera un segundo evento y posibles loops.

La condición `!gs.isInteractive()` es igualmente importante: solo queremos que el motor actúe cuando la asignación viene de AWA u otro proceso automático, no cuando un agente o supervisor asigna manualmente desde la interfaz.

---

### Script Include: AffinityAssignmentEngine

```javascript
var AffinityAssignmentEngine = Class.create();
AffinityAssignmentEngine.prototype = {

    initialize: function() {
        this.TAG = '[AffinityAssignmentEngine]';
        this.debug = (gs.getProperty('my_app.affinity.debug', 'false') + '' === 'true');
        // Ventana de historial configurable por propiedad (días)
        this.historyDays = parseInt(
            gs.getProperty('my_app.affinity.history_days', '30')
        ) || 30;
    },

    /**
     * Calcula cuántos registros ha gestionado cada candidato
     * para una entidad concreta (clientId) en la ventana de historial.
     *
     * @param {string}   targetTable  - Tabla donde viven los registros de trabajo
     * @param {string}   affinityField - Campo que identifica la entidad (ej: 'u_client', 'company')
     * @param {string}   affinityValue - Valor de la entidad (sys_id)
     * @param {string[]} candidates   - Array de sys_id de agentes a evaluar
     * @returns {Object} Mapa { agentSysId: count }
     */
    computeAffinityCount: function(targetTable, affinityField, affinityValue, candidates) {
        var map = {};
        for (var i = 0; i < candidates.length; i++) {
            map[candidates[i]] = 0;
        }

        if (!affinityValue || !candidates.length) return map;

        // Calculamos la fecha de inicio de la ventana
        var daysMs = this.historyDays * 24 * 60 * 60 * 1000;
        var since = new GlideDateTime();
        since.setNumericValue(gs.now().getNumericValue() - daysMs);

        var ga = new GlideAggregate(targetTable);
        ga.addQuery('sys_created_on', '>=', since);
        ga.addQuery('assigned_to', 'IN', candidates.join(','));
        ga.addQuery('assigned_to', 'ISNOTEMPTY', '');
        ga.addQuery(affinityField, affinityValue);
        ga.addAggregate('COUNT');
        ga.groupBy('assigned_to');
        ga.query();

        while (ga.next()) {
            var agentId = (ga.getValue('assigned_to') || '') + '';
            var cnt = parseInt(ga.getAggregate('COUNT'), 10) || 0;
            if (agentId) map[agentId] = cnt;
        }

        this._log('computeAffinityCount: ' + JSON.stringify(map));
        return map;
    },

    /**
     * Ordena candidatos por afinidad DESC.
     * Desempate: sys_id ASC (determinista).
     *
     * @param {string[]} candidates
     * @param {Object}   affinityMap  - Resultado de computeAffinityCount
     * @returns {string[]} Candidatos ordenados
     */
    rankByAffinity: function(candidates, affinityMap) {
        var ranked = candidates.slice(0);
        ranked.sort(function(a, b) {
            var ca = affinityMap[a] || 0;
            var cb = affinityMap[b] || 0;
            if (cb !== ca) return cb - ca;
            // Desempate determinista: evita asignaciones aleatorias
            return (a > b) ? 1 : (a < b) ? -1 : 0;
        });
        this._log('rankByAffinity: ' + ranked.join(','));
        return ranked;
    },

    /**
     * Devuelve el mejor agente por afinidad dado un conjunto de candidatos.
     * Combina computeAffinityCount + rankByAffinity.
     *
     * @param {string}   targetTable
     * @param {string}   affinityField
     * @param {string}   affinityValue
     * @param {string[]} candidates
     * @returns {string} sys_id del mejor agente, o '' si no hay candidatos
     */
    pickBestByAffinity: function(targetTable, affinityField, affinityValue, candidates) {
        if (!candidates || !candidates.length) return '';

        var affinityMap = this.computeAffinityCount(
            targetTable, affinityField, affinityValue, candidates
        );
        var ranked = this.rankByAffinity(candidates, affinityMap);

        // El primero del ranking es el mejor candidato
        // Si todos tienen 0 asignaciones previas, devuelve el primero (orden determinista)
        return ranked[0] || '';
    },

    _log: function(msg) {
        if (this.debug) gs.info(this.TAG + ' ' + msg);
    },

    type: 'AffinityAssignmentEngine'
};
```

---

### Business Rule: Affinity Override

**Tabla:** tu tabla de work items  
**When:** before / Update  
**Condition:** `!gs.isInteractive()`  
**Filter:** `assigned_to CHANGES FROM (empty)`  

```javascript
(function executeRule(current, previous) {

    var TAG = '[AffinityOverrideBR]';
    var debug = (gs.getProperty('my_app.affinity.debug', 'false') + '' === 'true');

    function log(msg) {
        if (debug) gs.info(TAG + ' ' + msg);
    }

    // ── Guardas ──────────────────────────────────────────────
    // Solo primera asignación: de vacío a con valor
    var prevAssigned = (previous.getValue('assigned_to') || '') + '';
    var currAssigned = (current.getValue('assigned_to') || '') + '';

    if (prevAssigned) {
        log('SKIP: reasignación, no primera asignación.');
        return;
    }
    if (!currAssigned) {
        log('SKIP: assigned_to vacío.');
        return;
    }

    // ── Resolver el valor de afinidad ─────────────────────────
    // Adapta este campo a tu modelo de datos
    var affinityValue = (current.getValue('u_client') || '') + '';
    if (!affinityValue) {
        log('SKIP: no hay valor de afinidad (u_client vacío).');
        return;
    }

    // ── Obtener candidatos disponibles ────────────────────────
    // En producción aquí integrarías tu lógica de presence/capacity
    // Para el ejemplo usamos solo el agente que AWA ya propuso
    // más cualquier otro que quieras evaluar
    var candidates = [currAssigned];
    // Si tienes más candidatos (del grupo de asignación, por ejemplo):
    // candidates = getGroupMembers(current.getValue('assignment_group'));

    // ── Invocar el motor ──────────────────────────────────────
    var engine = new AffinityAssignmentEngine();
    var bestAgent = engine.pickBestByAffinity(
        current.getTableName(), // tabla actual
        'u_client',             // campo de afinidad
        affinityValue,          // valor (sys_id del cliente)
        candidates
    );

    if (!bestAgent || bestAgent === currAssigned) {
        log('END: no hay mejor candidato o ya es el correcto.');
        return;
    }

    // ── Aplicar override ──────────────────────────────────────
    log('OVERRIDE: ' + currAssigned + ' -> ' + bestAgent);
    current.setValue('assigned_to', bestAgent);

})(current, previous);
```

---

## Cómo verificar que funciona

**1. Activa el modo debug**

Crea o edita la system property `my_app.affinity.debug = true`. Verás en el log de sistema (`syslog`) todas las decisiones del motor con el prefijo `[AffinityAssignmentEngine]`.

**2. Prepara un escenario de prueba controlado**

- Agente A: 5 registros gestionados para el cliente X en los últimos 30 días
- Agente B: 0 registros para el cliente X
- Ambos disponibles y con capacidad

Crea un nuevo work item para el cliente X. El motor debe asignar al agente A.

**3. Verifica el historial de asignación**

Revisa el campo `assigned_to` antes y después de que se ejecute la BR. Si tienes work notes implementadas, el motor puede escribir la razón de la reasignación automáticamente (útil para auditoría).

**4. Comprueba el caso de empate**

Con dos agentes con el mismo historial, el desempate debe ser siempre el mismo agente (el de menor sys_id). Esto confirma que el comportamiento es determinista.

## Casos edge y advertencias

**Si todos los candidatos tienen 0 historial**, el motor devuelve el primero del array (orden determinista por sys_id). No se bloquea la asignación — simplemente no aporta valor de afinidad. Esto es correcto: es mejor asignar que no asignar.

**Ventana de historial demasiado corta**: si configuras `my_app.affinity.history_days` con un valor bajo (ej: 7 días), el motor puede no encontrar historial en períodos de baja actividad. Ajusta según el volumen de tu operación.

**El motor solo es tan bueno como el conjunto de candidatos que le pasas.** En el ejemplo simplificado pasamos solo al agente que AWA propone. En producción querrás pasarle todos los miembros disponibles del grupo de asignación, filtrados previamente por presencia y capacidad. La combinación con otros criterios es responsabilidad de la Business Rule orquestadora, no del motor de afinidad.

**Cuidado con `setWorkflow(false)`** si escribes work notes desde la BR `before`: en ese contexto ya estás dentro de la transacción del registro actual. Para escribir notas en registros relacionados (padre, request...) usa `setWorkflow(false)` en ese GlideRecord, no en `current`.

**Performance**: `GlideAggregate` es eficiente para conteos, pero si el volumen de registros históricos es muy alto (millones de filas) y no tienes índices en `assigned_to` + el campo de afinidad, puede impactar el tiempo de respuesta de la BR. Monitoriza los tiempos en producción.

## Versiones de ServiceNow afectadas

La solución usa APIs estándar (`GlideAggregate`, `GlideRecord`, `GlideDateTime`, System Properties) disponibles en todas las versiones modernas. Probado en **Washington** y **Xanadu**. Compatible con **Yokohama**.

AWA está disponible desde **Orlando** — versiones anteriores no aplican.
