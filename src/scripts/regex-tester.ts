import { regexFlagIds, replaceAll, testPattern, type RegexFlag } from '../lib/regex'
import { mountWorkspace } from './tool-workspace'

const sample = 'order 12 shipped, order 31 shipped, order 7 pending'

mountWorkspace(
  'regex-tester',
  (refs, run) => {
    return () => {
      const pattern = refs.el<HTMLInputElement>('option-pattern')?.value ?? ''
      const replacement = refs.el<HTMLInputElement>('option-replacement')?.value ?? ''
      const subject = refs.input?.value ?? ''
      const flags = regexFlagIds.filter((flag) => run.checked(`flag-${flag}`)) as RegexFlag[]
      if (pattern === '') {
        run.failure(run.t('toolUi.regex-tester.emptyPattern'))
        return
      }

      const tested = testPattern(subject, pattern, flags)
      if (!tested.ok) {
        run.failure(run.t(`toolUi.regex-tester.errors.${tested.code}`))
        return
      }
      const replaced = replaceAll(subject, pattern, replacement, flags)

      run.stat('matches', String(tested.matchCount))
      run.stat('groups', String(tested.groupCount))
      run.stat('replaced', replaced.ok ? String(replaced.replaced) : '—')
      run.stat('flags', flags.length === 0 ? run.t('toolUi.regex-tester.noFlags') : flags.join(''))

      const rows = tested.matches.slice(0, 50).map((match, index) => {
        const groups = match.groups
          .map((group, at) => `${group.name ? `<${group.name}>` : `$${at}`}=${JSON.stringify(group.value)}`)
          .join('  ')
        return `${index + 1}. @${match.index}  ${JSON.stringify(match.text)}${groups === '' ? '' : `\n   ${groups}`}`
      })
      const head = [run.t('toolUi.regex-tester.matchesTitle'), ...(rows.length === 0 ? [run.t('toolUi.regex-tester.noMatches')] : rows)]
      if (replaced.ok && replaced.replaced > 0) {
        head.push('', run.t('toolUi.regex-tester.replacedTitle'), replaced.output)
      }
      run.success(head.join('\n'), run.t('toolUi.regex-tester.doneStatus', { count: tested.matchCount }))
    }
  },
  { live: true, sample }
)