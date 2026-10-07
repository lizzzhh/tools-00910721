import { diffLines, toUnifiedPatch } from '../lib/diff'
import { mountWorkspace } from './tool-workspace'

const before = ['name: riverside', 'region: eu-west', 'replicas: 2', 'log: info', 'timeout: 30'].join('\n')
const after = ['name: riverside', 'region: us-east', 'replicas: 3', 'timeout: 45', 'log: debug'].join('\n')

mountWorkspace(
  'diff-text',
  (refs, run) => {
    const after_ = refs.el<HTMLTextAreaElement>('option-after')
    if (after_ && after_.value === '') after_.value = after

    return () => {
      const left = refs.input?.value ?? ''
      const right = after_?.value ?? ''
      if (left === '' && right === '') {
        run.failure(run.t('toolUi.diff-text.emptyInput'))
        return
      }
      const ignore = run.option('ignore')
      const result = diffLines(left, right, {
        ignoreCase: ignore === 'case',
        ignoreWhitespace: ignore === 'space' || ignore === 'case'
      })
      if (!result.ok) {
        run.failure(run.t('toolUi.diff-text.errors.tooLarge', { lines: result.lines }))
        return
      }
      const total = result.added + result.removed + result.same
      const similarity = total === 0 ? 100 : Math.round((result.same / total) * 100)
      run.stat('same', String(result.same))
      run.stat('added', String(result.added))
      run.stat('removed', String(result.removed))
      run.stat('similarity', `${similarity}%`)

      if (result.identical) {
        run.success(run.t('toolUi.diff-text.identical'), run.t('toolUi.diff-text.identicalStatus'))
        return
      }
      const unified = toUnifiedPatch(result, run.number('context', 3))
      const rows = result.rows
        .map((row) => `${row.kind === 'same' ? '  ' : row.kind === 'added' ? '+ ' : '- '}${row.text}`)
        .join('\n')
      run.success(
        run.option('mode') === 'unified' ? unified : rows,
        run.t('toolUi.diff-text.doneStatus', { added: result.added, removed: result.removed })
      )
    }
  },
  { sample: before }
)