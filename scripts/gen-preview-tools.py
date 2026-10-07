#!/usr/bin/env python3
"""Writes the Astro component for each preview tool from one table.

The seventeen pages are the same page with different labels and options, so they
are written from one description of what each one needs. Run from the project
root: python3 scripts/gen-preview-tools.py
"""
import pathlib

TOOLS = [
    dict(id='yaml-format', name='YamlFormatTool', script='yaml-format', category='encoding', icon='lucide:file-cog', live=False,
         options=[('select', 'indent', [('2', 'two'), ('4', 'four'), ('tab', 'tab')]),
                  ('checkbox', 'keepComments', True)],
         stats=[('format', 'format'), ('lines', 'lines'), ('keys', 'keys'), ('comments', 'comments'), ('documents', 'documents')]),
    dict(id='xml-format', name='XmlFormatTool', script='xml-format', category='encoding', icon='lucide:code-xml', live=False,
         options=[('select', 'indent', [('2', 'two'), ('4', 'four'), ('tab', 'tab')]),
                  ('checkbox', 'collapse', True)],
         stats=[('format', 'format'), ('elements', 'elements'), ('attributes', 'attributes'), ('comments', 'comments'), ('text', 'textLength')]),
    dict(id='sql-format', name='SqlFormatTool', script='sql-format', category='encoding', icon='lucide:database', live=False,
         options=[('select', 'dialect', [('standard', 'standard'), ('mysql', 'mysql'), ('postgresql', 'postgresql'), ('sqlite', 'sqlite')]),
                  ('select', 'keywordCase', [('upper', 'upper'), ('lower', 'lower'), ('preserve', 'preserve')]),
                  ('select', 'indent', [('2', 'two'), ('4', 'four')]),
                  ('checkbox', 'wrapLists', False),
                  ('checkbox', 'logicalOnNewLine', True),
                  ('checkbox', 'betweenQueries', True)],
         stats=[('statements', 'statements'), ('keywords', 'keywords'), ('tables', 'tables'), ('placeholders', 'placeholders'), ('linesIn', 'linesIn'), ('linesOut', 'linesOut')]),
    dict(id='json-path', name='JsonPathTool', script='json-path', category='encoding', icon='lucide:braces', live=True,
         options=[('text', 'expression', 'expressionPlaceholder'), ('examples', 'example', None)],
         stats=[('matches', 'matches'), ('kind', 'kind'), ('path', 'resultPath'), ('depth', 'depth')]),
    dict(id='json-to-typescript', name='JsonToTypescriptTool', script='json-to-typescript', category='encoding', icon='lucide:file-code-2', live=True,
         options=[('select', 'flavour', [('interface', 'interface'), ('type', 'type')]),
                  ('select', 'nullPolicy', [('optional', 'optional'), ('union', 'union')]),
                  ('checkbox', 'semicolons', True),
                  ('checkbox', 'exports', False)],
         stats=[('types', 'types'), ('properties', 'properties'), ('nested', 'nested'), ('arrays', 'arrays'), ('lines', 'lines')]),
    dict(id='json-schema-validator', name='JsonSchemaValidatorTool', script='json-schema-validator', category='encoding', icon='lucide:badge-check', live=False,
         options=[('pair', 'documents', None)],
         stats=[('result', 'result'), ('issues', 'issues'), ('keywords', 'keywords'), ('checked', 'checked')]),
    dict(id='cron-parser', name='CronParserTool', script='cron-parser', category='developer', icon='lucide:clock-3', live=False,
         options=[('text', 'expression', 'expressionPlaceholder'), ('presets', 'preset', None)],
         stats=[('fields', 'fields'), ('matches', 'matches'), ('frequency', 'frequency'), ('seconds', 'seconds')]),
    dict(id='regex-tester', name='RegexTesterTool', script='regex-tester', category='developer', icon='lucide:regex', live=True,
         options=[('text', 'pattern', 'patternPlaceholder'),
                  ('flags', 'flags', ['g', 'i', 'm', 's', 'u']),
                  ('text', 'replacement', 'replacementPlaceholder')],
         stats=[('matches', 'matches'), ('groups', 'groups'), ('replaced', 'replaced'), ('flags', 'flags')]),
    dict(id='curl-builder', name='CurlBuilderTool', script='curl-builder', category='developer', icon='lucide:terminal', live=True,
         options=[('text', 'url', 'urlPlaceholder'), ('methods', 'method', None), ('checkbox', 'pretty', True),
                  ('textarea', 'headers', 'headersHint', 'headersPlaceholder'),
                  ('textarea', 'body', 'bodyHint', 'bodyPlaceholder'),
                  ('checkbox', 'followRedirects', True),
                  ('checkbox', 'compressed', False),
                  ('checkbox', 'showErrors', True),
                  ('checkbox', 'insecure', False)],
         stats=[('flags', 'flags'), ('length', 'length'), ('query', 'query'), ('headers', 'headers')]),
    dict(id='markdown-toc', name='MarkdownTocTool', script='markdown-toc', category='developer', icon='lucide:list', live=True,
         options=[('select', 'depth', [('2', 'depth2'), ('3', 'depth3'), ('4', 'depth4'), ('6', 'depth6')]),
                  ('text', 'marker', 'markerPlaceholder'),
                  ('checkbox', 'numbered', False),
                  ('checkbox', 'slugLinks', True)],
         stats=[('headings', 'headings'), ('levels', 'levels'), ('depth', 'maxDepth'), ('lines', 'lines')]),
    dict(id='diff-text', name='DiffTextTool', script='diff-text', category='text', icon='lucide:file-diff', live=False,
         options=[('textarea', 'after', 'afterHint', 'afterPlaceholder'),
                  ('select', 'mode', [('rows', 'rows'), ('unified', 'unified')]),
                  ('select', 'ignore', [('none', 'none'), ('space', 'space'), ('case', 'case')]),
                  ('number', 'context', 'contextValue')],
         stats=[('same', 'same'), ('added', 'added'), ('removed', 'removed'), ('similarity', 'similarity')]),
    dict(id='text-sort', name='TextSortTool', script='text-sort', category='text', icon='lucide:list-ordered', live=True,
         options=[('select', 'order', [('lexical', 'lexical'), ('natural', 'natural'), ('numeric', 'numeric'), ('length', 'length'), ('random', 'random')]),
                  ('select', 'direction', [('asc', 'asc'), ('desc', 'desc')]),
                  ('checkbox', 'caseSensitive', False),
                  ('checkbox', 'trim', True),
                  ('checkbox', 'unique', False),
                  ('checkbox', 'ignoreBlank', True),
                  ('text', 'pinned', 'pinnedPlaceholder')],
         stats=[('lines', 'lines'), ('sorted', 'sorted'), ('duplicates', 'duplicates'), ('blank', 'blank')]),
    dict(id='timezone-converter', name='TimezoneConverterTool', script='timezone-converter', category='efficiency', icon='lucide:globe', live=True,
         options=[('datetime', 'moment', None), ('zone', 'source', None), ('zone', 'target', None)],
         stats=[('source', 'sourceTime'), ('target', 'targetTime'), ('sourceOffset', 'sourceOffset'), ('targetOffset', 'targetOffset'), ('difference', 'difference'), ('dayShift', 'dayShift')]),
    dict(id='date-calculator', name='DateCalculatorTool', script='date-calculator', category='efficiency', icon='lucide:calendar-range', live=True,
         options=[('date', 'from', None), ('date', 'to', None),
                  ('select', 'operation', [('diff', 'diffDays'), ('plusDays', 'plusDays'), ('plusMonths', 'plusMonths'), ('age', 'age'), ('business', 'businessDays'), ('isoWeek', 'isoWeek')]),
                  ('number', 'amount', 'amountValue')],
         stats=[('result', 'resultLabel'), ('days', 'days'), ('weeks', 'weeks'), ('weekday', 'weekday'), ('isoWeek', 'isoWeekValue')]),
    dict(id='scientific-calculator', name='ScientificCalculatorTool', script='scientific-calculator', category='efficiency', icon='lucide:calculator', live=True,
         options=[('select', 'angle', [('deg', 'degree'), ('rad', 'radian')]),
                  ('number', 'precision', 'precisionValue')],
         stats=[('value', 'valueLabel'), ('degree', 'degreeLabel'), ('radian', 'radianLabel'), ('expression', 'expressionLabel')]),
    dict(id='color-converter', name='ColorConverterTool', script='color-converter', category='efficiency', icon='lucide:palette', live=True,
         options=[('text', 'color', 'colorPlaceholder'), ('checkbox', 'shortHex', False), ('checkbox', 'withAlpha', True)],
         stats=[('hex', 'hexLabel'), ('rgb', 'rgbLabel'), ('hsl', 'hslLabel'), ('oklch', 'oklchLabel'), ('luminance', 'luminanceLabel')]),
    dict(id='contrast-checker', name='ContrastCheckerTool', script='contrast-checker', category='efficiency', icon='lucide:contrast', live=True,
         options=[('text', 'foreground', 'foregroundPlaceholder'), ('text', 'background', 'backgroundPlaceholder'),
                  ('select', 'textSize', [('normal', 'normalText'), ('large', 'largeText')])],
         stats=[('ratio', 'ratioLabel'), ('grade', 'gradeLabel'), ('foreground', 'foregroundLabel'), ('background', 'backgroundLabel')]),
]

HEADER = """---
import ToolShell from '../ui/ToolShell.astro'
import ToolWorkbench from '../ui/ToolWorkbench.astro'
import CheckboxField from '../ui/CheckboxField.astro'
import SelectField from '../ui/SelectField.astro'
import { createTranslator } from '../../i18n'
IMPORTS
const t = createTranslator(Astro.locals.locale)
"""

OPTION_TEMPLATES = {
    'select': """    <SelectField slot="options" id="{id}-option-{name}" label={{t('toolUi.{tool}.opt.{name}')}} options={{{choices}
    }} value="{first}" />""",
    'examples': """    <SelectField slot="options" id="{id}-option-{name}" label={{t('toolUi.{tool}.opt.{name}')}} options={{jsonPathExamples.map((example) => ({{ value: example.expression, label: example.label ?? example.expression }}))}} />""",
    'presets': """    <SelectField slot="options" id="{id}-option-{name}" label={{t('toolUi.{tool}.opt.{name}')}} options={{cronPresets.map((preset) => ({{ value: preset.expression, label: t('toolUi.{tool}.opt.{name}Values.' + preset.id) }}))}} />""",
    'methods': """    <SelectField slot="options" id="{id}-option-{name}" label={{t('toolUi.{tool}.opt.{name}')}} options={{curlMethods.map((method) => ({{ value: method, label: method }}))}} value="GET" />""",
    'checkbox': """    <CheckboxField slot="options" id="{id}-option-{name}" label={{t('toolUi.{tool}.opt.{name}')}} {checked_attr} />""",
    'text': """    <div slot="options" class="tool-field">
      <label for="{id}-option-{name}">{{t('toolUi.{tool}.opt.{name}')}}</label>
      <input id="{id}-option-{name}" type="text" spellcheck="false" autocomplete="off" placeholder={{t('toolUi.{tool}.{placeholder}')}} />
    </div>""",
    'number': """    <div slot="options" class="tool-field">
      <label for="{id}-option-{name}">{{t('toolUi.{tool}.opt.{name}')}}</label>
      <input id="{id}-option-{name}" type="number" min="0" max="99" value={{t('toolUi.{tool}.{value}')}} />
    </div>""",
    'flags': """    <div slot="options" class="tool-option-section">
      <span class="tool-option-heading">{{t('toolUi.{tool}.opt.{name}')}}</span>
      <div class="tool-option-grid">
{choices}
      </div>
    </div>""",
    'textarea': """    <div slot="options" class="tool-field">
      <div class="field-heading">
        <label for="{id}-option-{name}">{{t('toolUi.{tool}.opt.{name}')}}</label>
        <span>{{t('toolUi.{tool}.{hint}')}}</span>
      </div>
      <div class="textarea-wrap">
        <textarea id="{id}-option-{name}" spellcheck="false" autocomplete="off" placeholder={{t('toolUi.{tool}.{placeholder}')}}></textarea>
      </div>
    </div>""",
    'pair': """    <div slot="options" class="tool-field-grid">
      <div class="tool-field">
      <div class="field-heading">
        <label for="{id}-option-schema">{{t('toolUi.{tool}.schemaLabel')}}</label>
        <span>{{t('toolUi.{tool}.schemaHint')}}</span>
      </div>
      <div class="textarea-wrap">
        <textarea id="{id}-option-schema" spellcheck="false" autocomplete="off" placeholder={{t('toolUi.{tool}.schemaPlaceholder')}}></textarea>
      </div>
      </div>
      <div class="tool-field">
      <div class="field-heading">
        <label for="{id}-option-document">{{t('toolUi.{tool}.documentLabel')}}</label>
        <span>{{t('toolUi.{tool}.documentHint')}}</span>
      </div>
      <div class="textarea-wrap">
        <textarea id="{id}-option-document" spellcheck="false" autocomplete="off" placeholder={{t('toolUi.{tool}.documentPlaceholder')}}></textarea>
      </div>
      </div>
    </div>""",
    'datetime': """    <div slot="options" class="tool-field">
      <label for="{id}-option-{name}">{{t('toolUi.{tool}.opt.{name}')}}</label>
      <input id="{id}-option-{name}" type="datetime-local" step="1" />
    </div>""",
    'date': """    <div slot="options" class="tool-field">
      <label for="{id}-option-{name}">{{t('toolUi.{tool}.opt.{name}')}}</label>
      <input id="{id}-option-{name}" type="date" />
    </div>""",
    'zone': """    <div slot="options" class="tool-field">
      <label for="{id}-option-{name}">{{t('toolUi.{tool}.opt.{name}')}}</label>
      <input id="{id}-option-{name}" type="text" list="{id}-zones" spellcheck="false" autocomplete="off" />
    </div>""",
}


def render_option(tool, option):
    kind = option[0]
    name = option[1]
    template = OPTION_TEMPLATES[kind]
    extra = list(option[2:])
    if kind == 'select':
        pairs = extra[0]
        choices = '[\n' + ',\n'.join(f"        {{ value: '{value}', label: t('toolUi.{tool['id']}.opt.{name}Values.{key}') }}" for value, key in pairs) + '\n      ]'
        return template.format(id=tool['id'], tool=tool['id'], name=name, choices=choices, first=pairs[0][0])
    if kind in ('examples', 'presets', 'methods'):
        return template.format(id=tool['id'], tool=tool['id'], name=name)
    if kind == 'checkbox':
        return template.format(id=tool['id'], tool=tool['id'], name=name, checked_attr='checked' if extra[0] else '')
    if kind == 'flags':
        choices = '\n'.join(
            f"""        <CheckboxField id="{tool['id']}-flag-{flag}" label={{t('toolUi.{tool['id']}.opt.{name}Values.{flag}')}} {'checked' if flag == 'g' else ''} />"""
            for flag in extra[0]
        )
        return template.format(id=tool['id'], tool=tool['id'], name=name, choices=choices)
    if kind == 'textarea':
        return template.format(id=tool['id'], tool=tool['id'], name=name, hint=extra[0], placeholder=extra[1])
    return template.format(id=tool['id'], tool=tool['id'], name=name, placeholder=extra[0], value=extra[0])


DYNAMIC_IMPORTS = {
    'json-path': "import { jsonPathExamples } from '../../lib/json-path'\n",
    'cron-parser': "import { cronPresets } from '../../lib/cron'\n",
    'curl-builder': "import { curlMethods } from '../../lib/curl'\n",
}


def render(tool):
    body = HEADER.replace('IMPORTS', DYNAMIC_IMPORTS.get(tool['id'], ''))
    body += f"""
const props = {{
  tool: '{tool['id']}',
  category: '{tool['category']}' as const,
  icon: '{tool['icon']}',
  live: {str(tool['live']).lower()},
  notice: t('toolUi.{tool['id']}.notice')
}}
---

<ToolShell tool={{props.tool}} category={{props.category}} icon={{props.icon}} notice={{props.notice}} live={{props.live}}>
  <ToolWorkbench
    tool={{props.tool}}
    inputLabel={{t('toolUi.{tool['id']}.inputLabel')}}
    placeholder={{t('toolUi.{tool['id']}.placeholder')}}
    runLabel={{t('toolUi.{tool['id']}.runButton')}}
    outputTitle={{t('toolUi.{tool['id']}.outputTitle')}}
    outputAria={{t('toolUi.{tool['id']}.outputAria')}}
  >
"""
    for option in tool['options']:
        body += render_option(tool, option) + '\n'
    if any(option[0] == 'zone' for option in tool['options']):
        body += f'    <datalist slot="options" id="{tool["id"]}-zones"></datalist>\n'
    body += '\n'
    for name, label in tool['stats']:
        body += f"      <div><span>{{t('toolUi.{tool['id']}.stat.{label}')}}</span><strong id=\"{tool['id']}-stat-{name}\">—</strong></div>\n"
    body += """  </ToolWorkbench>
</ToolShell>

<script>
  import '../../scripts/""" + tool['script'] + """'
</script>
"""
    return body


def main():
    root = pathlib.Path('src/components/tools')
    for tool in TOOLS:
        path = root / f"{tool['name']}.astro"
        path.write_text(render(tool))
        print('wrote', path)


if __name__ == '__main__':
    main()