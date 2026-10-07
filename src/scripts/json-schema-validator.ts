import { sampleDocument, sampleSchema, validateJson } from '../lib/json-schema'
import { mountWorkspace } from './tool-workspace'

mountWorkspace('json-schema-validator', (refs, run) => {
  const schema = refs.el<HTMLTextAreaElement>('option-schema')
  const document_ = refs.el<HTMLTextAreaElement>('option-document')
  if (schema && schema.value === '') schema.value = JSON.stringify(sampleSchema, null, 2)
  if (document_ && document_.value === '') document_.value = JSON.stringify(sampleDocument, null, 2)

  return () => {
    if ((schema?.value ?? '').trim() === '') {
      run.failure(run.t('toolUi.json-schema-validator.emptySchema'))
      return
    }
    if ((document_?.value ?? '').trim() === '') {
      run.failure(run.t('toolUi.json-schema-validator.emptyDocument'))
      return
    }
    let parsedSchema: unknown
    let parsedDocument: unknown
    try {
      parsedSchema = JSON.parse(schema?.value ?? '') as unknown
    } catch (error) {
      run.failure(`${run.t('toolUi.json-schema-validator.errors.invalidJson')}: ${error instanceof Error ? error.message : String(error)}`)
      return
    }
    try {
      parsedDocument = JSON.parse(document_?.value ?? '') as unknown
    } catch (error) {
      run.failure(`${run.t('toolUi.json-schema-validator.errors.invalidJson')}: ${error instanceof Error ? error.message : String(error)}`)
      return
    }

    const result = validateJson(parsedDocument, parsedSchema)
    if (!result.ok) {
      run.stat('result', run.t('toolUi.json-schema-validator.cannotRun'))
      run.failure(run.t(`toolUi.json-schema-validator.errors.${result.code}`))
      return
    }
    run.stat('result', result.valid ? run.t('toolUi.json-schema-validator.valid') : run.t('toolUi.json-schema-validator.invalid'))
    run.stat('issues', String(result.issues.length))
    run.stat('keywords', String(result.keywords.length))
    run.stat('checked', String(result.checked))

    const lines = result.issues.map((issue) => `${issue.path} · ${issue.keyword}`)
    if (result.valid) {
      const notes = result.notes.map((note) => `${note.path} · ${note.keyword}`)
      run.success(
        [`${run.t('toolUi.json-schema-validator.validDetail')}`, ...(notes.length > 0 ? ['', run.t('toolUi.json-schema-validator.notesTitle'), ...notes] : [])].join('\n'),
        run.t('toolUi.json-schema-validator.validStatus')
      )
      return
    }
    run.success(
      [
        run.t('toolUi.json-schema-validator.issuesTitle'),
        ...lines.map((line, index) => `${index + 1}. ${line}`),
        '',
        run.t('toolUi.json-schema-validator.keywordsUsed'),
        result.keywords.join(', ')
      ].join('\n'),
      run.t('toolUi.json-schema-validator.invalidStatus', { count: result.issues.length })
    )
  }
})