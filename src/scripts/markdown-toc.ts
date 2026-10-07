import { buildToc, insertToc } from '../lib/markdown-toc'
import { mountWorkspace } from './tool-workspace'

const sample = [
  '# Project Notes',
  '',
  'A short list of what changed this week.',
  '',
  '## Setup',
  '',
  'Install the dependencies first.',
  '',
  '### Requirements',
  '',
  '- Node 20 or newer',
  '- A database',
  '',
  '## Setup on Windows',
  '',
  'Use the same steps.',
  '',
  '## Usage',
  '',
  '```bash',
  'npm run dev',
  '```',
  '',
  'See [the docs](https://example.com).'
].join('\n')

mountWorkspace(
  'markdown-toc',
  (refs, run) => {
    return () => {
      const markdown = refs.input?.value ?? ''
      if (markdown.trim() === '') {
        run.failure(run.t('toolUi.markdown-toc.emptyInput'))
        return
      }
      const toc = buildToc(markdown, {
        minLevel: 1,
        maxLevel: Number(run.option('depth')) || 3,
        numbered: run.checked('numbered'),
        linkStyle: run.checked('slugLinks') ? 'anchor' : 'plain'
      })
      const marker = refs.el<HTMLInputElement>('option-marker')?.value ?? ''

      run.stat('headings', String(toc.headings.length))
      run.stat('levels', String(new Set(toc.headings.map((heading) => heading.level)).size))
      run.stat('depth', String(toc.highest))
      run.stat('lines', String(toc.lines.length))

      const body = toc.lines.length === 0 ? run.t('toolUi.markdown-toc.noHeadings') : toc.lines.join('\n')
      if (marker.trim() !== '') {
        run.success(
          [`<!-- ${marker.trim()} -->`, body, '', insertToc(markdown, toc)].join('\n'),
          run.t('toolUi.markdown-toc.insertedStatus')
        )
        return
      }
      run.success(body, run.t('toolUi.markdown-toc.doneStatus'))
    }
  },
  { live: true, sample }
)