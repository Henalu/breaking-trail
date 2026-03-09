import { defineCollection, z } from 'astro:content'

const articles = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().min(1).max(160),
    categoria: z.enum([
      'awa',
      'cmdb',
      'assignment-engine',
      'integraciones',
      'business-rules',
      'transform-maps',
      'ui-actions',
      'workspaces',
      'ui-builder',
    ]),
    tags: z.array(z.string()).min(2).max(6),
    fecha: z.coerce.date(),
    dificultad: z.enum(['basico', 'intermedio', 'avanzado']),
    servicenow_version: z.array(z.string()).min(1),
    resuelto: z.boolean(),
  }),
})

export const collections = { articles }
