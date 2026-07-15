from pathlib import Path
import shutil


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one match, found {count}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')

replace_once('openapi.yaml', '  version: 1.2.0\n', '  version: 1.2.1\n')
replace_once(
    'openapi.yaml',
    '      summary: Send a single-select list\n',
    '      summary: Send a single-select list with optional text fallback\n'
)
replace_once(
    'openapi.yaml',
    '''                buttonText:\n                  type: string\n                sections:\n''',
    '''                buttonText:\n                  type: string\n                fallbackText:\n                  type: string\n                  description: Optional text sent when native-flow generation or relay fails.\n                disableFallback:\n                  type: boolean\n                  default: false\n                sections:\n'''
)

path = Path('docs/INTERACTIVE_MESSAGES.md')
text = path.read_text(encoding='utf-8')
marker = '## Native-flow envelope\n'
section = '''## Lists endpoint\n\n```http\nPOST /v1/messages/list\n```\n\nList row IDs must be non-empty and unique across the complete message. The default total-row limit is ten and is configured with `INTERACTIVE_MAX_LIST_ROWS`.\n\nLists use the same fallback controls as buttons:\n\n- `fallbackText` replaces the generated plain-text representation;\n- `disableFallback=true` propagates the native-flow error instead of sending text;\n- successful fallback responses return `deliveryMode=text_fallback`.\n\n'''
if section not in text:
    if marker not in text:
        raise RuntimeError('interactive-message insertion marker not found')
    text = text.replace(marker, section + marker, 1)
path.write_text(text, encoding='utf-8')

shutil.rmtree('.zapforge-review')
print('documentation synchronized')
