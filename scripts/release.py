#!/usr/bin/env python3
"""Build the local release from an explicit public-file allowlist."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text())['version']
name = f'Tangerine-v{version}'
out = root / 'release'
out.mkdir(exist_ok=True)
archive = out / f'{name}.zip'
items = ['dist', 'docs', 'scripts', 'tests', 'tools', 'Tangerine II.command',
         'run.sh', 'package.json', 'README.md', 'LISEZ-MOI.md', 'READ-ME.txt',
         'RELEASE.md', 'PUBLISHING.md', 'LICENSE', '.gitignore']
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as target:
    for item in items:
        path = root / item
        for file in sorted(path.rglob('*')) if path.is_dir() else [path]:
            if not file.is_file(): continue
            rel = file.relative_to(root)
            if any(p in ['__pycache__', 'renders', '.DS_Store'] for p in rel.parts): continue
            target.write(file, Path(name) / rel)
checksums = out / f'{name}-SHA256SUMS.txt'
checksums.write_text(f'{hashlib.sha256(archive.read_bytes()).hexdigest()}  {archive.name}\n')
print(archive)
print(checksums.read_text(), end='')
