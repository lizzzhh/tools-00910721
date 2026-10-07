import { formatYaml, parseYaml, yamlSample } from '../lib/yaml'
import { mountWorkspace } from './tool-workspace'

mountWorkspace(
  'yaml-format',
  (refs, run) => {
    return () => {
      const source = refs.input?.value ?? ''
      if (source.trim() === '') {
        run.failure(run.t('toolUi.yaml-format.emptyInput'))
        return
      }
      const indent = run.option('indent') === '4' ? 4 : run.option('indent') === 'tab' ? '\t' : 2
      const parsed = parseYaml(source)
      const formatted = formatYaml(source, { indent, stripComments: !run.checked('keepComments') })

      run.stat('format', parsed.ok ? run.t('toolUi.yaml-format.formatOk') : run.t('toolUi.yaml-format.formatBad'))
      run.stat('lines', String(formatted.lines))
      run.stat('keys', String(parsed.ok ? countKeys(parsed.value) : 0))
      run.stat('comments', String(parsed.ok ? parsed.comments : 0))
      run.stat('documents', String(parsed.ok ? parsed.documents : 1))

      if (!parsed.ok) {
        run.failure(`${run.t(`toolUi.yaml-format.errors.${parsed.code}`)} · ${run.t('workspace.line', { line: parsed.line })}`)
        return
      }
      run.success(formatted.formatted, run.t('toolUi.yaml-format.doneStatus'))
    }
  },
  { sample: yamlSample }
)

function countKeys(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((total, item) => total + countKeys(item), 0)
  if (typeof value !== 'object' || value === null) return 0
  return Object.keys(value).reduce((total, key) => total + 1 + countKeys((value as Record<string, unknown>)[key]), 0)
}