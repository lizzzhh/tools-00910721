import { inferTypes } from '../lib/json-types'
import { mountWorkspace } from './tool-workspace'

const sample = JSON.stringify(
  {
    id: 'ORD-0001',
    customer: { name: 'Ava', vip: true, note: null },
    items: [{ sku: 'BOOK-1', qty: 2 }, { sku: 'PEN-9', qty: 1 }],
    total: 39.98,
    createdAt: '2026-03-01'
  },
  null,
  2
)

mountWorkspace(
  'json-to-typescript',
  (refs, run) => {
    return () => {
      const source = refs.input?.value ?? ''
      if (source.trim() === '') {
        run.failure(run.t('toolUi.json-to-typescript.emptyInput'))
        return
      }
      let value: unknown
      try {
        value = JSON.parse(source) as unknown
      } catch (error) {
        run.failure(`${run.t('toolUi.json-to-typescript.errors.invalidJson')}: ${error instanceof Error ? error.message : String(error)}`)
        return
      }
      const result = inferTypes(value, {
        flavour: run.option('flavour') === 'type' ? 'type' : 'interface',
        nullPolicy: run.option('nullPolicy') === 'union' ? 'union' : 'optional',
        semicolons: run.checked('semicolons'),
        exports: run.checked('exports')
      })
      if (!result.ok) {
        run.failure(run.t(`toolUi.json-to-typescript.errors.${result.code}`))
        return
      }
      run.stat('types', String(result.names.length))
      run.stat('properties', String(result.fieldCount))
      run.stat('nested', String(Math.max(0, result.names.length - 1)))
      run.stat('arrays', String(result.code.split('\n').filter((line) => line.includes('[]')).length))
      run.stat('lines', String(result.code.split('\n').length))
      run.success(result.code, run.t('toolUi.json-to-typescript.doneStatus'))
    }
  },
  { live: true, sample }
)