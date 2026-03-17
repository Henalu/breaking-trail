# Breaking Trail — Memory

> Archivo de estado vivo del proyecto. Actualizar cada vez que cambie algo relevante.
> Última actualización: 2026-03-12

---

## Estado general

- **Fase actual:** Fase 3 — Autoridad (en curso)
- **URL producción:** breaking-trail.vercel.app
- **Progreso hacia 20 artículos:** 10/20
- **Deploy:** Push a `main` → Vercel automático (~30s)

---

## Artículos publicados

### AWA (4 artículos)

| Archivo | Título | Dificultad | Versiones |
|---------|--------|------------|-----------|
| `awa/reasignacion-automatica-agente-desconectado.md` | Reasignación automática cuando un agente se desconecta en AWA | intermedio | Xanadu, Zurich, Yokohama |
| `awa/rebalanceo-capacidad-agente-awa.md` | Rebalanceo automático de tareas cuando se reduce la capacidad de un agente en AWA | avanzado | Xanadu, Zurich, Yokohama |
| `awa/awa-motor-afinidad-personalizado.md` | Cuando AWA Affinity no es suficiente: construye tu propio motor de afinidad | avanzado | Washington, Xanadu, Yokohama |
| `awa/awa-skills-niveles-motor-personalizado.md` | AWA Skill Level no es un ranking: cómo implementar asignación por niveles de skill | avanzado | Washington, Xanadu, Yokohama |

### UI Actions (3 artículos)

| Archivo | Título | Dificultad | Versiones |
|---------|--------|------------|-----------|
| `ui-actions/exportar-registros-seleccionados-lista.md` | Exportar registros seleccionados desde una lista en ServiceNow | intermedio | Xanadu, Zurich |
| `ui-actions/prefiltrar-slushbucket-m2m-ui-action.md` | Cómo prefiltrar el Slushbucket de una related list M2M | intermedio | Vancouver |
| `ui-actions/export-all-query-activa.md` | UI Action Export ALL: exportar solo lo que el usuario realmente ve | intermedio | Utah, Vancouver, Washington, Xanadu |

### UI Builder (1 artículo)

| Archivo | Título | Dificultad | Versiones |
|---------|--------|------------|-----------|
| `ui-builder/llamar-script-include-desde-ui-builder.md` | Cómo llamar a un Script Include desde un Client Script de UI Builder | avanzado | Zurich |

### Workspaces (3 artículos)

| Archivo | Título | Dificultad | Versiones |
|---------|--------|------------|-----------|
| `workspaces/declarative-actions-visibilidad-workspace.md` | Declarative Actions no aparecen en el Workspace: la cadena UXF | avanzado | Zurich |
| `workspaces/declarative-actions-patron-herencia-action-name.md` | El patrón de herencia de Declarative Actions: Action Name | avanzado | Zurich |
| `workspaces/workspace-listas-panel-lateral-configuracion.md` | Cómo configurar las listas del panel lateral en un Workspace | intermedio | Vancouver, Washington DC |

### Integraciones (1 artículo)

| Archivo | Título | Dificultad | Versiones |
|---------|--------|------------|-----------|
| `integraciones/carga-masiva-excel-catalog-item.md` | Carga masiva desde Excel mediante Catalog Item y Flow Designer | avanzado | Vancouver |

---

## Categorías activas en el schema

Definidas en `src/content/config.ts` y soportadas en routing:

- `awa`
- `cmdb` *(sin artículos aún)*
- `assignment-engine` *(sin artículos aún)*
- `integraciones`
- `business-rules` *(sin artículos aún)*
- `transform-maps` *(sin artículos aún)*
- `ui-actions`
- `ui-builder`
- `workspaces`

> ⚠️ Añadir categoría nueva requiere actualizar: `config.ts` + `categoria/[categoria].astro` + navegación.

---

## Componentes y layouts

- `ArticleCard.astro` — Card de artículo para el home y listados de categoría
- `Search.astro` — Búsqueda estática via Pagefind
- `layouts/Base.astro` — Layout raíz (head, nav, footer)
- `layouts/Article.astro` — Layout específico de artículos
- `pages/index.astro` — Home dinámica con listado ordenado por fecha
- `pages/articulos/[...slug].astro` — Página individual de artículo
- `pages/categoria/[categoria].astro` — Listado por categoría

---

## Próximos artículos planificados

| # | Título | Categoría | Estado |
|---|--------|-----------|--------|
| 1 | Filtrar dinámicamente una variable tipo Slushbucket según roles | business-rules | ⏳ Pendiente |
| 2 | Afinidad en AWA: por qué no funciona como esperas | awa | ⏳ Pendiente |
| 3 | Skills con niveles en AWA: la limitación estructural | awa | ⏳ Pendiente |

---

## Checklist para añadir un artículo

```
[ ] Crear en src/content/articles/[categoria]/nombre.md
[ ] Frontmatter completo (title, description, categoria, tags, fecha, dificultad, servicenow_version, resuelto)
[ ] Estructura: problema → por qué ocurre → lo que no funcionó → solución con código → cómo verificar → edge cases → versiones
[ ] npm run build (sin errores)
[ ] git add . && git commit -m "feat: nuevo artículo - [título]" && git push
[ ] Actualizar este memory.md (artículos publicados + contador)
```

---

## Reglas que no cambian

- Schema de frontmatter: no modificar sin actualizar `config.ts` y todos los `.md`
- 0 JS por defecto (Astro): no añadir dependencias JS sin evaluar impacto
- No push a main sin `npm run build` local previo
- No crear categorías nuevas sin actualizar los tres sitios indicados arriba
- Ancho máximo artículos: 720px | Home: 900px
- Fuente: Geist o Inter
