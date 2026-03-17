---
title: "Experience Restricted y Dynamic Evaluation en Declarative Actions: el callejón sin salida en workspaces custom"
description: "Dynamic Evaluation no funciona en workspaces custom. Experience Restricted rompe la visibilidad de la acción. La solución real es validar en el Server Script."
categoria: workspaces
tags: ["declarative-actions", "workspace", "experience-restricted", "dynamic-evaluation", "next-experience", "list-actions"]
fecha: 2026-03-17
dificultad: avanzado
servicenow_version: ["Utah", "Vancouver", "Washington", "Xanadu"]
resuelto: true
---

## El problema

Tienes una Declarative Action de tipo **List** en un workspace custom. Necesitas que el botón solo esté disponible cuando los registros seleccionados cumplen una condición — por ejemplo, que no estén en un estado concreto. El mecanismo lógico para esto es **Dynamic Evaluation**: evaluar la condición por registro seleccionado en tiempo real.

Lo activas. Introduces una Script Condition. El botón desaparece del workspace. Sin errores, sin logs, sin pistas.

Desactivas `Experience Restricted` y el botón vuelve. Pero entonces `Enable Dynamic Evaluation` queda en read-only — no puedes marcarlo.

Estás atrapado: necesitas `Experience Restricted` para habilitar `Dynamic Evaluation`, pero activarlo rompe la visibilidad de la acción.

---

## Por qué ocurre

El problema tiene dos capas independientes que colisionan.

### Capa 1 — La Script Condition evalúa antes de que exista un registro

La Script Condition de una List Action se ejecuta **en el momento de renderizar la lista**, antes de que el usuario seleccione ningún registro. En ese punto, `current` está vacío.

```javascript
// Esto APARECE — null != '7' es true
current.state != '7'

// Esto DESAPARECE — null == '7' es false
current.state == '7'
```

No es un error de configuración. Es el comportamiento esperado: las condiciones negativas pasan porque `null != valor` siempre es `true`. Las positivas fallan porque `null == valor` siempre es `false`.

Sin `Dynamic Evaluation`, la Script Condition solo se evalúa una vez al cargar la lista — sin acceso a registros individuales.

### Capa 2 — El callejón sin salida del framework

`Enable Dynamic Evaluation` es exactamente el mecanismo que resuelve este problema: evalúa condiciones por registro seleccionado en tiempo real. Pero el framework impone requisitos contradictorios para usarlo:

**Para habilitar el campo** se necesita que `Experience Restricted = true` **y** `Record Selection Required = true` estén marcados simultáneamente. Una UI Policy interna de ServiceNow controla esto — no hay forma de saltarse la restricción.

**Para que la acción sea visible** en un workspace custom se necesita `Experience Restricted = false`. Al activarlo, la acción desaparece del workspace aunque el Action Configuration esté correctamente vinculado.

El resultado es circular: no puedes usar Dynamic Evaluation sin romper la visibilidad.

---

## Lo que no funcionó primero

### Vincular correctamente el Action Configuration

Se verificó que la cadena `sys_ux_page_property → sys_ux_action_config → DA` estuviera correctamente montada (el mismo patrón documentado en [la cadena de configuración UXF](/articulos/workspaces/declarative-actions-visibilidad-workspace)). El Action Configuration estaba vinculado — no cambiaba nada. Con `Experience Restricted = true`, la acción seguía sin aparecer.

### Restricción por vista

Algunos hilos de la comunidad sugieren usar el campo **View** del Action Assignment como alternativa a `Experience Restricted` para limitar la visibilidad a un workspace concreto. Verificado: tampoco resuelve el problema. Con restricción por vista, `Enable Dynamic Evaluation` sigue sin estar disponible de forma operativa.

### Dynamic Record Conditions y Dynamic Script Condition

Se probaron los tres tipos de condición disponibles. Todos producen el mismo resultado: con `Experience Restricted` activo, cualquier condición hace desaparecer la acción.

---

## La solución

Dado que Dynamic Evaluation no es viable en workspaces custom, la validación de estado se desplaza al **Server Script** de la propia acción. Es el patrón que ServiceNow usaba antes de la existencia de Dynamic Evaluation y sigue siendo el más predecible en entornos custom.

### Script Condition: solo permisos

La Script Condition queda reducida a controlar permisos de acceso. Sin condiciones de estado.

```javascript
current.canWrite();
```

El botón aparece siempre que el usuario tenga permisos de escritura sobre la tabla. No depende de `current` apuntando a un registro concreto — `canWrite()` sobre la tabla funciona sin contexto de registro.

### Server Script: validación en el momento de ejecución

Toda la lógica condicional se mueve al Server Script, donde `current` sí apunta al registro real.

```javascript
(function() {
    var estadosBloqueados = ['7', '8'];  // estados donde la acción no debe ejecutarse
    var estadoActual = current.state.toString();

    for (var i = 0; i < estadosBloqueados.length; i++) {
        if (estadoActual == estadosBloqueados[i]) {
            gs.addErrorMessage('Esta acción no puede ejecutarse en el estado actual del registro.');
            return;
        }
    }

    // Lógica de la acción
    current.state = '7';
    current.update();
    gs.addInfoMessage('Acción completada correctamente.');
})();
```

El patrón es simple: valida primero, aborta con mensaje de error si no cumple, ejecuta si cumple.

### Por qué esta solución es correcta

- El botón aparece siempre que hay write access — sin depender de la evaluación de `current` al cargar la lista.
- La validación ocurre en el momento de ejecución, con acceso garantizado al registro real.
- No depende de comportamientos del framework que varían entre releases ni entre tipos de workspace.
- El usuario recibe feedback claro: si hace clic en un registro que no cumple la condición, ve un mensaje de error explícito en lugar de un botón que desaparece sin explicación.

---

## Cómo verificar que funciona

1. Configura la DA con la Script Condition reducida a `current.canWrite()` y la validación de estado en el Server Script.
2. Abre el workspace. El botón debe aparecer en la lista.
3. Selecciona un registro que **cumple** la condición — la acción debe ejecutarse y mostrar el `InfoMessage`.
4. Selecciona un registro que **no cumple** la condición — la acción debe abortar y mostrar el `ErrorMessage`.
5. Verifica con un usuario sin write access sobre la tabla — el botón no debe aparecer.

---

## Casos edge y advertencias

**El botón siempre aparece.** Esta solución implica que el botón es visible incluso para registros donde la acción no aplica. Es una limitación aceptable: el usuario recibe feedback inmediato si intenta ejecutar la acción en un registro no válido. En la práctica, un mensaje de error claro es mejor UX que un botón que aparece y desaparece sin explicación.

**Acciones sobre múltiples registros.** Si la DA opera sobre varios registros seleccionados simultáneamente, el Server Script debe iterar sobre todos y validar cada uno. Los que no cumplan la condición deben reportarse individualmente.

**Workspaces OOB vs. custom.** Dynamic Evaluation funciona de forma fiable en workspaces OOB como Service Operations Workspace o CSM/FSM Workspace, donde el Action Configuration está preconfigurado a nivel de plataforma. La limitación es específica de workspaces custom.

**Es una limitación conocida.** Múltiples hilos de la comunidad de ServiceNow documentan este mismo comportamiento desde las releases Utah y Vancouver, sin solución oficial para workspaces custom.

---

## Versiones de ServiceNow afectadas

| Versión | Comportamiento |
|---------|---------------|
| Utah | Limitación confirmada por comunidad |
| Vancouver | Limitación confirmada por comunidad |
| Washington | Limitación confirmada por comunidad |
| Xanadu | Limitación confirmada en producción |

---

## Tablas involucradas

| Tabla | Rol |
|---|---|
| `sys_declarative_action_assignment` | Definición de la DA |
| `sys_ux_action_config` | Configuración de acciones del workspace |
| `sys_ux_page_property` | Propiedad `actionConfigId` del workspace |
