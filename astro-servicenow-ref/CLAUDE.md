# Proyecto: Breaking Trail — ServiceNow Technical Reference

## Qué es esto

Web de referencia técnica sobre ServiceNow para la comunidad hispanohablante.
Diferenciador: problemas reales de producción, por qué ocurren, qué no funcionó primero, solución real con código.
Objetivo a 12 meses: ser LA referencia técnica en español para profesionales ServiceNow.

---

## Stack y versiones

- **Framework:** Astro 4
- **Estilos:** Tailwind CSS
- **Contenido:** Markdown / MDX
- **Deploy:** Vercel via GitHub (push a main = deploy automático)
- **Búsqueda:** Pagefind (estática, sin backend)
- **Syntax highlighting:** Shiki (nativo en Astro)
- **Futuro:** Astro Islands para chatbot RAG

---

## Comandos frecuentes

```bash
npm run dev        # Servidor local en localhost:4321
npm run build      # Build de producción (genera /dist)
npm run preview    # Preview del build antes de hacer push
npx pagefind       # Regenerar índice de búsqueda (después de build)
```

---

## Arquitectura de carpetas

```
astro-servicenow-ref/
├── src/
│   ├── content/
│   │   ├── articles/               # Artículos en Markdown
│   │   │   ├── awa/                # Advanced Work Assignment
│   │   │   ├── cmdb/
│   │   │   ├── assignment-engine/
│   │   │   ├── integraciones/
│   │   │   ├── business-rules/
│   │   │   └── transform-maps/
│   │   └── config.ts               # Schema de frontmatter — NO modificar sin revisar todos los .md
│   ├── pages/
│   │   ├── index.astro             # Home
│   │   ├── articulos/[...slug].astro   # Página de artículo individual
│   │   └── categoria/[categoria].astro # Listado por categoría
│   ├── components/                 # Componentes reutilizables
│   └── layouts/
│       ├── Base.astro              # Layout raíz (head, nav, footer)
│       └── Article.astro           # Layout específico de artículos
├── public/                         # Assets estáticos
├── CLAUDE.md                       # Este archivo
└── package.json
```

---

## Schema de frontmatter (obligatorio en cada artículo)

```yaml
---
title: string                          # Título completo del artículo
description: string                    # 150-160 caracteres para SEO
categoria: awa | cmdb | assignment-engine | integraciones | business-rules | transform-maps
tags: [string, string]                 # Mínimo 2, máximo 6
fecha: YYYY-MM-DD
dificultad: basico | intermedio | avanzado
servicenow_version: [Utah, Vancouver]  # Versiones donde fue probado
resuelto: true | false                 # false si documenta una limitación sin solución
---
```

---

## Cómo añadir un artículo nuevo

1. Crear archivo en `src/content/articles/[categoria]/nombre-del-articulo.md`
2. Añadir frontmatter completo (ver schema arriba)
3. Escribir el artículo siguiendo la estructura estándar (ver sección abajo)
4. `npm run build` para verificar que compila sin errores
5. `git add . && git commit -m "feat: nuevo artículo - [título]" && git push`
6. Vercel despliega automáticamente en ~30 segundos

---

## Estructura estándar de cada artículo

1. **El problema** — exactamente como aparece en producción (logs, comportamiento, pantalla)
2. **Por qué ocurre** — razonamiento técnico, no solo síntomas
3. **Lo que no funcionó primero** — honestidad = credibilidad
4. **La solución real con código** — Glide scripts, configuración, pasos exactos
5. **Cómo verificar que funciona** — qué mirar para confirmar que está bien
6. **Casos edge y advertencias** — qué puede salir mal, en qué versiones difiere
7. **Versiones de ServiceNow afectadas** — tabla o lista explícita

---

## Decisiones de arquitectura tomadas — no reabrir sin razón explícita

| Decisión | Alternativa descartada | Razón |
|----------|----------------------|-------|
| Astro 4 | Next.js | Astro es superior para contenido estático: 0 JS por defecto, SEO nativo, MDX trivial |
| Markdown + VSCode | CMS visual (Contentful, Sanity) | Perfil técnico del autor, sin fricción, portable, indexable por IA |
| Pagefind | Algolia, ElasticSearch | Solución estática sin coste de servidor, ideal para fase inicial |
| Vercel | Netlify, VPS | Mejor DX, gratis a esta escala, CDN global automático, deploy desde GitHub |
| Tailwind CSS | CSS modules, styled-components | Utilidades directas en markup, sin cambiar de archivo para estilos |

---

## Lo que NO hacer

- **No cambiar el schema de frontmatter** sin actualizar `config.ts` y revisar todos los `.md` existentes
- **No añadir dependencias JS** sin evaluar impacto en performance (Astro = 0 JS por defecto, preservar eso)
- **No crear categorías nuevas** sin añadirlas también en: `config.ts`, `categoria/[categoria].astro`, y navegación
- **No modificar el sistema de rutas** sin verificar que el sitemap y Pagefind siguen funcionando
- **No hacer push a main** sin haber ejecutado `npm run build` localmente primero

---

## Artículos planificados (orden de publicación)

| # | Título | Categoría | Estado |
|---|--------|-----------|--------|
| 1 | Exportar registros seleccionados desde una lista | UI / Listas | ⏳ Pendiente |
| 2 | Filtrar dinámicamente una variable tipo Slushbucket según roles | Business Rules | ⏳ Pendiente |
| 3 | Reasignación automática cuando un agente se desconecta en AWA | AWA | ⏳ Pendiente |
| 4 | Afinidad en AWA: por qué no funciona como esperas | AWA | ⏳ Pendiente |
| 5 | Skills con niveles en AWA: la limitación estructural | AWA | ⏳ Pendiente |

---

## Estado actual del proyecto

**Última actualización:** 2025-01-03

**Fase actual:** Fase 0 — Definición ✅ COMPLETADA

**Completado:**
- Stack definido y documentado
- Arquitectura de carpetas creada en VSCode
- Schema de frontmatter definido
- Roadmap por fases definido
- 5 artículos planificados con orden de publicación
- Dominio elegido: Breaking Trail
- Claude Code instalado
- CLAUDE.md operacional creado

**Próximo paso:**
- Fase 1: Inicializar proyecto Astro (`npm create astro@latest`)
- Conectar repositorio GitHub con Vercel
- Crear layout base y publicar primer artículo de prueba