import { duplicateCounts, sortLines, sortKeyIds, type SortKey } from '../lib/text-sort'
import { mountWorkspace } from './tool-workspace'

const sample = ['banana', 'apple', 'Cherry', 'banana', 'apple', 'date', 'fig10', 'fig9', 'fig'].join('\n')

mountWorkspace(
  'text-sort',
  (refs, run) => {
    return () => {
      const source = refs.input?.value ?? ''
      if (source.trim() === '') {
        run.failure(run.t('toolUi.text-sort.emptyInput'))
        return
      }
      const picked = run.option('order')
      const result = sortLines(source, {
        key: (sortKeyIds as readonly string[]).includes(picked) ? (picked as SortKey) : 'lexical',
        descending: run.option('direction') === 'desc',
        caseSensitive: run.checked('caseSensitive'),
        trim: run.checked('trim'),
        dedupe: run.checked('unique'),
        ignoreEmpty: run.checked('ignoreBlank'),
        pinnedPrefix: refs.el<HTMLInputElement>('option-pinned')?.value ?? ''
      })
      const duplicates = duplicateCounts(result.lines).filter((entry) => entry.count > 1)
      const blank = source.split('\n').filter((line) => line.trim() === '').length

      run.stat('lines', String(result.total))
      run.stat('sorted', String(result.moved))
      run.stat('duplicates', String(duplicates.length))
      run.stat('blank', String(blank))

      const notes = duplicates.slice(0, 10).map((entry) => `- ${JSON.stringify(entry.line)} × ${entry.count}`)
      run.success(
        [
          result.lines.join('\n'),
          '',
          run.t('toolUi.text-sort.summaryLine', { total: result.total, unique: result.unique, moved: result.moved }),
          ...(notes.length === 0 ? [] : ['', run.t('toolUi.text-sort.duplicatesTitle'), ...notes])
        ].join('\n'),
        run.t('toolUi.text-sort.doneStatus')
      )
    }
  },
  { live: true, sample }
)