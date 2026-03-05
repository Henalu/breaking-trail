# Proyecto: Breaking Trail — ServiceNow Technical Reference

## Qué es esto

Web de referencia técnica sobre ServiceNow para la comunidad hispanohablante.
Diferenciador: problemas reales de producción, por qué ocurren, qué no funcionó primero, solución real con código.
Objetivo a 12 meses: ser LA referencia técnica en español para profesionales ServiceNow.

---

## Stack y versiones

- **Framework:** Astro 5
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
breaking-trail/          # raíz del repo
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
| Astro 5 | Next.js | Astro es superior para contenido estático: 0 JS por defecto, SEO nativo, MDX trivial |
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

## Dirección de diseño

**Referencias:** Vercel, Linear, Stripe
**Sensación:** herramienta bien diseñada para desarrolladores — clara, moderna, sin elementos innecesarios

### Principios
- Minimalismo y espacio en blanco generoso — todo respira
- Tipografía como elemento principal de diseño
- Micro-interacciones sutiles (hover suave, fade al scroll) — nunca llamativas
- Paleta contenida: base negra/oscura, neutros grises, un acento (azul eléctrico o blanco puro)

### Decisiones técnicas de diseño
- **Fuente:** Geist (Vercel) o Inter — sans-serif moderna, no fuente del sistema
- **Ancho máximo artículos:** 720px
- **Ancho máximo home:** 900px
- **Tipografía Markdown:** @tailwindcss/typography para h2, h3, p, code, pre, table
- **Código:** fuente monospace, bloques con fondo diferenciado y syntax highlighting via Shiki
- **Cards:** transición suave en hover, borde con color de acento

### Lo que NO hacer en diseño
- No añadir animaciones llamativas o que distraigan del contenido
- No usar más de dos colores de acento
- No saturar el header con elementos
- No romper la legibilidad por estética

---

## Estado actual del proyecto

**Última actualización:** 2026-03-04

**Fase actual:** Fase 2 — Contenido mínimo viable 🔄 En curso

**Completado:**
- ✅ Fase 0: Definición completa
- ✅ Fase 1: Astro + Tailwind + Vercel funcionando
- ✅ Fase 2a: Content collections — config.ts + estructura + artículo de prueba
- ✅ Fase 2b: Routing — /articulos/[slug] y /categoria/[categoria] con URLs limpias
- ✅ Fase 2c: Home dinámica con ArticleCard — listado ordenado por fecha
- ✅ Primer artículo real publicado: exportar-registros-seleccionados-lista
- ✅ Categoría ui-actions añadida al schema
- ✅ Rediseño completo — Geist, typography, nav, escala de grises
- ✅ 3 artículos reales publicados
- ✅ Sitemap automático + Google Search Console verificado
- URL producción: breaking-trail.vercel.app

**Próximo paso:**
- Plantilla Obsidian para captura de conocimiento → artículo
- Segundo artículo planificado: "Filtrar dinámicamente una variable tipo Slushbucket según roles"
- Pagefind (búsqueda interna) — completa la Fase 2