"""Exercise snapshot validation, deletion, protected files, and idempotence."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('sync', Path(__file__).with_name('sites_sync.py'))
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


def run(repo, *args):
    return subprocess.check_output(['git', *args], cwd=repo, stderr=subprocess.DEVNULL)


def init(repo):
    repo.mkdir(exist_ok=True)
    run(repo, 'init', '-b', 'main')
    run(repo, 'config', 'user.name', 'Sync Test')
    run(repo, 'config', 'user.email', 'sync@example.test')


def write(repo, path, content):
    target = repo / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def commit(repo):
    run(repo, 'add', '-A')
    run(repo, 'commit', '-m', 'Test snapshot')
    return run(repo, 'rev-parse', 'HEAD').decode().strip()


class SyncTests(unittest.TestCase):
    def test_paths_and_secrets(self):
        for path in ['.env', '.env.production', '.github/workflows/evil.yml', 'README.md',
                     'AGENTS.md', '../app/page.tsx', '/app/page.tsx', 'app/../lib/a.ts',
                     'db/data.sqlite', 'app/.env', 'public/token.pem', 'scripts/backups/dump.sql']:
            self.assertFalse(sync.allowed(path), path)
        for path in ['app/page.tsx', '.openai/hosting.json', 'package-lock.json', 'drizzle/0006.sql']:
            self.assertTrue(sync.allowed(path), path)
        for data in [b'ghp_' + b'A' * 40, b'-----BEGIN PRIVATE KEY-----',
                     b'https://username:password@example.test', b'FAMILY_PASSWORD="actual-private-value"']:
            with self.assertRaises(ValueError):
                sync.validate_bytes('lib/example.ts', data)
        sync.validate_bytes('tests/vehicle-api.test.mjs', b'FAMILY_SESSION_SECRET: "test-only-session-key-0123456789abcdef"')
        with self.assertRaises(ValueError):
            sync.validate_bytes('tests/vehicle-api.test.mjs', b'FAMILY_PASSWORD: "not-a-known-test-fixture"')

    def test_complete_sync_and_rejection_before_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, snapshot, destination = root / 'source', root / 'snapshot', root / 'destination'
            init(source)
            initial = {'.openai/hosting.json': json.dumps({'project_id': sync.PROJECT_ID, 'd1': 'DB', 'r2': None}),
                       'package.json': '{}', 'app/page.tsx': 'old page',
                       'lib/family-auth.ts': 'export {};', 'db/schema.ts': 'old schema',
                       'app/removed.ts': 'removed later', '.env': 'PRIVATE_LOCAL_SETTING=never-export',
                       'README.md': 'source readme', '.github/workflows/evil.yml': 'never-copy'}
            for path, content in initial.items():
                write(source, path, content)
            commit(source)
            sync.export_snapshot(source, snapshot, 'HEAD', 1)
            old_manifest = json.loads((snapshot / sync.MANIFEST).read_text())
            self.assertFalse((snapshot / '.env').exists())
            self.assertFalse((snapshot / '.github').exists())
            init(destination)
            for item in old_manifest['files']:
                write(destination, item['path'], (snapshot / item['path']).read_text())
            write(destination, sync.STATE, json.dumps(old_manifest))
            write(destination, 'README.md', 'protected readme')
            write(destination, '.github/workflows/sync-sites.yml', 'protected workflow')
            commit(destination)
            (source / 'app/removed.ts').unlink()
            write(source, 'app/page.tsx', 'new page')
            write(source, 'app/added.ts', 'new module')
            commit(source)
            incoming = root / 'incoming'
            sync.export_snapshot(source, incoming, 'HEAD', 2)
            init(incoming)
            commit(incoming)
            run(destination, 'fetch', str(incoming), 'HEAD:refs/remotes/origin/sites-sync')
            script = Path(sync.__file__).resolve()
            subprocess.run(['python3', str(script), 'apply', 'origin/sites-sync'], cwd=destination, check=True)
            self.assertEqual((destination / 'app/page.tsx').read_text(), 'new page')
            self.assertTrue((destination / 'app/added.ts').exists())
            self.assertFalse((destination / 'app/removed.ts').exists())
            self.assertEqual((destination / 'README.md').read_text(), 'protected readme')
            self.assertEqual((destination / '.github/workflows/sync-sites.yml').read_text(), 'protected workflow')
            commit(destination)
            subprocess.run(['python3', str(script), 'apply', 'origin/sites-sync'], cwd=destination, check=True)
            self.assertFalse(run(destination, 'status', '--porcelain').strip())
            # Tampering after export must fail before any destination file changes.
            write(incoming, 'app/page.tsx', 'tampered page')
            commit(incoming)
            run(destination, 'fetch', str(incoming), '+HEAD:refs/remotes/origin/sites-sync')
            failed = subprocess.run(['python3', str(script), 'apply', 'origin/sites-sync'], cwd=destination, capture_output=True)
            self.assertNotEqual(failed.returncode, 0)
            self.assertIn(b'digest mismatch', failed.stderr)
            self.assertEqual((destination / 'app/page.tsx').read_text(), 'new page')
            self.assertFalse(run(destination, 'status', '--porcelain').strip())
            # An older snapshot must not roll main back.
            init(snapshot)
            commit(snapshot)
            run(destination, 'fetch', str(snapshot), '+HEAD:refs/remotes/origin/sites-sync')
            older = subprocess.run(['python3', str(script), 'apply', 'origin/sites-sync'], cwd=destination, capture_output=True)
            self.assertNotEqual(older.returncode, 0)
            self.assertIn(b'Older published', older.stderr)


if __name__ == '__main__':
    unittest.main()
