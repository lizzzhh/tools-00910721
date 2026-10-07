import { buildCurl, type CurlHeader, type HttpMethod } from '../lib/curl'
import { mountWorkspace } from './tool-workspace'

/** `Name: value`, one per line; a line with no colon is a name with no value. */
function readHeaders(source: string): CurlHeader[] {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const at = line.indexOf(':')
      return at === -1
        ? { name: line, value: '', enabled: true }
        : { name: line.slice(0, at).trim(), value: line.slice(at + 1).trim(), enabled: true }
    })
}

mountWorkspace('curl-builder', (refs, run) => {
  return () => {
    const url = refs.el<HTMLInputElement>('option-url')?.value.trim() ?? ''
    if (url === '') {
      run.failure(run.t('toolUi.curl-builder.emptyUrl'))
      return
    }
    const headers = readHeaders(refs.el<HTMLTextAreaElement>('option-headers')?.value ?? '')
    const body = refs.el<HTMLTextAreaElement>('option-body')?.value ?? ''
    const declaresJson = headers.some((header) => header.name.toLowerCase() === 'content-type')
    const result = buildCurl({
      method: run.option('method') as HttpMethod,
      url,
      headers,
      body,
      bodyKind: body.trim() === '' ? 'none' : declaresJson ? 'json' : 'raw',
      auth: { kind: 'none', username: '', password: '', token: '' },
      insecure: run.checked('insecure'),
      followRedirects: run.checked('followRedirects'),
      compressed: run.checked('compressed'),
      showErrors: run.checked('showErrors')
    })
    if (!result.ok) {
      run.failure(run.t(`toolUi.curl-builder.errors.${result.code}`))
      return
    }
    run.stat('flags', result.usedFlags.join(' ') || '—')
    run.stat('length', String(result.command.length))
    run.stat('query', String(new URLSearchParams(url.split('?')[1] ?? '').size))
    run.stat('headers', String(result.headerCount))
    run.success(run.checked('pretty') ? result.pretty : result.command, run.t('toolUi.curl-builder.doneStatus'))
  }
})