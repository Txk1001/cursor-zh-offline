"""Install pinned wheels and model locally; never contacts a package index."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import zipfile

def unpack(archive,root):
    root=root.resolve();root.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(archive) as zipped:
        for entry in zipped.infolist():
            target=(root/entry.filename).resolve()
            if not target.is_relative_to(root) or entry.filename.startswith(('/', '\\')) or ':' in entry.filename:
                raise ValueError('Unsafe archive path')
        zipped.extractall(root)

parser=argparse.ArgumentParser()
parser.add_argument('--state',type=Path,required=True)
parser.add_argument('--assets',type=Path,required=True)
parser.add_argument('--manifest',type=Path,required=True)
args=parser.parse_args()
manifest=json.loads(args.manifest.read_text(encoding='utf-8-sig'))
site=Path(sys.executable).parent/'Lib'/'site-packages'
for entry in manifest['assets']:
    file=args.assets/entry['file']
    if hashlib.sha256(file.read_bytes()).hexdigest()!=entry['sha256'].lower():raise ValueError('Asset hash mismatch: '+entry['file'])
pip_wheel=next(e for e in manifest['assets'] if e.get('package')=='pip')
unpack(args.assets/pip_wheel['file'],site)
wheels=[str(args.assets/e['file']) for e in manifest['assets'] if e['kind']=='wheel' and e.get('package')!='pip']
subprocess.run([sys.executable,'-m','pip','install','--disable-pip-version-check','--no-index','--no-deps','--no-warn-script-location','--upgrade','--target',str(site),*wheels],check=True)
model=next(e for e in manifest['assets'] if e['kind']=='model')
unpack(args.assets/model['file'],args.state/'models')
print('离线运行时、模型及依赖已在本机安装。')
