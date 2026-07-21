import fs from 'fs'
import path from 'path'

import { expect, test } from 'vitest'

import { generateProductRoutes } from '@/components/layouts/Navigation/NavigationBar/NavigationBar.utils'

test('nav has no Edge Functions route — no Deno runtime in Agentic Platform', () => {
  // ProductFeatures no longer accepts an `edgeFunctions` toggle at all (compile-time
  // guard) — generateProductRoutes can never be asked to emit a 'functions' route.
  const routes = generateProductRoutes('test-ref', undefined, {
    auth: true,
    storage: true,
    realtime: true,
  })

  expect(routes.some((route) => route.key === 'functions')).toBe(false)
})

test('no Edge Functions source trees remain in the studio app', () => {
  const studioRoot = path.join(__dirname, '../..')

  expect(fs.existsSync(path.join(studioRoot, 'data/edge-functions'))).toBe(false)
  expect(fs.existsSync(path.join(studioRoot, 'pages/project/[ref]/functions'))).toBe(false)
  expect(fs.existsSync(path.join(studioRoot, 'components/interfaces/Functions'))).toBe(false)
  expect(fs.existsSync(path.join(studioRoot, 'components/interfaces/EdgeFunctions'))).toBe(false)
  expect(fs.existsSync(path.join(studioRoot, 'components/layouts/EdgeFunctionsLayout'))).toBe(
    false
  )
  expect(fs.existsSync(path.join(studioRoot, 'components/ui/EdgeFunctionBlock'))).toBe(false)
})

test('AI assistant system prompt does not advertise a removed edge_functions load_knowledge topic', () => {
  // studio-tools.ts's `KNOWLEDGE` map (load_knowledge's Zod enum) only has
  // pg_best_practices/rls/realtime — edge_functions was dropped by C3.2. The system
  // prompt template is a separate, hand-written string that C3.2 missed, so check it
  // directly rather than re-deriving from the (now-correct) KNOWLEDGE map.
  //
  // Scoped to this single file's source so it can never flag the legitimately-kept
  // `list_edge_functions` MCP-passthrough tool name that lives in tool-filter.ts.
  const filePath = path.join(__dirname, '../../lib/ai/generate-assistant-response.ts')
  const content = fs.readFileSync(filePath, 'utf-8')

  expect(content).not.toMatch(/edge_functions/)
})
