---
title: "AWA Skill Level no es un ranking: cómo implementar asignación por niveles de skill"
description: "Evaluate Skill Level en AWA actúa como filtro booleano, no como ranking. Cómo construir un motor tiered ADV→INT→BAS con Script Include y Business Rules."
categoria: awa
tags: ["awa", "skills", "skill-level", "assignment-engine", "script-include", "business-rules"]
fecha: 2026-03-06
dificultad: avanzado
servicenow_version: ["Washington", "Xanadu", "Yokohama"]
resuelto: true
---

# AWA Skill Level no es un ranking: cómo implementar asignación por niveles de skill

## El problema

Advanced Work Assignment incluye dos opciones en las Assignment Rules relacionadas con competencias: **Enable Skills** y **Evaluate Skill Level**. La expectativa natural al activarlas es:

- Definir skills con niveles (básico, intermedio, avanzado)
- Que AWA evalúe esos niveles para determinar qué agente es más adecuado
- Que el sistema priorice agentes con mayor nivel antes de recurrir a los de nivel inferior

En producción, ese comportamiento no existe. La evaluación de skills en AWA funciona como un **filtro booleano**, no como un ranking dinámico:

- El agente tiene o no tiene el skill requerido
- Opcionalmente, tiene o no tiene un nivel concreto de ese skill

No hay comparación entre niveles para decidir qué agente es más adecuado. El sistema verifica si se cumple la condición, pero no calcula prioridades entre agentes según su nivel de habilidad.

## Por qué ocurre

AWA está diseñado para enrutar trabajo a grupos y agentes que cumplen requisitos mínimos, no para implementar lógicas de selección complejas dentro de esos requisitos. La evaluación de skill level es una condición de elegibilidad — "este agente puede recibir este trabajo" — no un criterio de ordenación entre elegibles.

Es una limitación de diseño, no un bug. El motor no fue concebido para resolver el problema de "entre todos los agentes elegibles, ¿cuál tiene mayor competencia?".

## Lo que no funcionó primero

### Primer intento: grupos por nivel con Assignment Eligibility

La idea era crear un grupo por nivel de skill y usar la funcionalidad de **tiempos de elegibilidad** de AWA para escalar progresivamente:

- **Segundo 0:** intentar asignar al grupo de nivel avanzado
- **Minuto 5:** si no se asignó, intentar con el grupo intermedio
- **Minuto 10:** finalmente intentar con el grupo básico

Funcionaba en concepto, pero generaba un problema estructural serio: **proliferación de grupos**. Cada combinación de skill + nivel requería su propio grupo, con sus propias relaciones de membership. En una operación con múltiples skills y niveles, el número de grupos crecía de forma inmanejable y el mantenimiento se volvía insostenible.

Además, el modelo dependía de los tiempos de espera de AWA para el escalado, lo que introducía latencia artificial en la asignación — agentes del nivel inferior podían estar disponibles desde el primer segundo, pero el sistema tardaba minutos en llegar a ellos.

## La solución: un único grupo resolutor con motor tiered

La arquitectura correcta invierte la responsabilidad:

1. **AWA hace lo que sabe hacer bien**: enrutar al grupo resolutor único
2. **Un motor propio hace lo que AWA no puede**: seleccionar el mejor agente por nivel de skill

Con este modelo, todos los agentes viven en un único grupo. Los skills y sus niveles se mantienen en `sys_user_has_skill` de forma independiente. Cuando AWA intenta la asignación, una Business Rule `before` intercepta el proceso e invoca el motor, que implementa la lógica tiered completa.

### Por qué `before` y no una Scheduled Rule de AWA

Una Scheduled Rule de AWA podría parecer más "nativa", pero nos devuelve al problema de la latencia y la complejidad de configuración. La BR `before` es síncrona, ejecuta en el momento exacto de la asignación, y nos da control total sobre el resultado sin modificar la configuración de AWA.

La condición `!gs.isInteractive()` es crítica: el motor solo debe actuar en asignaciones automáticas, no cuando un supervisor asigna manualmente desde la interfaz.

---

### Script Include: SkillsAssignmentEngine

El núcleo del motor son dos métodos: uno que filtra agentes por skills+niveles usando `GlideAggregate`, y otro que orquesta los tres tiers en cascada.

```javascript
var SkillsAssignmentEngine = Class.create();
SkillsAssignmentEngine.prototype = {

    initialize: function() {
        this.TAG = '[SkillsAssignmentEngine]';
        this.debug = (gs.getProperty('my_app.skills.debug', 'false') + '' === 'true');

        // Cada propiedad contiene una lista CSV de sys_id de skill_level
        // Ejemplo: 'abc123,def456' -> los sys_id de los registros de nivel avanzado
        this.levelsAdvanced    = this._splitCsv(gs.getProperty('my_app.skills.nivel.avanzado', ''));
        this.levelsIntermediate = this._splitCsv(gs.getProperty('my_app.skills.nivel.intermedio', ''));
        this.levelsBasic       = this._splitCsv(gs.getProperty('my_app.skills.nivel.basico', ''));
    },

    // ─────────────────────────────────────────────────────────
    // API pública
    // ─────────────────────────────────────────────────────────

    /**
     * Devuelve el mejor agente disponible evaluando skills en cascada
     * de mayor a menor nivel: ADV → INT → BAS.
     *
     * Lógica por tier:
     *   1. Filtrar agentes que tienen TODAS las skills requeridas (AND)
     *      con skill_level dentro del tier actual
     *   2. Del conjunto resultante, devolver el primero disponible
     *      (presencia + capacidad suficiente)
     *
     * Si ningún tier encuentra candidato elegible, devuelve ''.
     *
     * @param {string[]} requiredSkillIds  - Array de sys_id de skills requeridas
     * @param {number}   requiredPoints    - Capacidad mínima que debe tener el agente
     * @param {string}   availableStateId  - sys_id del estado de presencia "disponible"
     * @returns {string} sys_id del agente seleccionado, o '' si no hay elegible
     */
    pickBestAgentBySkillsTiered: function(requiredSkillIds, requiredPoints, availableStateId) {
        requiredSkillIds = this._unique(requiredSkillIds || []);

        if (!requiredSkillIds.length) {
            this._log('SKIP: no hay skills requeridas.');
            return '';
        }
        if (!availableStateId) {
            this._log('SKIP: availableStateId no configurado.');
            return '';
        }

        var adv = this._unique(this.levelsAdvanced);
        var int = this._unique(this.levelsIntermediate);
        var bas = this._unique(this.levelsBasic);

        // Cada tier es ACUMULATIVO:
        // ADV solo admite niveles avanzados.
        // INT admite avanzado + intermedio (un agente avanzado puede cubrir una necesidad intermedia).
        // BAS admite cualquier nivel configurado.
        var tiers = [
            { name: 'ADV', levels: adv },
            { name: 'INT', levels: this._unique(adv.concat(int)) },
            { name: 'BAS', levels: this._unique(adv.concat(int).concat(bas)) }
        ];

        for (var t = 0; t < tiers.length; t++) {
            var tier = tiers[t];

            if (!tier.levels || !tier.levels.length) {
                this._log('Tier ' + tier.name + ': SKIP (sin niveles configurados).');
                continue;
            }

            // Paso 1: agentes con TODAS las skills en este tier
            var candidates = this._getUsersHavingAllSkillsAtLevels(
                requiredSkillIds,
                tier.levels
            );
            this._log('Tier ' + tier.name + ': ' + candidates.length + ' candidatos.');

            if (!candidates.length) continue;

            // Paso 2: primer candidato con presencia disponible y capacidad suficiente
            for (var i = 0; i < candidates.length; i++) {
                var agent = candidates[i];

                if (!this._isAgentAvailable(agent, availableStateId)) {
                    this._log('Tier ' + tier.name + ' SKIP presencia: ' + agent);
                    continue;
                }

                var capLeft = this._getAgentAvailableCapacity(agent);
                if (capLeft < requiredPoints) {
                    this._log('Tier ' + tier.name + ' SKIP capacidad: ' + agent +
                        ' capLeft=' + capLeft + ' required=' + requiredPoints);
                    continue;
                }

                this._log('Tier ' + tier.name + ' OK: ' + agent +
                    ' capLeft=' + capLeft);
                return agent;
            }

            this._log('Tier ' + tier.name + ': ningún candidato elegible. Siguiente tier...');
        }

        this._log('END: ningún agente elegible en ningún tier.');
        return '';
    },

    // ─────────────────────────────────────────────────────────
    // Métodos internos
    // ─────────────────────────────────────────────────────────

    /**
     * Devuelve usuarios activos que tienen TODAS las skills requeridas (AND),
     * con skill_level IN levelIds, y sys_user_has_skill.active = true.
     *
     * Usa GlideAggregate para contar cuántas de las skills requeridas
     * tiene cada usuario en el tier dado. Solo incluye a los que
     * tienen TODAS (count >= requiredSkillIds.length).
     */
    _getUsersHavingAllSkillsAtLevels: function(requiredSkillIds, levelIds) {
        requiredSkillIds = this._unique(requiredSkillIds || []);
        levelIds = this._unique(levelIds || []);

        if (!requiredSkillIds.length || !levelIds.length) return [];

        var needCount = requiredSkillIds.length;
        var skillsByUser = {}; // { userId: { skillId: true } }

        var gr = new GlideRecord('sys_user_has_skill');
        gr.addQuery('active', true);
        gr.addQuery('user.active', true);
        gr.addQuery('skill', 'IN', requiredSkillIds.join(','));
        gr.addQuery('skill_level', 'IN', levelIds.join(','));
        gr.query();

        while (gr.next()) {
            var u = (gr.getValue('user') || '') + '';
            var s = (gr.getValue('skill') || '') + '';
            if (!u || !s) continue;
            if (!skillsByUser[u]) skillsByUser[u] = {};
            skillsByUser[u][s] = true;
        }

        // Solo usuarios que tienen TODAS las skills requeridas
        var out = [];
        for (var userId in skillsByUser) {
            var cnt = 0;
            for (var skillId in skillsByUser[userId]) cnt++;
            if (cnt >= needCount) out.push(userId);
        }

        this._log('_getUsersHavingAllSkillsAtLevels: ' + out.length + ' usuarios con todas las skills.');
        return out;
    },

    _isAgentAvailable: function(agentId, availableStateId) {
        var ap = new GlideRecord('awa_agent_presence');
        ap.addQuery('agent', agentId);
        ap.addQuery('agent.active', true);
        ap.orderByDesc('sys_updated_on');
        ap.setLimit(1);
        ap.query();
        if (!ap.next()) return false;
        return ((ap.getValue('current_presence_state') || '') + '' === availableStateId);
    },

    _getAgentAvailableCapacity: function(agentId) {
        var ac = new GlideRecord('awa_agent_capacity');
        ac.addQuery('user', agentId);
        ac.orderByDesc('sys_updated_on');
        ac.setLimit(1);
        ac.query();
        if (!ac.next()) return -1;
        return parseFloat(ac.getValue('available_capacity') || '0') || 0;
    },

    _splitCsv: function(raw) {
        raw = (raw || '') + '';
        if (!raw.trim()) return [];
        return raw.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    },

    _unique: function(arr) {
        var seen = {};
        var out = [];
        for (var i = 0; i < arr.length; i++) {
            var v = (arr[i] || '') + '';
            if (!v || seen[v]) continue;
            seen[v] = true;
            out.push(v);
        }
        return out;
    },

    _log: function(msg) {
        if (this.debug) gs.info(this.TAG + ' ' + msg);
    },

    type: 'SkillsAssignmentEngine'
};
```

---

### Business Rule: Skills Tiered Assignment

**Tabla:** tu tabla de work items  
**When:** before / Update  
**Condition:** `!gs.isInteractive()`  
**Filter:** `assigned_to CHANGES FROM (empty)` y `awa_assignment = true`

```javascript
(function executeRule(current, previous) {

    var TAG = '[SkillsTieredAssignmentBR]';
    var debug = (gs.getProperty('my_app.skills.debug', 'false') + '' === 'true');

    function log(msg) {
        if (debug) gs.info(TAG + ' ' + msg);
    }

    log('START wa=' + current.getUniqueValue());

    // ── Guardas ──────────────────────────────────────────────
    var prevAssigned = (previous.getValue('assigned_to') || '') + '';
    var currAssigned = (current.getValue('assigned_to') || '') + '';

    if (prevAssigned) {
        log('SKIP: no es primera asignación.');
        return;
    }
    if (!currAssigned) {
        log('SKIP: assigned_to vacío.');
        return;
    }

    // ── Configuración ─────────────────────────────────────────
    var availableStateId = (gs.getProperty('my_app.awa.presence.available_state', '') || '') + '';
    if (!availableStateId) {
        log('SKIP: propiedad my_app.awa.presence.available_state no configurada.');
        return;
    }

    // ── Obtener skills requeridas ─────────────────────────────
    // Adapta esta lógica a tu modelo de datos:
    // las skills pueden venir del propio work item, de un request relacionado, etc.
    var rawSkills = (current.getValue('skills') || '') + '';
    var requiredSkills = rawSkills.split(',').map(function(s) {
        return s.trim();
    }).filter(Boolean);

    if (!requiredSkills.length) {
        log('END: no hay skills requeridas en el work item.');
        return;
    }

    // ── Obtener work points requeridos ────────────────────────
    var requiredPoints = parseFloat(current.getValue('work_points') || '0') || 0;
    if (requiredPoints < 0) {
        requiredPoints = parseFloat(
            gs.getProperty('my_app.skills.default_work_points', '4')
        ) || 4;
        log('Fallback requiredPoints=' + requiredPoints);
    }

    // ── Invocar el motor ──────────────────────────────────────
    var engine = new SkillsAssignmentEngine();
    var chosen = engine.pickBestAgentBySkillsTiered(
        requiredSkills,
        requiredPoints,
        availableStateId
    );

    // ── Aplicar resultado ─────────────────────────────────────
    if (!chosen) {
        log('END: ningún candidato elegible. Se mantiene assigned_to=' + currAssigned);
        return;
    }

    if (chosen === currAssigned) {
        log('END: el motor confirma el mismo agente propuesto por AWA.');
        return;
    }

    log('OVERRIDE: ' + currAssigned + ' -> ' + chosen);
    current.setValue('assigned_to', chosen);

})(current, previous);
```

---

## Configuración de system properties

El motor lee los niveles de skill desde propiedades del sistema, lo que permite ajustar la configuración sin tocar código:

| Propiedad | Valor | Descripción |
|---|---|---|
| `my_app.skills.nivel.avanzado` | CSV de sys_id | sys_id de los registros de `cmn_skill_level` que corresponden al nivel avanzado |
| `my_app.skills.nivel.intermedio` | CSV de sys_id | sys_id de nivel intermedio |
| `my_app.skills.nivel.basico` | CSV de sys_id | sys_id de nivel básico |
| `my_app.awa.presence.available_state` | sys_id | sys_id del estado de presencia AWA que significa "disponible" |
| `my_app.skills.default_work_points` | `4` | Capacidad por defecto si el work item tiene valor negativo |
| `my_app.skills.debug` | `false` | Activa logs detallados en syslog |

> **Cómo obtener los sys_id de skill_level:** navega a `cmn_skill_level.list` en tu instancia. Los registros de nivel que uses en tu implementación son los que debes referenciar aquí, no sus nombres. Esto hace el motor agnóstico al naming de niveles en cada instancia.

---

## Cómo verificar que funciona

**1. Activa el debug**

```
my_app.skills.debug = true
```

Cada decisión del motor queda registrada en el syslog con el prefijo `[SkillsAssignmentEngine]`. Podrás ver exactamente qué tier se evaluó, cuántos candidatos encontró, y por qué se descartó cada agente.

**2. Escenario de prueba mínimo**

Prepara tres agentes:
- **Agente A:** skill X con nivel básico, disponible, capacidad 10
- **Agente B:** skill X con nivel intermedio, disponible, capacidad 10
- **Agente C:** skill X con nivel avanzado, disponible, capacidad 10

Crea un work item con la skill X requerida. El motor debe seleccionar al agente C (tier ADV). Pon al agente C como no disponible y repite: debe seleccionar al agente B (tier INT). Pon también al B como no disponible: debe seleccionar al agente A (tier BAS).

**3. Verifica el comportamiento AND con múltiples skills**

Agente A: skill X (avanzado) + skill Y (avanzado)  
Agente B: solo skill X (avanzado)

Work item con skills X e Y requeridas. El motor debe seleccionar al agente A. El agente B no debe aparecer como candidato porque no tiene TODAS las skills requeridas.

Este es el comportamiento AND que distingue el motor de una simple búsqueda por skill individual.

## Casos edge y advertencias

**Los tiers son acumulativos por diseño.** En el tier INT, el motor incluye tanto niveles intermedios como avanzados. Esto significa que un agente con nivel avanzado puede atender una necesidad de nivel intermedio. Si en tu organización eso no es deseable, puedes cambiar los tiers para que sean exclusivos (solo los niveles exactos de ese tier).

**Si ningún tier encuentra candidato**, el motor devuelve `''` y la BR mantiene al agente que AWA propuso originalmente. La asignación no se bloquea — el trabajo siempre llega a alguien. Esto es intencional: es mejor una asignación subóptima que un work item sin asignar.

**El orden dentro de un tier no está garantizado** salvo que añadas criterios de ordenación explícitos. Si tienes diez agentes con nivel avanzado y todos están disponibles, el motor devuelve el primero que encuentre en `sys_user_has_skill`. Para añadir un criterio de desempate (por ejemplo, menor carga de trabajo), extiende `pickBestAgentBySkillsTiered` con una ordenación secundaria antes del bucle de presencia/capacidad.

**`sys_user_has_skill.active`** debe estar en `true` para que el agente sea considerado. Si un agente tiene el skill pero la relación está marcada como inactiva (por ejemplo, skill expirado o suspendido temporalmente), el motor lo ignorará correctamente.

**Performance con muchos agentes:** el método `_getUsersHavingAllSkillsAtLevels` hace una consulta a `sys_user_has_skill` por cada tier. Con miles de agentes y docenas de skills, esto puede ser costoso. En ese escenario, considera cachear los resultados del primer tier si los tiers comparten la mayor parte de los candidatos.

## Versiones de ServiceNow afectadas

Solución basada en APIs estándar disponibles en todas las versiones modernas. Probado en **Washington** y **Xanadu**. Compatible con **Yokohama**.

AWA y `awa_agent_presence` / `awa_agent_capacity` están disponibles desde **Orlando**. `sys_user_has_skill` y `cmn_skill_level` son tablas base de la plataforma sin restricción de versión.
