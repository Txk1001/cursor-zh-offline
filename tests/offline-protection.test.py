"""Deterministic protection tests; no runtime, model or network required."""
import importlib.util
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('offline_engine', ROOT / 'offline' / 'engine.py')
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)


class ProtectionTests(unittest.TestCase):
    def test_placeholder_families(self):
        tokens = ['{{name}}', '{{ account.name }}', '${APP_ROOT}', '$(pwd)', '$HOME', '$env:PATH', '$1', '$?',
                  '%(username)s', '%(amount)08.2f', '%s', '%1$s', '%08.2f', '%USERPROFILE%', '%userprofile%',
                  '{filename}', '{amount:.2f}', '{name!r}', '{0}', '{items[0]}']
        for token in tokens:
            with self.subTest(token=token):
                spans = engine.protected_spans('Keep ' + token + ' unchanged.', {})
                self.assertIn(token, [span[2] for span in spans])

    def test_paths_shortcuts_and_commands(self):
        for token in ['/opt/project/main.rs', '../src/index.ts', '~/demo/config.toml',
                      r'C:\Projects\demo\main.ts', r'\\server\share\file.txt',
                      'Ctrl+Shift+P', 'npm install', 'pnpm install --frozen-lockfile',
                      'python -m pip install numpy', 'git checkout -b feature/ui',
                      'docker compose up -d', 'uv pip install "package==2.0"']:
            with self.subTest(token=token):
                spans = engine.protected_spans('Run ' + token + ' before continuing.', {})
                self.assertIn(token, [span[2] for span in spans])

    def test_immutable_regions_override_glossary(self):
        glossary = {'command palette': '命令面板', 'api key': 'API 密钥'}
        source = 'Open the Command Palette, `command palette`, {{command palette}} and /command/palette.'
        spans = engine.protected_spans(source, glossary)
        self.assertIn('命令面板', [span[3] for span in spans])
        self.assertIn('`command palette`', [span[3] for span in spans])
        self.assertIn('{{command palette}}', [span[3] for span in spans])
        self.assertIn('/command/palette.', [span[3] for span in spans])

    def test_markers_lost_duplicated_and_reordered(self):
        translator = engine.Engine.__new__(engine.Engine)
        translator.reviewed = {}
        translator.glossary = {}
        source = 'Keep {{account}} and $CONFIG_PATH unchanged.'
        for output in ['所有标记都丢失', '<x0> <x0>', '<x1> 与 <x0>', '< x 0 > 和 < x 1 >']:
            with self.subTest(output=output):
                translator.plain = lambda text: output if '<x' in text else '译文'
                translated = translator.protected(source)
                self.assertEqual(translated.count('{{account}}'), 1)
                self.assertEqual(translated.count('$CONFIG_PATH'), 1)
                self.assertNotIn('<x', translated)

    def test_repeated_values_and_chinese_are_preserved(self):
        source = 'Keep $HOME and $HOME; 请继续.'
        spans = engine.protected_spans(source, {})
        self.assertFalse(engine.spans_preserved('$HOME 请继续', spans))
        self.assertTrue(engine.spans_preserved('$HOME $HOME 请继续', spans))

    def test_reviewed_phrase_cannot_corrupt_tokens(self):
        translator = engine.Engine.__new__(engine.Engine)
        translator.reviewed = {'keep $home.': '保持美元主目录。'}
        translator.glossary = {}
        translator.plain = lambda text: text
        self.assertIn('$HOME', translator.protected('Keep $HOME.'))

    def test_code_statements_are_not_translated(self):
        translator = engine.Engine.__new__(engine.Engine)
        translator.reviewed = {}
        translator.glossary = {}
        translator.plain = lambda text: self.fail('Code must not reach model: ' + text)
        for source in ['const message = "Hello";', 'return response.json();', 'throw new Error("hello");',
                       'await process();', 'config.title = "Hello";', 'if (ready) {', 'for (const x of items) {']:
            with self.subTest(source=source):
                self.assertEqual(translator.protected(source), source)

    def test_literal_markup_cannot_become_an_internal_marker(self):
        translator = engine.Engine.__new__(engine.Engine)
        translator.reviewed = {}
        translator.glossary = {}
        translator.plain = lambda text: '译文' if text.strip() else text
        source = 'Keep <x0> and {{value}} unchanged.'
        translated = translator.protected(source)
        self.assertIn('<x0>', translated)
        self.assertIn('{{value}}', translated)


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--probe-state':
        import socket
        state = Path(sys.argv[2])
        installed_spec = importlib.util.spec_from_file_location('installed_engine', state / 'engine.py')
        installed = importlib.util.module_from_spec(installed_spec)
        installed_spec.loader.exec_module(installed)
        installed.Engine(state)
        for method in ('connect', 'connect_ex'):
            with socket.socket() as client:
                try:
                    getattr(client, method)(('192.0.2.1', 443))
                except OSError:
                    continue
                raise AssertionError('Outbound network was allowed: ' + method)
        print('outbound-blocked')
    else:
        unittest.main()
