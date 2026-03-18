---
title: "Abrir registros de un campo GlideList desde la lista o el Workspace"
description: "Los campos GlideList no son navegables en listas ni en Workspace. Cómo resolverlo con una UI Action clásica, una Declarative Action y GlideAjax."
categoria: ui-actions
tags: [ui-action, declarative-action, glidelist, workspace, client-script, glideajax]
fecha: 2026-03-18
dificultad: intermedio
servicenow_version: [Xanadu, Zurich]
resuelto: true
---

## El problema

Tienes una tabla con un campo de tipo **GlideList** — por ejemplo, `incident.watch_list`, que almacena una lista de usuarios. En la vista de lista de ServiceNow, ese campo aparece como texto plano: nombres separados por comas, sin ningún enlace. No puedes hacer clic para navegar a ninguno de esos registros.

El mismo problema se repite en el Workspace: aunque el campo puede mostrarse en la vista de lista de un Workspace personalizado, sus valores siguen siendo texto inerte. No hay forma nativa de llegar a los registros referenciados sin abrir cada incidente individualmente, entrar al formulario, y desde ahí intentar acceder al campo.

Si tienes que revisar quién está en la Watch List de varios incidentes a la vez, estás mirando un callejón sin salida.

---

## Por qué ocurre

Un campo `Reference` almacena exactamente un `sys_id` y la plataforma sabe cómo renderizarlo como un enlace en cualquier contexto. Un campo **GlideList** almacena una cadena de texto con múltiples `sys_id` separados por comas — no hay un mecanismo nativo en las vistas de lista para interpretar esa cadena y convertirla en N enlaces navegables.

Esto se agrava en dos dimensiones:

**Desde cliente, el campo no es legible.** Los scripts de cliente (`g_list`, `g_form`) no exponen el valor de un campo GlideList en contexto de lista. La única forma de leer su contenido es desde el servidor.

**Desde una Declarative Action de lista en el Workspace, las APIs de navegación interna no están disponibles.** El objeto `g_aw`, que permite navegar dentro del Workspace (abrir registros en el panel lateral, cambiar de vista), no está accesible en el sandbox donde se ejecutan las Declarative Actions de tipo lista. Es un déficit conocido de la plataforma.

---

## Lo que no funcionó primero

**Leer el campo desde el cliente directamente:**

```javascript
// ❌ No funciona — g_list no expone valores de campos GlideList
var watchList = g_list.getCell(g_list.getChecked(), 'watch_list');
```

Devuelve vacío o undefined. El valor de un GlideList solo existe en el servidor.

**Usar `g_aw` en la Declarative Action del Workspace para abrir registros:**

```javascript
// ❌ No funciona — g_aw no está disponible en DAs de lista
g_aw.openRecord('sys_user', userId);
```

El sandbox de las Declarative Actions de lista no incluye este objeto. La llamada falla silenciosamente.

**Usar `location.href` en un bucle para abrir varios registros:**

```javascript
// ❌ Solo abre el último — cada iteración sobreescribe la anterior
for (var i = 0; i < sysIds.length; i++) {
    location.href = 'sys_user.do?sys_id=' + sysIds[i];
}
```

`location.href` navega la ventana actual. En un bucle, cada iteración cancela la navegación anterior antes de completarse. Solo llega a ejecutarse la última.

---

## La solución real

Tres piezas que se combinan: un **Script Include** que lee el GlideList desde el servidor, una **Declarative Action** para el Workspace, y una **UI Action clásica** para la UI clásica. Ambas acciones comparten el mismo Script Include vía GlideAjax y abren el resultado con `top.open()`.

### 1. Script Include: `GlideListOpener`

Crea un nuevo Script Include con estos valores:

| Campo | Valor |
|-------|-------|
| Name | `GlideListOpener` |
| API Name | `GlideListOpener` |
| Client callable | `true` |
| Accessible from | All application scopes |

```javascript
var GlideListOpener = Class.create();
GlideListOpener.prototype = Object.extendsObject(AbstractAjaxProcessor, {

    /**
     * Recibe una lista de sys_id de registros, lee el campo GlideList
     * indicado en cada uno y devuelve los sys_id únicos de los registros
     * referenciados, sin duplicados.
     *
     * Parámetros esperados:
     *   sysparm_table   — tabla que contiene el campo GlideList (ej: 'incident')
     *   sysparm_field   — nombre del campo GlideList (ej: 'watch_list')
     *   sysparm_records — sys_id de los registros seleccionados, separados por coma
     */
    getReferencedSysIds: function() {
        var tableName  = this.getParameter('sysparm_table');
        var fieldName  = this.getParameter('sysparm_field');
        var recordIds  = this.getParameter('sysparm_records');

        if (!tableName || !fieldName || !recordIds) return '';

        var ids = recordIds.split(',');
        var collected = {};

        for (var i = 0; i < ids.length; i++) {
            var sysId = ids[i].trim();
            if (!sysId) continue;

            var gr = new GlideRecord(tableName);
            if (!gr.get(sysId)) continue;

            var raw = gr.getValue(fieldName); // cadena de sys_id separados por coma
            if (!raw) continue;

            var parts = raw.split(',');
            for (var j = 0; j < parts.length; j++) {
                var ref = parts[j].trim();
                if (ref) collected[ref] = true;
            }
        }

        return Object.keys(collected).join(',');
    },

    type: 'GlideListOpener'
});
```

El método elimina duplicados porque un mismo usuario puede aparecer en la Watch List de varios incidentes seleccionados. Devolver sys_ids únicos evita abrir el mismo registro dos veces.

---

### 2. UI Action clásica

Crea una nueva UI Action con estos valores:

| Campo | Valor |
|-------|-------|
| Table | `Incident [incident]` |
| Name | Open Watch List |
| Action name | `openWatchList` |
| Client | `true` |
| List choice | `true` |
| Condition | *(vacío — visible para todos)* |
| Onclick | `openWatchList()` |

```javascript
function openWatchList() {
    var checkedIds = g_list.getChecked();

    if (!checkedIds) {
        alert('Selecciona al menos un registro antes de ejecutar esta acción.');
        return;
    }

    var ga = new GlideAjax('GlideListOpener');
    ga.addParam('sysparm_name', 'getReferencedSysIds');
    ga.addParam('sysparm_table', 'incident');
    ga.addParam('sysparm_field', 'watch_list');
    ga.addParam('sysparm_records', checkedIds);

    ga.getXMLAnswer(function(answer) {
        if (!answer) {
            alert('Los registros seleccionados no tienen ningún usuario en la Watch List.');
            return;
        }
        var url = 'sys_user_list.do?sysparm_query=sys_idIN' + answer;
        top.open(url, '_blank');
    });
}
```

`top.open()` abre la URL en una nueva pestaña del navegador desde el frame raíz de la aplicación, que es el único mecanismo que funciona de forma fiable desde el iframe donde corren los scripts de lista.

---

### 3. Declarative Action para el Workspace

Para que la misma funcionalidad esté disponible en el Workspace, crea una Declarative Action en **`sys_declarative_action_assignment`**:

| Campo | Valor |
|-------|-------|
| Label | Open Watch List |
| Table | `Incident [incident]` |
| Action type | Client Script |
| View type | List |
| Order | 200 |

El script de la Declarative Action es prácticamente idéntico al de la UI Action, pero sin el wrapper de función (el script se ejecuta directamente al dispararse la acción):

```javascript
var checkedIds = g_list.getChecked();

if (!checkedIds) {
    alert('Selecciona al menos un registro antes de ejecutar esta acción.');
    return;
}

var ga = new GlideAjax('GlideListOpener');
ga.addParam('sysparm_name', 'getReferencedSysIds');
ga.addParam('sysparm_table', 'incident');
ga.addParam('sysparm_field', 'watch_list');
ga.addParam('sysparm_records', checkedIds);

ga.getXMLAnswer(function(answer) {
    if (!answer) {
        alert('Los registros seleccionados no tienen ningún usuario en la Watch List.');
        return;
    }
    var url = 'sys_user_list.do?sysparm_query=sys_idIN' + answer;
    top.open(url, '_blank');
});
```

> **Nota sobre scoped apps:** Si los artefactos viven dentro de una aplicación con scope propio (no global), la llamada GlideAjax debe incluir el prefijo de scope explícito: `new GlideAjax('mi_scope.GlideListOpener')`. Sin él, la llamada no produce error visible pero tampoco ejecuta.

---

## Cómo verificar que funciona

**En UI clásica:**

1. Navega a la lista de incidentes (`incident_list.do`)
2. Asegúrate de que al menos un incidente tiene usuarios en el campo Watch List
3. Marca uno o varios registros con el checkbox
4. Abre el desplegable de acciones de lista (junto a "Export") y ejecuta "Open Watch List"
5. Debe abrirse una nueva pestaña con la lista de usuarios (`sys_user_list.do`) filtrada por `sys_idIN{...}`
6. Verifica que los usuarios mostrados coinciden exactamente con los de la Watch List de los incidentes seleccionados

**En el Workspace:**

1. Abre un Workspace que incluya la lista de incidentes
2. Selecciona uno o varios registros
3. Busca "Open Watch List" en las acciones de lista disponibles
4. Comprueba que se abre la misma vista de usuarios filtrada

**Para probar el caso vacío:** selecciona un incidente sin usuarios en la Watch List y ejecuta la acción. Debe aparecer el mensaje informativo y no abrirse ninguna pestaña.

---

## Casos edge y advertencias

**El bloqueador de popups del navegador puede interceptar `top.open()`** si el usuario no ha interactuado directamente con el botón antes de que llegue la respuesta GlideAjax. Algunos navegadores permiten popups solo si la apertura ocurre en el mismo stack de llamada que el evento de usuario. Si tu organización tiene bloqueadores de popup activos, la pestaña puede no abrirse aunque el script funcione correctamente. En ese caso, considera mostrar la URL en un modal y pedir al usuario que la abra manualmente.

**Adaptación a otros campos GlideList:** el Script Include es genérico. Solo necesitas cambiar `sysparm_table`, `sysparm_field` y la URL destino en los scripts cliente para reutilizarlo en cualquier otra tabla y campo. El campo `problem.watch_list` o `change_request.watch_list` funcionan exactamente igual que `incident.watch_list`.

**El resultado abre una lista, no los registros individuales.** Se optó por esta aproximación deliberadamente: abrir N pestañas (una por usuario referenciado) tiene el mismo problema de `location.href` en bucle y satura al usuario si hay muchos. Una lista filtrada por `sys_idIN` es más manejable y permite aplicar filtros adicionales desde ahí.

**`g_aw` no está disponible en Declarative Actions de lista.** Si intentas usar `g_aw.openRecord()` o cualquier API de navegación del Workspace dentro del script de la Declarative Action, fallará. Este es un comportamiento conocido de la plataforma (confirmado por ServiceNow Support). `top.open()` es el único mecanismo fiable para este contexto.

---

## Versiones de ServiceNow afectadas

| Versión | Estado |
|---------|--------|
| Zurich | ✅ Funciona |
| Xanadu | ✅ Funciona |

El comportamiento de GlideList en contexto de lista es consistente desde versiones anteriores. La indisponibilidad de `g_aw` en Declarative Actions de lista también se reproduce en las mismas versiones — no se conoce fecha de resolución por parte de ServiceNow.
