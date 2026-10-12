"""Export a committed Sites snapshot, or apply it without executing source code."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess

PROJECT_ID = 'appgprj_6acc46d603888191b969ed8dda1b4de3'
MANIFEST = '.sites-sync/source.json'
STATE = '.sites-sync/state.json'
ROOT_FILES = {
    '.npmrc', 'cloudflare-env.d.ts', 'components.json', 'drizzle.config.ts',
    'eslint.config.mjs', 'next.config.ts', 'package-lock.json', 'package.json',
    'postcss.config.mjs', 'tsconfig.json', 'vite.config.ts',
}
ROOT_DIRS = {'app', 'build', 'components', 'db', 'drizzle', 'examples', 'hooks',
             'lib', 'public', 'scripts', 'tests', 'vendor'}
REQUIRED = {'.openai/hosting.json', 'package.json', 'app/page.tsx',
            'lib/family-auth.ts', 'db/schema.ts'}
FIXTURES = {'test-page-password', 'test-page-secret-0123456789abcdef',
            'test-only-session-key-0123456789abcdef', 'rotated-test-only-password'}
SECRET_PATTERNS = [
    re.compile(rb'gh[pousr]_[A-Za-z0-9]{20,}'),
    re.compile(rb'github_pat_[A-Za-z0-9_]{20,}'),
    re.compile(rb'sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{30,}'),
    re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    re.compile(rb'https?://[^\s/:]+:[^\s/@]+@'),
]
FAMILY_LITERAL = re.compile(
    rb'(?:FAMILY_PASSWORD|FAMILY_SESSION_SECRET)\s*[:=]\s*["\']([^"\']+)["\']')


def git(*args, cwd=None):
    return subprocess.check_output(['git', *args], cwd=cwd)


def allowed(path):
    if not isinstance(path, str) or not path or '\\' in path:
        return False
    parts = path.split('/')
    if any(p in {'', '.', '..'} for p in parts) or path.startswith('/'):
        return False
    if any(not re.fullmatch(r'[A-Za-z0-9_.-]+', p) for p in parts):
        return False
    if path == '.openai/hosting.json' or path in ROOT_FILES:
        return True
    if parts[0] not in ROOT_DIRS or len(parts) < 2:
        return False
    if any(p.startswith('.') or p in {'node_modules', 'dist', 'coverage', 'backups'} for p in parts[1:]):
        return False
    if PurePosixPath(path).suffix.lower() in {'.db', '.sqlite', '.sqlite3', '.pem', '.key', '.p12', '.zip', '.gz', '.tar', '.log'}:
        return False
    return True


def validate_bytes(path, data):
    if len(data) > 2_000_000:
        raise ValueError(f'File exceeds snapshot limit: {path}')
    if any(pattern.search(data) for pattern in SECRET_PATTERNS):
        raise ValueError(f'Possible credential found; inspect locally: {path}')
    for match in FAMILY_LITERAL.finditer(data):
        value = match.group(1).decode('utf-8')
        if path not in {'tests/maintenance-form.test.mjs', 'tests/vehicle-api.test.mjs'} or value not in FIXTURES:
            raise ValueError(f'Literal family credential found; inspect locally: {path}')
    if path == '.openai/hosting.json':
        manifest = json.loads(data)
        if manifest.get('project_id') != PROJECT_ID or set(manifest) - {'project_id', 'd1', 'r2', 'static', 'capabilities', 'plugins', 'connectors'}:
            raise ValueError('Unexpected Site identity or hosting fields')
    if path.endswith('.sql') and not path.startswith('drizzle/'):
        raise ValueError(f'SQL backups are not accepted: {path}')


def tree_files(ref, cwd=None):
    result = {}
    for item in git('ls-tree', '-rz', '--full-tree', ref, cwd=cwd).split(b'\0'):
        if not item:
            continue
        meta, raw_path = item.split(b'\t', 1)
        mode, kind, oid = meta.decode().split()
        result[raw_path.decode()] = (mode, kind, oid)
    return result


def validate_manifest(manifest):
    if manifest.get('project_id') != PROJECT_ID or manifest.get('format') != 1:
        raise ValueError('Wrong Site identity or snapshot format')
    if not re.fullmatch(r'[0-9a-f]{40}', manifest.get('source_commit', '')):
        raise ValueError('Invalid Sites source commit')
    version = manifest.get('site_version')
    if type(version) is not int or version < 1:
        raise ValueError('Invalid published Site version')
    files = manifest.get('files')
    if not isinstance(files, list) or not 1 <= len(files) <= 3000:
        raise ValueError('Invalid snapshot file list')
    paths = set()
    for item in files:
        path = item.get('path')
        if not allowed(path) or path in paths:
            raise ValueError(f'Invalid or duplicate source path: {path}')
        if item.get('mode') not in {'100644', '100755'} or not re.fullmatch(r'[0-9a-f]{64}', item.get('sha256', '')):
            raise ValueError(f'Invalid file metadata: {path}')
        paths.add(path)
    if not REQUIRED <= paths:
        raise ValueError('Snapshot is missing required application files')
    return paths


def export_snapshot(source, output, ref, version):
    source = Path(source).resolve()
    output = Path(output).resolve()
    if output == source or source in output.parents or output.exists() and any(output.iterdir()):
        raise ValueError('Export destination must be empty and outside source checkout')
    commit = git('rev-parse', '--verify', f'{ref}^{{commit}}', cwd=source).decode().strip()
    files, buffers = [], {}
    for path, (mode, kind, oid) in sorted(tree_files(commit, source).items()):
        if not allowed(path):
            continue
        if kind != 'blob' or mode not in {'100644', '100755'}:
            raise ValueError(f'Symlink or submodule is not accepted: {path}')
        data = git('cat-file', 'blob', oid, cwd=source)
        validate_bytes(path, data)
        files.append({'path': path, 'mode': mode, 'sha256': hashlib.sha256(data).hexdigest()})
        buffers[path] = data
    manifest = {'format': 1, 'project_id': PROJECT_ID, 'source_commit': commit,
                'site_version': version, 'files': files}
    validate_manifest(manifest)
    for path, data in buffers.items():
        target = output / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    (output / '.sites-sync').mkdir(exist_ok=True)
    (output / MANIFEST).write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(f'Exported {len(files)} source files from published Site version {version}.')


def safe_target(path):
    target = Path(path)
    for parent in [target, *target.parents]:
        if parent.is_symlink():
            raise ValueError(f'Symlink in destination path: {path}')
    return target


def apply_snapshot(ref):
    if git('status', '--porcelain').strip():
        raise ValueError('Destination checkout must be clean')
    snapshot = git('rev-parse', '--verify', f'{ref}^{{commit}}').decode().strip()
    tree = tree_files(snapshot)
    if MANIFEST not in tree or tree[MANIFEST][0] != '100644':
        raise ValueError('Incoming source manifest is missing or unsafe')
    manifest = json.loads(git('cat-file', 'blob', tree[MANIFEST][2]))
    incoming = validate_manifest(manifest)
    state_path = safe_target(STATE)
    previous = json.loads(state_path.read_text()) if state_path.exists() else {}
    if previous:
        old_paths = validate_manifest(previous)
        if manifest['site_version'] < previous['site_version']:
            raise ValueError('Older published Site version cannot replace newer backup')
        if manifest['site_version'] == previous['site_version'] and manifest['source_commit'] != previous['source_commit']:
            raise ValueError('Same published version cannot identify a different source commit')
    else:
        old_paths = set()
    buffers, total = {}, 0
    for item in manifest['files']:
        path = item['path']
        if path not in tree or tree[path][0] != item['mode'] or tree[path][1] != 'blob':
            raise ValueError(f'Missing file or invalid mode: {path}')
        data = git('cat-file', 'blob', tree[path][2])
        if hashlib.sha256(data).hexdigest() != item['sha256']:
            raise ValueError(f'Snapshot digest mismatch: {path}')
        validate_bytes(path, data)
        safe_target(path)
        total += len(data)
        buffers[path] = data
    if total > 25_000_000:
        raise ValueError('Snapshot exceeds total size limit')
    for path in old_paths - incoming:
        target = safe_target(path)
        if target.exists():
            target.unlink()
    for item in manifest['files']:
        target = safe_target(item['path'])
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(buffers[item['path']])
        target.chmod(0o755 if item['mode'] == '100755' else 0o644)
    manifest['snapshot_commit'] = snapshot
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    paths = sorted(incoming | old_paths | {STATE})
    git('add', '-A', '--', *paths)
    print(f'Validated {len(incoming)} files; applied published Site version {manifest["site_version"]}.')
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a') as handle:
            handle.write(f'Published Site version: {manifest["site_version"]}\n\nSites source commit: `{manifest["source_commit"]}`\n\nSource files: {len(incoming)}\n\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    export = commands.add_parser('export')
    export.add_argument('source')
    export.add_argument('output')
    export.add_argument('--ref', default='HEAD')
    export.add_argument('--site-version', type=int, required=True)
    apply = commands.add_parser('apply')
    apply.add_argument('ref')
    args = parser.parse_args()
    try:
        if args.command == 'export':
            export_snapshot(args.source, args.output, args.ref, args.site_version)
        else:
            apply_snapshot(args.ref)
    except (ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        raise SystemExit(str(error))
