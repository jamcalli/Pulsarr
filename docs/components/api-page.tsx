'use client'
import { createOpenAPIPage } from 'fumadocs-openapi/ui'
import spec from '@/lib/openapi-spec'

export const OpenAPIPage = createOpenAPIPage({
  playground: { enabled: false },
  loadDocument: async () => spec,
})
