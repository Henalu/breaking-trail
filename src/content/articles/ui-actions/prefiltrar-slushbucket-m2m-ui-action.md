---
title: "Cómo prefiltrar el Slushbucket de una related list M2M en ServiceNow"
description: "Aprende a prefiltrar el Slushbucket de cualquier related list M2M en ServiceNow sobrescribiendo la UI Action nativa con sysparm_query."
categoria: ui-actions
tags:
  - slushbucket
  - m2m
  - ui-action
  - sys_m2m_template
  - script-include
  - related-list
fecha: 2026-03-05
dificultad: intermedio
servicenow_version:
  - "Vancouver"
  - "Washington"
  - "Xanadu"
resuelto: true
---

## El problema

Tienes una related list M2M en un formulario. El botón **Edit...** abre el Slushbucket estándar (`sys_m2m_template.do`) y en la columna de la izquierda aparecen **todos los registros de la tabla de colección** — sin ningún filtro.

En producción esto puede significar miles de usuarios, CIs o cualquier otro registro, cuando lo que necesitas es restringir esa lista según el contexto: el rol del usuario que opera, el grupo al que pertenece, el estado del registro actual, o cualquier otra condición de negocio.

No existe ningún parámetro de configuración nativo en la related list ni en el diccionario para controlar qué muestra ese Slushbucket. La solución no está documentada oficialmente.

---

## Por qué ocurre

El botón **Edit...** de las related list M2M está implementado como una UI Action global con `Action name: sysverb_edit_m2m`. Su script construye una URI y redirige a `sys_m2m_template.do`.

La clave está en ese template: acepta un parámetro `sysparm_query` que actúa como **encoded query sobre la tabla de colección** del Slushbucket. Si la UI Action nativa no lo establece (o lo deja vacío), el template muestra todos los registros sin filtrar.

```
[Edit...] → sysverb_edit_m2m → sys_m2m_template.do?sysparm_query=...
                                                              ↑
                                              Aquí está el punto de control
```

---

## Lo que no funcionó primero

Lo primero que se intenta es buscar alguna propiedad de configuración en la related list, en el dictionary entry de la relación M2M, o en los Business Rules de la tabla. Ninguno de esos caminos lleva a ningún sitio para este caso.

También es tentador añadir un Client Script o un `onChange` para manipular el Slushbucket una vez abierto. El problema: `sys_m2m_template.do` se carga en una ventana separada, fuera del contexto del formulario original. No hay forma de inyectarle lógica desde el formulario padre de manera limpia.

La solución tiene que estar **antes** de que el template se cargue, en la construcción de la URI.

---

## La solución

El patrón tiene tres pasos:

1. **Copiar la UI Action global** `sysverb_edit_m2m` a tu tabla M2M específica (no modificar la global).
2. **Inyectar `sysparm_query`** en la URI antes de la redirección.
3. **Centralizar la lógica de filtrado** en un Script Include para mantenerlo desacoplado y testeable.

### Paso 1 — Copiar la UI Action a tu tabla

Navega a **System UI > UI Actions** y busca la UI Action con estos valores:

| Campo | Valor |
|---|---|
| Name | `Edit...` |
| Table | `Global` |
| Action name | `sysverb_edit_m2m` |

Ábrela y usa **Insert and Stay** para crear una copia. En la copia, cambia el campo **Table** a tu tabla M2M (por ejemplo, `sys_user_has_skill`, `cmdb_rel_ci`, o la que corresponda). Guarda.

> **Por qué no modificar la global:** La UI Action global aplica a *todas* las tablas M2M del sistema. Modificarla afectaría comportamientos en lugares que no controlas. Siempre trabaja con una copia específica de tabla.

### Paso 2 — Script de la UI Action

Este es el script que va en tu copia. Sustituye `TU_TABLA_M2M` por el nombre real de tu tabla:

```javascript
var uri = action.getGlideURI();
var path = uri.getFileFromPath();
uri.set('sysparm_m2m_ref', current.getTableName());
uri.set('sysparm_stack', 'no');

if (current.getTableName() == 'TU_TABLA_M2M') {
    var filterSI = new TuScriptInclude();
    var query = filterSI.getFilterQuery(gs.getUserID());
    uri.set('sysparm_query', query);
} else {
    uri.set('sysparm_query', '');
}

action.setRedirectURL(uri.toString('sys_m2m_template.do'));
```

La lógica de qué filtrar no vive aquí. La UI Action solo construye la URI. El Script Include decide el qualifier.

### Paso 3 — Script Include con lógica de filtrado

Este es el Script Include que centraliza qué usuarios (o registros) mostrar. En este ejemplo, filtra por pertenencia a un grupo cuyo `sys_id` se lee desde una **System Property** — más mantenible que hardcodear el ID.

```javascript
var MiFiltroBucket = Class.create();
MiFiltroBucket.prototype = Object.extendsObject(AbstractAjaxProcessor, {

    /**
     * Devuelve un encoded query listo para usar en sysparm_query.
     * Aplica sobre la tabla de colección del Slushbucket.
     *
     * @param {string} userId - sys_id del usuario que ejecuta la acción
     * @returns {string} encoded query o 'sys_idISEMPTY' si no hay resultados
     */
    getFilterQuery: function(userId) {
        var user = gs.getUser();

        // Opción A: filtrar por rol
        if (user.hasRole('admin')) {
            return 'active=true';
        }

        // Opción B: filtrar por pertenencia a grupo
        // El sys_id del grupo se lee desde una System Property
        var groupId = gs.getProperty('mi_app.filter_group_sys_id', '');
        if (!groupId) {
            // Si la property no está configurada, fallback seguro
            return 'active=true';
        }

        return this._getMembersQuery(groupId);
    },

    /**
     * Construye un qualifier 'sys_idIN...' con los miembros activos del grupo.
     * Devuelve 'sys_idISEMPTY' si el grupo está vacío o sin miembros activos.
     */
    _getMembersQuery: function(groupId) {
        var userIds = [];
        var seen = {};

        // 1. Recuperar todos los miembros del grupo
        var gm = new GlideRecord('sys_user_grmember');
        gm.addQuery('group', groupId);
        gm.query();
        while (gm.next()) {
            var uid = gm.getValue('user');
            if (uid && !seen[uid]) {
                seen[uid] = true;
                userIds.push(uid);
            }
        }

        if (userIds.length === 0) return 'sys_idISEMPTY';

        // 2. Filtrar solo los activos
        var activeIds = [];
        var usr = new GlideRecord('sys_user');
        usr.addQuery('sys_id', 'IN', userIds.join(','));
        usr.addQuery('active', true);
        usr.query();
        while (usr.next()) {
            activeIds.push(usr.getUniqueValue());
        }

        if (activeIds.length === 0) return 'sys_idISEMPTY';

        // 3. Devolver qualifier listo para sysparm_query
        return 'sys_idIN' + activeIds.join(',');
    },

    type: 'MiFiltroBucket'
});
```

**System Property a crear:**

| Campo | Valor |
|---|---|
| Name | `mi_app.filter_group_sys_id` |
| Value | `sys_id del grupo deseado` |
| Type | `string` |

---

## Referencia: valores útiles de `sysparm_query`

| Valor | Comportamiento en el Slushbucket |
|---|---|
| `` (vacío) | Sin filtro — muestra todos los registros |
| `active=true` | Solo registros activos |
| `sys_idIN<id1>,<id2>,...` | Restringe a un conjunto específico de registros |
| `sys_idISEMPTY` | Columna izquierda vacía — ningún registro disponible |
| Cualquier encoded query válido de la tabla | Funciona como filtro estándar |

El parámetro `sysparm_query` se aplica sobre la **tabla referenciada por la relación M2M** — en el caso de `sys_user_has_skill`, esa tabla es `sys_user`. Para otras tablas M2M, identifica qué tabla es la de colección y construye el qualifier sobre ella.

---

## Cómo verificar que funciona

1. Abre el formulario que contiene la related list M2M.
2. Pulsa **Edit...**.
3. La columna izquierda del Slushbucket debe mostrar únicamente los registros que satisfacen el qualifier inyectado.
4. Cambia de usuario (o de rol en una sesión de impersonation) y verifica que la columna cambia según la lógica implementada.

Para depurar, añade temporalmente un `gs.log()` en el Script Include antes del `return`:

```javascript
gs.log('MiFiltroBucket query: ' + query, 'MiFiltroBucket');
```

Revisa el log en **System Log > All** filtrando por source `MiFiltroBucket`.

---

## Casos edge y advertencias

**La UI Action aplica a toda la tabla, no a un registro concreto.** Si en tu instalación hay otros contextos donde se usa el Edit... de la misma tabla M2M y no deben filtrarse, añade condiciones adicionales en la UI Action antes de inyectar el query (por ejemplo, comprobando `current.getValue('algún_campo')`).

**El Script Include puede devolver un qualifier muy largo.** Si el grupo tiene cientos de miembros, el string `sys_idIN<ids>` puede crecer hasta superar los límites de longitud de URL en algunos navegadores o proxies. En ese caso, considera invertir la lógica: filtrar por exclusión, o usar un qualifier basado en un campo del usuario en lugar de una lista de IDs.

**`sys_idISEMPTY` es un fallback de seguridad.** Si el grupo está vacío o todos sus miembros están inactivos, devolver este qualifier garantiza que la columna izquierda aparezca vacía en lugar de mostrar todos los registros. Es el comportamiento correcto cuando la fuente de datos no devuelve resultados válidos.

**No modifiques la UI Action global.** Si por error la modificas y el sistema empieza a comportarse de forma inesperada en otras related lists M2M, revierte tus cambios y trabaja siempre con la copia específica de tabla.

---

## El patrón es genérico

Este mismo mecanismo aplica a cualquier related list M2M en ServiceNow. Los pasos son idénticos independientemente de la tabla:

1. Identificar la tabla M2M objetivo (`sys_user_has_skill`, `cmdb_rel_ci`, `task_ci`, etc.)
2. Copiar `sysverb_edit_m2m` global a esa tabla específica
3. Inyectar `sysparm_query` con el qualifier apropiado
4. Centralizar la lógica de filtrado en un Script Include

La lógica puede ser tan simple como un encoded query estático o tan compleja como una consulta multi-tabla con lógica de roles. El mecanismo de inyección es siempre el mismo.

---

## Versiones de ServiceNow afectadas

Patrón verificado en producción en **Vancouver** y **Washington**. La UI Action `sysverb_edit_m2m` y el template `sys_m2m_template.do` existen sin cambios relevantes desde versiones anteriores. Compatible con **Xanadu**.
