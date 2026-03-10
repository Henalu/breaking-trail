---
title: "Carga masiva desde Excel mediante Catalog Item y Flow Designer"
description: "Patrón completo para importar registros desde un Excel adjunto a un Catalog Item, con Transform Map y limpieza automática del attachment."
categoria: integraciones
tags:
  - import-sets
  - transform-map
  - flow-designer
  - catalog-item
  - excel
  - bulk-import
fecha: 2026-03-10
dificultad: avanzado
servicenow_version:
  - "Vancouver"
  - "Washington"
  - "Xanadu"
resuelto: true
---

## El problema

Tienes usuarios de negocio —planners, gestores, responsables de área— que necesitan crear o actualizar registros en masa en ServiceNow. No tienen acceso de administrador. No van a aprender a usar Import Sets manualmente. Y tú no puedes estar ejecutando importaciones manualmente cada vez que alguien cambia datos en un Excel.

La solución obvia sería darles acceso a la Import Set Table directamente, pero eso no es viable en producción. Necesitas un mecanismo que sea:

- Self-service para el usuario
- Completamente automático una vez enviado
- Trazable y auditable
- Sin dependencia de un administrador para ejecutarlo

## Por qué ocurre

ServiceNow no tiene, de forma nativa, un mecanismo sencillo para que un usuario de negocio dispare una importación desde un archivo adjunto. El proceso estándar de Import Sets asume que el archivo llega por SFTP, HTTP, o que un administrador lo carga manualmente en el Data Source.

El truco que hace funcionar este patrón es que **Flow Designer puede mover attachments entre registros**. Esto permite tomar el Excel que el usuario adjunta al Catalog Item, moverlo al Data Source, y disparar la importación desde ahí, todo dentro del mismo Flow.

La arquitectura completa tiene cinco componentes que deben estar coordinados:

```
Catalog Item → Flow Designer → Data Source → Import Set Table → Transform Map
```

Cada pieza tiene una responsabilidad clara y ninguna puede saltarse.

## La solución real

### 1. Catalog Item

El Catalog Item es el punto de entrada del usuario. Su configuración es estándar, pero hay dos detalles críticos:

**La plantilla Excel debe estar adjunta al propio Catalog Item.** No en un artículo de Knowledge, no en un enlace externo. Adjunta al Catalog Item, para que el enlace de descarga sea un `sys_attachment.do?sys_id=...` que siempre apunte a la versión oficial.

El enlace en la descripción HTML tiene esta forma:

```html
<a href="/sys_attachment.do?sys_id=TU_SYS_ID_AQUI&view=true" 
   target="_blank">
  Descargar plantilla Excel
</a>
```

**El control de variable para el adjunto debe ser obligatorio.** Si el usuario envía el formulario sin adjuntar nada, el Flow fallará en el paso 2. Valídalo en el Catalog Item, no en el Flow.

El submit del Catalog Item genera un registro en `sc_req_item`. Ese registro es el que usa el Flow como punto de partida.

---

### 2. Data Source

Crea un Data Source de tipo **File** con formato **Excel**. Este Data Source no necesita tener un archivo configurado de inicio —el Flow se lo proporcionará en cada ejecución.

Anota el `sys_id` del Data Source. Lo necesitarás como input fijo en el Flow.

**Importante:** El Data Source actúa como una ranura temporal. El Flow mete el archivo, ejecuta la importación, y luego lo limpia. En ningún momento deberías tener archivos acumulados aquí.

---

### 3. Import Set Table

Crea una tabla de staging específica para esta importación. Las columnas deben coincidir exactamente con las columnas de tu plantilla Excel.

Ejemplo de estructura mínima:

| Campo en Import Set | Tipo | Corresponde a |
|---|---|---|
| `u_email` | String | Email del registro a crear/actualizar |
| `u_fecha_inicio` | String | Fecha en formato dd/MM/yyyy |
| `u_valor` | Integer | Valor numérico a importar |

Usa tipo String para campos de fecha en la Import Set Table. La conversión y resolución de referencias la harás en los field maps del Transform Map con scripts, donde tienes control total sobre el formato.

---

### 4. Transform Map

El Transform Map conecta la Import Set Table con la tabla destino. Configúralo en modo **Insert or Update** para que maneje tanto creaciones como actualizaciones.

Para campos directos (números, textos simples), el mapeo es trivial. Los field maps interesantes son los que resuelven referencias a partir de valores del Excel.

Los field maps scripted en ServiceNow usan un patrón IIFE asignado a `answer`. La función interna recibe `source` y devuelve el valor resuelto, o deja `ignore = true` para rechazar la fila si no puede resolverlo.

El patrón de logging condicional via system property es opcional pero muy recomendable: activas el debug cuando necesitas trazar una importación problemática y lo desactivas en producción sin tocar código.

**Field map scripted — resolver referencia por email:**

```javascript
answer = (function transformEntry(source) {

  function log(mensaje) {
    if (gs.getProperty('tu_app.debug') == 'true') {
      gs.info('[IMPORT] ' + mensaje);
    }
  }

  var email = source.u_email + '';

  if (!email) {
    log('Email vacío, fila rechazada');
    ignore = true;
    return '';
  }

  var gr = new GlideRecord('sys_user');
  gr.addQuery('email', email);
  gr.setLimit(1);
  gr.query();

  if (gr.next()) {
    log('Usuario resuelto para ' + email + ': ' + gr.getUniqueValue());
    return gr.getUniqueValue();
  }

  log('No se encontró usuario para email: ' + email);
  ignore = true;
  return '';

})(source);
```

**Field map scripted — resolver referencia por fecha:**

```javascript
answer = (function transformEntry(source) {

  function log(mensaje) {
    if (gs.getProperty('tu_app.debug') == 'true') {
      gs.info('[IMPORT] ' + mensaje);
    }
  }

  // La fecha llega como string desde el Excel
  var fechaRaw = source.u_fecha_inicio + '';

  if (!fechaRaw) {
    log('Fecha vacía, fila rechazada');
    ignore = true;
    return '';
  }

  // setValue (no setDisplayValue) asume formato interno YYYY-MM-DD
  // setDisplayValue dependería del locale del usuario que ejecuta el Flow
  var gd = new GlideDate();
  gd.setValue(fechaRaw);
  var fechaNormalizada = gd.getValue();

  log('Buscando período para fecha normalizada: ' + fechaNormalizada);

  // Query ON con gs.dateGenerate para evitar problemas de zona horaria
  // en campos de tipo GlideDate
  var gr = new GlideRecord('tu_tabla_de_periodos');
  gr.addQuery('start_date', 'ON',
    fechaNormalizada +
    '@javascript:gs.dateGenerate(\'' + fechaNormalizada + '\',\'start\')' +
    '@javascript:gs.dateGenerate(\'' + fechaNormalizada + '\',\'end\')'
  );
  gr.setLimit(1);
  gr.query();

  if (gr.next()) {
    log('Período resuelto para ' + fechaNormalizada + ': ' + gr.getUniqueValue());
    return gr.getUniqueValue();
  }

  log('No se encontró período para fecha: ' + fechaNormalizada);
  ignore = true;
  return '';

})(source);
```

El `ignore = true` rechaza esa fila pero deja continuar el resto de la importación. Sin él, un registro problemático podría cortar toda la ejecución. Devolver `''` además de `ignore = true` es redundante funcionalmente, pero hace el código más legible.

---

### 5. Script Include: la lógica de importación

Crea un Script Include que encapsule la lógica de ejecutar el Data Source y lanzar el Transform Map. Esto desacopla la lógica del Flow y la hace reutilizable.

```javascript
var BulkImportHelper = Class.create();
BulkImportHelper.prototype = {
  initialize: function() {},

  importAndTransform: function(dataSourceSysId, transformMapSysId) {

    // Validaciones previas — fallar rápido y con mensaje claro
    if (!dataSourceSysId || !transformMapSysId) {
      return { ok: false, message: 'Missing dataSourceSysId or transformMapSysId' };
    }

    var grDataSource = new GlideRecord('sys_data_source');
    if (!grDataSource.get(dataSourceSysId)) {
      return { ok: false, message: 'Data Source not found: ' + dataSourceSysId };
    }

    // Paso 1: Crear el Import Set y cargar los datos del attachment
    // getImportSetGr crea el registro de Import Set en sys_import_set
    // loadImportSetTable lee el archivo del Data Source y puebla la staging table
    var importSetLoader = new GlideImportSetLoader();
    var grImportSet = importSetLoader.getImportSetGr(grDataSource);
    importSetLoader.loadImportSetTable(grImportSet, grDataSource);

    grImportSet.setValue('state', 'loaded');
    grImportSet.update();

    // Paso 2: Ejecutar el Transform Map de forma síncrona
    // setSyncImport(true) es crítico: sin esto el transform es asíncrono
    // y el Flow puede continuar al paso 5 (Delete Attachment) antes de que
    // la transformación haya terminado de leer el archivo
    var importSetTransformer = new GlideImportSetTransformer();
    importSetTransformer.setImportSetID(grImportSet.getUniqueValue());
    importSetTransformer.setMapID(transformMapSysId);
    importSetTransformer.setSyncImport(true);
    importSetTransformer.transformAllMaps(grImportSet);

    return {
      ok: true,
      import_set_sys_id: grImportSet.getUniqueValue()
    };
  },

  type: 'BulkImportHelper'
};
```

---

### 6. Flow Action personalizada

Crea una Flow Action que llame al Script Include. Esta es la pieza que conecta Flow Designer con la lógica de importación.

**Inputs de la acción:**
- `dataSourceSysid` — String
- `transformMapSysid` — String

**Outputs:**
- `import_set_sys_id` — String

**Script:**

```javascript
(function execute(inputs, outputs) {

  var importHelper = new BulkImportHelper();
  var result = importHelper.importAndTransform(
    inputs.dataSourceSysid, 
    inputs.transformMapSysid
  );

  outputs.import_set_sys_id = result.import_set_sys_id;

})(inputs, outputs);
```

---

### 7. El Flow

Con todos los componentes anteriores en su sitio, el Flow es sorprendentemente simple. Cinco pasos:

**Paso 1 — Look Up Data Source**
Busca el registro del Data Source por su `sys_id`. Lo necesitas como objeto para el paso 3.

**Paso 2 — Look Up Attachment**
Busca el attachment en `sys_attachment` con estas condiciones:
- `table_name` = `sc_req_item`  
- `table_sys_id` = `[Trigger > Requested Item > Sys ID]`

Esto localiza el Excel que el usuario adjuntó al formulario.

**Paso 3 — Move Attachment**
Mueve el attachment del `sc_req_item` al Data Source. Esto es lo que hace posible todo el patrón: ServiceNow sabe leer el attachment del Data Source para ejecutar la importación.

**Paso 4 — Import and Transform**
Ejecuta la Flow Action personalizada con los `sys_id` del Data Source y del Transform Map como inputs fijos (hardcodeados en el Flow, no vienen del trigger).

**Paso 5 — Delete Attachment**
Elimina el attachment del Data Source. Si no haces esto, cada importación acumulará un archivo en el Data Source y en las ejecuciones posteriores podría coger el archivo equivocado.

La vista del Flow completo:

```
[Service Catalog trigger]
  ↓
1. Look Up Data Source (sys_id fijo)
2. Look Up Attachment en sc_req_item
3. Move Attachment → Data Source
4. Import and Transform (Flow Action)
5. Delete Attachment del Data Source
```

## Cómo verificar que funciona

1. Adjunta un Excel con dos filas: una para un registro que no existe (creación) y otra para un registro que ya existe (actualización).
2. Envía el Catalog Item.
3. En el Flow, verifica que todos los pasos completaron en verde.
4. Revisa la Import Set Table: deberías ver las filas importadas con estado `Transformed`.
5. Comprueba los registros en la tabla destino: uno nuevo, uno con el valor actualizado.
6. Verifica que el attachment ya no existe en el Data Source (paso 5 del Flow).

Para diagnóstico de errores en los field maps, revisa **System Import Sets > Import Sets** y abre el Import Set generado. Cada fila mostrará si fue insertada, actualizada o rechazada, y el motivo en caso de rechazo.

## Casos edge y advertencias

### El attachment desactualizado en entornos multi-idioma

Este es el caso edge más silencioso del patrón y el más frecuente en organizaciones grandes.

El enlace de descarga de la plantilla apunta a un `sys_id` de attachment concreto. Ese `sys_id` está embebido en el HTML de la descripción del Catalog Item. Si actualizas la plantilla Excel (añades una columna, cambias un nombre de campo), tienes que:

1. Subir el nuevo archivo al Catalog Item.
2. Obtener el nuevo `sys_id` del attachment.
3. Actualizar el enlace en la descripción HTML.

Si tu instancia tiene el Catalog Item en múltiples idiomas (inglés, español, etc.), **cada versión traducida tiene su propia descripción HTML**. Actualizar solo la versión en español deja la versión en inglés apuntando al archivo antiguo. Los usuarios de la versión en inglés descargarán la plantilla vieja, la rellenarán en el formato obsoleto, y el Transform Map rechazará sus filas sin un mensaje de error claro.

La solución es mantener un proceso de actualización que incluya explícitamente la revisión de todas las traducciones activas. ServiceNow no te avisa de esto.

### La fecha no coincide con ningún registro

Si el Transform Map usa un field map scripted para resolver una fecha contra una tabla de períodos, cualquier fecha que no exista en esa tabla generará una fila rechazada con `ignore = true`.

El problema más habitual no es que la fecha no exista, sino que llega en un formato que `GlideDate.setValue` no reconoce. `setValue` espera `YYYY-MM-DD`. Si el Excel exporta la fecha en formato europeo (`dd/MM/yyyy`) o con hora incluida, la normalización devolverá vacío sin error aparente y la query no encontrará nada.

Activa el logging condicional y revisa qué valor llega en `fechaRaw` y qué devuelve `gd.getValue()` tras la normalización. La diferencia entre ambos suele revelar el problema inmediatamente.

## Versiones de ServiceNow afectadas

El patrón es compatible desde **Quebec** en adelante. Las acciones de Flow Designer para attachments (Move Attachment, Delete Attachment) están disponibles desde esa versión.

`GlideImportSetLoader` y `GlideImportSetTransformer` son APIs estables y no han cambiado de comportamiento en las versiones recientes. Los field maps scripted funcionan igual desde versiones anteriores a Quebec.

Probado en producción en **Vancouver** y **Washington**.
