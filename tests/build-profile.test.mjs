import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildProfile,readBuildMetadata} from '../scripts/lib/build-profile.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cursor-zh-public-build-'));
const file=path.join(dir,'metadata.json');
assert.equal(buildProfile({}),'public');
assert.throws(()=>buildProfile({profile:'unknown'}),/构建配置/);
for(const bytes of [null,'broken-json','{"core":{"synthetic":{"hello":"Hello"}}}']) {
  if(bytes!==null)fs.writeFileSync(file,bytes);
  assert.equal(readBuildMetadata('public',file),null);
}
const read=fs.readFileSync;
fs.readFileSync=()=>assert.fail('Public mode must not even read local metadata');
try{assert.equal(readBuildMetadata('public',file),null)}finally{fs.readFileSync=read}
assert.deepEqual(readBuildMetadata('local',file),{core:{synthetic:{hello:'Hello'}}});
console.log('公共构建：元数据缺失、损坏、有效和禁止读取环境结果一致；本机诊断显式启用：通过。');
