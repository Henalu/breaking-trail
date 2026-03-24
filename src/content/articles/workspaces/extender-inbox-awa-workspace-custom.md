---
title: "Cómo extender el Inbox de AWA en un Workspace personalizado"
description: "El Inbox de AWA no está disponible en UI Builder para workspaces custom. Este artículo explica el workaround para añadirlo y extenderlo con page collections."
categoria: workspaces
tags: [awa, inbox, ui-builder, page-collection, workaround]
fecha: 2026-03-24
dificultad: avanzado
servicenow_version: [Xanadu]
resuelto: true
---

> Este artículo documenta el workaround presentado por **Jan Moser** en su vídeo
> **[ServiceNow - Configurable Workspace - Advanced Work Assignment - Custom Inbox Extension](https://www.youtube.com/watch?v=T4s4rCz5iVw)**.
> Todo el mérito técnico es suyo — aquí solo se aterriza en texto para que sea
> buscable y consultable como referencia en español.
> La serie completa de Jan sobre AWA y Configurable Workspaces está disponible en
> [esta playlist de YouTube](https://www.youtube.com/playlist?list=PLDLTlm2deb9tbyuQ5ul5OIleUWT3EZFKo).

## El problema

Tienes un workspace personalizado creado desde App Engine Studio. Has configurado formularios, listas, el panel contextual lateral, incluso el header. Pero cuando intentas añadir el Inbox de AWA — el componente donde los agentes aceptan o rechazan work items — descubres que no existe ninguna opción nativa en UI Builder para hacerlo.

El Inbox de AWA simplemente no está disponible como componente insertable en un workspace custom. Y sin Inbox, AWA no funciona para tus agentes en ese workspace.

## Por qué ocurre

El Inbox de AWA es un componente encapsulado que ServiceNow gestiona fuera del flujo normal de UI Builder. Las páginas `inbox` e `inbox empty` existen en el Service Operations Workspace como UX Screens con screen collections propias, y no están expuestas como componentes arrastrables en el catálogo de UI Builder.

ServiceNow decidió que el Inbox es suyo y no está pensado para ser replicado o extendido libremente. Esto tiene sentido desde el punto de vista del producto, pero deja sin solución oficial a cualquier equipo que necesite un workspace custom con AWA.

## Lo que no funcionó primero

La intuición natural es buscar en UI Builder algún componente llamado "Inbox" o "AWA Inbox" en el catálogo. No existe.

El segundo intento habitual es intentar copiar una página de Service Operations Workspace dentro de UI Builder. Tampoco funciona directamente: las páginas del workspace de origen apuntan a su propia app configuration y no se trasladan limpiamente.

Intentar duplicar solo las screen collections de Inbox e Inbox Empty tampoco es suficiente — el Inbox seguirá sin aparecer porque falta el chrome toolbar y la page definition propia. Es un proceso de varios pasos que tiene que completarse en su totalidad.

## Prerequisitos antes de empezar

Dos cosas que Jan no menciona en el vídeo pero que la comunidad ha identificado como bloqueantes reales:

**SNUtils instalado.** Esta extensión de navegador facilita enormemente la edición de campos y la búsqueda de `sys_id`s en el backend. Sin ella el proceso es muy lento pero funciona.

**Plugin de CSM instalado en la instancia.** Varios usuarios han reportado que los registros del Service Operations Workspace están protegidos y no se pueden copiar directamente. Los del CSM Workspace sí. El plugin de CSM es gratuito en instancias non-prod y tarda aproximadamente una hora en instalarse.

## La solución: tres fases

El workaround se articula en tres pasos. Ninguno es trivial, pero juntos funcionan de forma estable porque no modificas el componente de Inbox en sí — solo cambias dónde está alojado.

### Fase 1: Añadir el Inbox al workspace custom

Esto requiere trabajar directamente sobre registros UX, fuera de UI Builder.

**1. Duplicar las screen collections del Inbox**

Navega a `Experiences > [tu workspace] > Admin Panel > UX Screens`. Antes de tocar nada, abre también el CSM Workspace en paralelo y localiza sus screen collections para `inbox` e `inbox empty`.

Para la screen collection de **inbox**:

1. Duplica el registro (Insert and Stay) y ponle un nombre identificable, por ejemplo `Inbox Screen Collection`
2. Copia el `sys_id` de la nueva screen collection
3. Abre el UX Screen del original y duplícalo, cambiando el nombre (`Inbox Screen`) y apuntando al `sys_id` de tu nueva collection
4. Haz lo mismo con el App Route (`Inbox Route`)
5. En ambos registros, actualiza el **App Configuration** para que apunte al `sys_id` de tu experiencia (lo encuentras en el admin panel de tu workspace como UX App Config)
6. Duplica también el **Page Definition** y ponle un nombre propio (`Inbox Page`). Copia su `sys_id` y actualiza el campo correspondiente en tu UX Screen

Repite exactamente el mismo proceso para **inbox empty**.

**2. Añadir el botón de Inbox al chrome toolbar**

Sin esto, el Inbox no aparece en la navegación del workspace aunque todo lo anterior esté bien configurado.

Ve a tu experiencia en el admin panel y busca el chrome toolbar. Abre también el chrome toolbar del CSM Workspace. En ese JSON de configuración localiza el objeto correspondiente al Inbox y cópialo al chrome toolbar de tu experiencia.

Después de esto, al refrescar tu workspace deberías ver el icono del Inbox y que funciona correctamente.

### Fase 2: Crear una página de extensión e inyectarla en el Inbox

Con el Inbox funcionando, el siguiente paso es añadir contenido personalizado junto al componente de AWA.

**Crear la página de extensión en UI Builder**

Crea una nueva página en UI Builder para tu workspace, desde cero (sin plantilla). Ponle un nombre identificable, por ejemplo `My Inbox Extension`. Añade los contenedores y componentes que quieras — esta es tu área de trabajo completamente libre.

**Inyectar la extensión en el Inbox**

Aquí está la clave técnica del workaround. El componente `agent-inbox` en el page definition acepta un `slot`. Si pones contenido en ese slot, aparece renderizado junto al Inbox de AWA sin modificar el componente en sí.

Ve al page definition de tu página `inbox` (el que creaste en la Fase 1, no el original). Verás el JSON de composición. Localiza el objeto del `agent-inbox` y añade tu árbol de composición dentro de su slot:

```json
{
  "component": "agent-inbox",
  "id": "agent-inbox",
  "slots": {
    "default": [
      // Aquí va el árbol de composición de tu página de extensión
    ]
  }
}
```

> ⚠️ **El slot es crítico.** Si no está correctamente configurado, el Inbox completo deja de renderizarse. Es el punto de fallo más habitual al editar el page definition.

### Fase 3: Hacer la extensión mantenible con Page Collections

Copiar y pegar JSON en el page definition cada vez que quieras actualizar tu extensión es insostenible. La solución es usar un **Page Collection** como punto de extensión estable.

En lugar de poner componentes directamente en el slot, pon un componente `tabs` que apunte a una Page Collection tuya. Para crear la Page Collection necesitarás un **Controller vacío** — créalo con una definición de tipo `controller` sin lógica, solo para que el sistema tenga el registro que necesita.

Una vez configurado este patrón, **ya no vuelves a tocar el page definition del Inbox**. Solo editas la Page Collection en UI Builder y los cambios se reflejan automáticamente. Esto convierte un workaround frágil en algo mantenible a largo plazo.

Un detalle estético: el componente `tabs` mostrará el nombre de la página como cabecera del tab, y no puede estar vacío. Si no quieres que aparezca texto visible, puedes usar un carácter Unicode como `•` o un símbolo de icono como placeholder.

## Caso de uso real: contador de tiempo en estado de presencia

El vídeo demuestra un ejemplo concreto que ilustra bien el potencial de esta técnica: mostrar al agente cuánto tiempo lleva en su estado de presencia actual (disponible, reunión, descanso...).

La implementación usa dos recursos de la plataforma:

**Record Watcher sobre `awa_agent_presence_history`**

Esta tabla registra cada cambio de estado de presencia del agente. Configura un Record Watcher en tu página de extensión apuntando a esta tabla, filtrando por el usuario en sesión:

```javascript
// Condición del Record Watcher
agent == context.session.user.sysId
```

Cada cambio de estado dispara un evento que tu página puede escuchar.

**Client Script para el contador**

Al recibir el evento del Record Watcher, actualiza `startTime` en el estado del cliente. Un `setInterval` recalcula cada segundo el tiempo transcurrido:

```javascript
// handleCounting — Client Script asociado al evento Page Ready
function handleCounting(state, context) {
  clearInterval(state.intervalId);
  state.startTime = new Date().getTime();

  state.intervalId = setInterval(() => {
    const elapsed = new Date().getTime() - state.startTime;
    const hours   = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);

    state.elapsedTime =
      `${String(hours).padStart(2, '0')}:` +
      `${String(minutes).padStart(2, '0')}:` +
      `${String(seconds).padStart(2, '0')}`;
  }, 1000);
}
```

Conecta el `elapsedTime` del estado a un componente `Highlighted Value` en tu extensión. El resultado es un contador `HH:MM:SS` visible en el Inbox que se reinicia automáticamente cada vez que el agente cambia de estado.

## Otros casos de uso posibles

Esta misma arquitectura permite extensiones más elaboradas:

- **Alerta de capacidad**: detectar cuando un agente pasa a Available sin capacidad suficiente para incidents y mostrar una advertencia antes de que reciba work items
- **Cola manual**: listar los work items pendientes en cola para que el agente pueda tomar uno sin esperar a que AWA se lo ofrezca
- **Métricas personales**: tiempo medio de resolución del día, número de work items completados, tasa de aceptación/rechazo

## Cómo verificar que funciona

1. Abre tu workspace custom y comprueba que el icono del Inbox aparece en la navegación lateral
2. Con un agente activo en AWA, verifica que recibe work items correctamente — la funcionalidad nativa no debe verse afectada
3. Confirma que tu contenido de extensión aparece renderizado junto al componente de AWA
4. Si implementas el contador de presencia, cambia el estado del agente y observa que el contador se reinicia a `00:00:00`
5. Abre la consola del navegador y confirma que el Record Watcher recibe eventos al cambiar de estado

## Casos edge y advertencias

**No está soportado oficialmente por ServiceNow.** Jan lo deja claro en el vídeo: es un workaround avanzado, no un patrón de implementación oficial. Úsalo con pleno conocimiento de causa y documéntalo en tu instancia.

**Riesgo en upgrades.** Las screen collections y page definitions copiadas pueden quedar desincronizadas después de un upgrade de plataforma. Conviene tener un proceso de revisión post-upgrade específico para este componente.

**El slot es el punto de fallo más común.** Si después de editar el page definition el Inbox deja de mostrarse, lo primero que debes revisar es que el slot esté correctamente configurado y que el JSON sea válido.

**Usa siempre la Page Collection como firewall.** Precisamente por el riesgo de tocar el page definition del Inbox, la arquitectura con Page Collection de la Fase 3 es la recomendada. Una vez establecida, no vuelves a editar ese JSON.

**El plugin CSM puede ser necesario.** Si al intentar copiar los registros del SOW obtienes errores de aplicación protegida, instala el plugin de CSM y trabaja desde esos registros en su lugar.

## Versiones de ServiceNow

| Versión | Estado |
|---------|--------|
| Xanadu | ✅ Verificado en el vídeo de Jan Moser |
| Yokohama | ⚠️ No verificado — revisar compatibilidad de screen collections post-upgrade |
| Washington DC | ⚠️ No verificado |
