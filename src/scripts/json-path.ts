import { queryJsonPath } from '../lib/json-path'
import { mountWorkspace } from './tool-workspace'

const sample = JSON.stringify(
  {
    store: {
      name: 'Corner Shop',
      book: [
        { title: 'Dune', price: 9.99, isbn: '9780441013593' },
        { title: 'Solaris', price: 12.5 },
        { title: 'Roadside Picnic', price: 7.25, isbn: '9780575094484' }
      ],
      bicycle: { color: 'red', price: 199.0 }
    }
  },
  null,
  2
)

mountWorkspace(
  'json-path',
  (refs, run) => {
    const expression = refs.el<HTMLInputElement>('option-expression')
    const example = refs.el<HTMLInputElement>('option-example')
    const json = () => {
      try {
        return { ok: true as const, value: JSON.parse(refs.input?.value ?? '') as unknown }
      } catch (error) {
        return { ok: false as const, message: error instanceof Error ? error.message : String(error) }
      }
    }

    example?.addEventListener('change', () => {
      if (expression) expression.value = example.value
    })

    return () => {
      const query = expression?.value.trim() ?? ''
      if (query === '') {
        run.failure(run.t('toolUi.json-path.emptyExpression'))
        return
      }
      const parsed = json()
      if (!parsed.ok) {
        run.failure(`${run.t('toolUi.json-path.errors.invalidJson')}: ${parsed.message}`)
        return
      }
      const result = queryJsonPath(parsed.value, query)
      if (!result.ok) {
        run.stat('matches', '0')
        run.failure(
          `${run.t(`toolUi.json-path.errors.${result.code}`)}${result.position === undefined ? '' : ` · ${run.t('workspace.charPosition', { position: result.position })}`}`
        )
        return
      }
      run.stat('matches', String(result.count))
      run.stat('kind', result.count === 0 ? run.t('toolUi.json-path.noMatch') : run.t('toolUi.json-path.matched'))
      run.stat('path', result.nodes[0]?.path ?? '—')
      run.stat('depth', String(Math.max(0, ...result.nodes.map((node) => node.path.split(/[.[\]]/).filter(Boolean).length))))
      run.success(JSON.stringify(result.count === 1 ? result.nodes[0]?.value : result.nodes.map((node) => node.value), null, 2), run.t('toolUi.json-path.doneStatus'))
    }
  },
  { live: true, sample }
)