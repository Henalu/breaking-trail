# Proyecto: Breaking Trail — ServiceNow Technical Reference

### División de trabajo: este chat vs Claude Code

**Este chat (Claude) es SIEMPRE para:**
- Arquitectura y decisiones de diseño
- Revisar código que me traes
- Generar artículos y contenido
- Conversación, planificación y estrategia
- Preparar el prompt exacto para Claude Code

**Claude Code es SIEMPRE quien ejecuta:**
- Cualquier cambio en archivos del proyecto
- Builds y verificación
- Debugging con acceso al filesystem

Nunca genero código para aplicar directamente en este chat.
Siempre termino con un prompt listo para copiar a Claude Code.

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

### Al terminar:
- Ejecuta npm run build y confirma que no hay errores
- Actualiza /memory.md: refleja los cambios realizados y el estado actual
- Si esta tarea completa una fase del roadmap, actualiza también CLAUDE.md

---

## Comandos Impeccable — Cuándo Ejecutar (automático)

Los siguientes comandos se ejecutan **sin que tengas que pedirlos**. Son parte del flujo de trabajo estándar.

| Momento | Comando | Por qué |
|---------|---------|---------|
| Después de crear o modificar cualquier componente Astro/Tailwind | `/polish` | Cierra el gap entre "funciona" y "está listo para producción" — alineación, espaciado, coherencia visual |
| Antes de hacer `git push` a main en cambios de UI | `/audit` | Revisa accesibilidad (a11y), responsive y coherencia antes de que Vercel desplegara |
| Al modificar estilos de tipografía, `@tailwindcss/typography`, o fuentes | `/typeset` | Asegura jerarquía tipográfica, tamaños coherentes y legibilidad en artículos técnicos |
| Al crear una página nueva (home, categoría, artículo individual) | `/arrange` | Corrige grids monótonos, espaciado inconsistente y jerarquía visual débil |
| Al añadir un componente nuevo que debe encajar con el design system existente | `/normalize` | Asegura consistencia con las decisiones de diseño Vercel/Linear ya tomadas |
| Después de escribir o modificar copy de UI (navegación, empty states, CTA) | `/clarify` | Mejora microcopy: labels, instrucciones, mensajes vacíos — crítico en una web de referencia técnica |
| Cuando un componente tiene estados de carga, empty states o errores | `/harden` | Añade manejo de edge cases, overflow de texto y robustez antes de producción |

### Comandos bajo demanda (no automáticos)

| Cuándo pedirlos | Comando |
|-----------------|---------|
| "Este componente se ve plano o aburrido" | `/bolder` |
| "Este diseño es demasiado llamativo, distrae del contenido" | `/quieter` |
| "Quiero añadir animaciones sutiles al scroll o hover" | `/animate` |
| "Revisa la UX del home o del listado de categorías" | `/critique` |
| "Identifica patrones repetidos en componentes para extraer" | `/extract` |
| "Configura el contexto de diseño del proyecto para impeccable" | `/teach-impeccable` |

---

## Visión a largo plazo (contexto estratégico)

El proyecto evoluciona en tres horizontes:

**Horizonte 1 — Base de conocimiento** (Fases 0-3, actual)
Contenido técnico de calidad como activo principal.
Credibilidad = autoridad = oportunidades profesionales.

**Horizonte 2 — RAG sobre contenido propio** (Fase 4)
Umbral de activación: ~40 artículos publicados con estructura consistente.
El contenido de la web se convierte en base de conocimiento indexada.
Tecnología: Astro Islands + embeddings + vector DB (por decidir).

**Horizonte 3 — Herramientas para desarrolladores** (Fase 5)
Herramientas especializadas basadas en el RAG:
- Script Analyzer
- Encoded Query Analyzer  
- Implementation Assistant

Modelo de negocio tentativo: freemium con tier Pro para acceso completo.

**Principio que no cambia en ningún horizonte:**
Experiencia real de producción > documentación teórica.
Ese es el diferenciador y no se negocia.

---

## Agentes Disponibles — Cuándo Activar Cada Uno

| Casuística | Agente | Ejemplo de activación |
|------------|--------|----------------------|
| Auditar estructura y voz de un artículo nuevo antes de publicar | `engineering-technical-writer` | "Revisa `src/content/articles/awa/reasignacion-automatica.md` — verifica que sigue la estructura estándar (El problema → Por qué ocurre → Lo que no funcionó → Solución real) y que el código de ejemplo compila" |
| Optimizar artículo para búsquedas en español sobre ServiceNow | `marketing-seo-specialist` | "Analiza el artículo sobre GlideList: mejora la meta description (150-160 chars), estructura H2/H3 para PAA, y sugiere keywords que los profesionales ServiceNow buscan en español" |
| Crear o modificar componentes Astro / layouts Tailwind | `engineering-frontend-developer` | "Crea un componente `DifficultyBadge` en `src/components/` con Tailwind CSS para mostrar el campo `dificultad` del frontmatter — sin añadir JS al bundle" |
| Diseñar la arquitectura del chatbot RAG (Horizonte 2) | `engineering-ai-engineer` | "Diseña la arquitectura del RAG con Astro Islands: embeddings de `src/content/articles/`, elección de vector DB serverless, e integración que preserve el 0-JS por defecto de Astro" |
| Revisar cambios en `config.ts` o layouts antes de push a main | `engineering-code-reviewer` | "Revisa los cambios en `src/content/config.ts` y `src/layouts/Article.astro` — verifica correctitud del schema, posibles breaking changes en el frontmatter y que Pagefind sigue indexando correctamente" |
| Mejorar visibilidad de artículos en ChatGPT / Perplexity | `marketing-ai-citation-strategist` | "Audita por qué otros sitios de ServiceNow aparecen citados en ChatGPT cuando se busca en español — identifica qué cambios de estructura, schema o entidad pueden hacer que breaking-trail.vercel.app sea el citado" |
| Gestionar commits convencionales y mensajes de git | `engineering-git-workflow-master` | "Verifica que los últimos commits de artículos siguen las convenciones del repo (`feat:`, `fix:`, `article:`) y sugiere si el historial de la rama main está limpio para el siguiente push a Vercel" |
| Diseñar sistema de layout o CSS para una página nueva | `design-ux-architect` | "Diseña el layout CSS para `src/pages/categoria/[categoria].astro` respetando max-width 900px, Tailwind, y la dirección de diseño Vercel/Linear — sin romper la legibilidad del contenido" |

### Regla general

- **Antes de publicar cualquier artículo**: usa `engineering-technical-writer` para validar estructura, código de ejemplo, y coherencia con la plantilla estándar del proyecto.
- **Antes de hacer push a main**: usa `engineering-code-reviewer` si tocaste `config.ts`, layouts, o componentes compartidos; el build roto en Vercel no es reversible sin otro push.
- **Para trabajo de diseño o UI**: usa `engineering-frontend-developer` para componentes Astro/Tailwind concretos y `design-ux-architect` cuando el problema es de sistema de layout o CSS foundation.
- **Para crecer en búsqueda**: `marketing-seo-specialist` para Google (organic) y `marketing-ai-citation-strategist` para visibilidad en respuestas de ChatGPT/Perplexity — son objetivos distintos con señales distintas.
- **Para Horizonte 2 (RAG)**: activa `engineering-ai-engineer` cuando llegues a ~40 artículos publicados; es el umbral definido en la visión estratégica para que el corpus sea suficiente.

---

## Estado actual del proyecto

**Última actualización:** 2026-03-05

**Fase actual:** Fase 3 — Autoridad 🔄 En curso

**Completado:**
- ✅ Fase 0: Definición completa
- ✅ Fase 1: Astro + Tailwind + Vercel funcionando
- ✅ Fase 2a: Content collections — config.ts + estructura + artículo de prueba
- ✅ Fase 2b: Routing — /articulos/[slug] y /categoria/[categoria] con URLs limpias
- ✅ Fase 2c: Home dinámica con ArticleCard — listado ordenado por fecha
- ✅ Fase 2d: Pagefind — búsqueda interna funcionando
- ✅ Fase 2 completada
- ✅ 4 artículos reales publicados
- ✅ Sitemap automático + Google Search Console verificado
- ✅ Plantilla Obsidian para captura de conocimiento
- ✅ División de trabajo Claude / Claude Code establecida
- URL producción: breaking-trail.vercel.app

**Próximo paso:**
- Capturar siguiente problema de producción con plantilla Obsidian
- Objetivo Fase 3: 20+ artículos