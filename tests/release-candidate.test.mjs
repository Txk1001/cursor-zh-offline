import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {releaseCandidate} from '../scripts/lib/release-candidate.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cursor-zh-release-'));
const version='1.1.2',commit='a'.repeat(40);
const record={version,commit,dirty:false,profile:'public'};
let count=0;
function fixture(){
  const directory=path.join(root,String(count++));fs.mkdirSync(directory);
  const files=[`cursor-zh-offline-${version}-source.zip`,`cursor-zh-offline-${version}-Windows-x64-offline.zip`,`cursor-language-pack-${version}.vsix`];
  const lines=files.map(file=>{fs.writeFileSync(path.join(directory,file),file);const sha=crypto.createHash('sha256').update(file).digest('hex');if(file.endsWith('.zip'))fs.writeFileSync(path.join(directory,file+'.sha256'),`${sha}  ${file}\n`);return `${sha}  ${file}`});
  fs.writeFileSync(path.join(directory,'SHA256SUMS'),lines.join('\n')+'\n');
  return {version,commit,record,directory};
}
const good=fixture();assert.equal(releaseCandidate(good).acceptance.humanApproval,'pending');
for(const dirty of [true,null])assert.throws(()=>releaseCandidate({...good,record:{...record,dirty}}),/干净源码/);
assert.throws(()=>releaseCandidate({...good,commit:'b'.repeat(40)}),/提交不一致/);
const mixed=fixture();fs.writeFileSync(path.join(mixed.directory,'cursor-language-pack-1.1.1.vsix'),'old');assert.throws(()=>releaseCandidate(mixed),/混入/);
const damaged=fixture();fs.writeFileSync(path.join(damaged.directory,`cursor-language-pack-${version}.vsix`),'damaged');assert.throws(()=>releaseCandidate(damaged),/SHA256SUMS/);
const stale=fixture();fs.writeFileSync(path.join(stale.directory,`cursor-zh-offline-${version}-source.zip.sha256`),'wrong');assert.throws(()=>releaseCandidate(stale),/外部校验/);
console.log('候选发行：提交绑定、干净状态、旧版本混入、内容损坏与外部校验值检查：通过。');
