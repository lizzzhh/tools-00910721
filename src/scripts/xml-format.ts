import { formatXml, xmlSample } from '../lib/xml'
import { mountWorkspace } from './tool-workspace'

const indents: Record<string, string> = { '2': '  ', '4': '    ', tab: '\t' }

mountWorkspace(
  'xml-format',
  (refs, run) => {
    return () => {
      const source = refs.input?.value ?? ''
      if (source.trim() === '') {
        run.failure(run.t('toolUi.xml-format.emptyInput'))
        return
      }
      const result = formatXml(source, indents[run.option('indent')] ?? '  ')
      if (!result.ok) {
        run.stat('format', run.t('toolUi.xml-format.formatBad'))
        run.failure(
          `${run.t(`toolUi.xml-format.errors.${result.code}`)}${result.position === undefined ? '' : ` · ${run.t('workspace.charPosition', { position: result.position })}`}`
        )
        return
      }
      run.stat('format', run.t('toolUi.xml-format.formatOk'))
      run.stat('elements', String(result.elementCount))
      run.stat('attributes', String(result.attributeCount))
      run.stat('comments', String(result.tokens.filter((token) => token.kind === 'comment').length))
      run.stat('text', String(result.tokens.filter((token) => token.kind === 'text').reduce((total, token) => total + token.content.trim().length, 0)))
      run.success(run.checked('collapse') ? result.minified : result.formatted, run.t('toolUi.xml-format.doneStatus'))
    }
  },
  { sample: xmlSample }
)