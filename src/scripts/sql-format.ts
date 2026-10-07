import { formatSql, minifySql, sqlSample, type SqlDialect } from '../lib/sql'
import { mountWorkspace } from './tool-workspace'

let lastSource = ''
let lastDialect: SqlDialect = 'standard'

mountWorkspace(
  'sql-format',
  (refs, run) => {
    const format = () => {
      const source = refs.input?.value ?? ''
      if (source.trim() === '') {
        run.failure(run.t('toolUi.sql-format.emptyInput'))
        return
      }
      const dialect = run.option('dialect') as SqlDialect
      lastSource = source
      lastDialect = dialect
      const result = formatSql(source, {
        dialect,
        keywordCase: run.option('keywordCase') as 'upper' | 'lower' | 'preserve',
        indent: Number(run.option('indent')) === 4 ? 4 : 2,
        wrapLists: run.checked('wrapLists'),
        logicalOperatorsOnNewLine: run.checked('logicalOnNewLine'),
        linesBetweenQueries: run.checked('betweenQueries')
      })

      const placeholders = result.statements.reduce((total, statement) => total + statement.placeholders.length, 0)
      run.stat('statements', String(result.statements.length))
      run.stat('keywords', String(result.stats.keywords))
      run.stat('tables', String(result.stats.tables))
      run.stat('placeholders', String(placeholders))
      run.stat('linesIn', String(result.stats.linesIn))
      run.stat('linesOut', String(result.stats.linesOut))

      const detail = result.statements
        .map((statement) => `${statement.kind.toUpperCase()}${statement.tables.length > 0 ? ` ${statement.tables.join(', ')}` : ''}`)
        .join('\n')

      if (!result.ok) {
        run.failure(
          `${result.errors.map((error) => `${run.t(`toolUi.sql-format.errors.${error.code}`)} (${run.t('workspace.line', { line: error.line })})`).join('\n')}\n${detail}`
        )
        return
      }
      run.success(detail === '' ? result.sql : `${result.sql}\n-- ${detail.replace(/\n/g, ' ')}`, run.t('toolUi.sql-format.doneStatus'))
    }

    return {
      run: format,
      secondary: () => {
        if (lastSource.trim() === '') {
          run.failure(run.t('toolUi.sql-format.emptyInput'))
          return
        }
        run.success(minifySql(lastSource, lastDialect), run.t('toolUi.sql-format.minifiedStatus'))
      }
    }
  },
  { sample: sqlSample }
)