import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {p,readJson,writeJson} from './lib/util.mjs';
const config=readJson(p('config.json'));
const record=readJson(p('dist','build-record.json'));
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:p('.'),encoding:'utf8',windowsHide:true}).trim();
if(record.commit!==commit||record.dirty||record.profile!=='public'||record.version!==config.version)throw Error('候选构建记录与干净源码提交不一致');
const files=fs.readdirSync(p('release')).filter(name=>/\.(zip|vsix|sha256)$/.test(name)||name==='SHA256SUMS').sort().map(name=>({
  file:name,bytes:fs.statSync(p('release',name)).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(p('release',name))).digest('hex')
}));
if(!files.some(f=>f.file.endsWith('-source.zip'))||!files.some(f=>f.file.endsWith('-Windows-x64-offline.zip'))||!files.some(f=>f.file.endsWith('.vsix')))throw Error('候选发行文件不完整');
writeJson(path.join(p('release'),'RELEASE-CANDIDATE.json'),{
  schema:1,version:config.version,sourceCommit:commit,build:record,files,
  workflowRun:process.env.GITHUB_RUN_ID??null,
  acceptance:{currentWindows:'pending',independentWindows:'pending',humanApproval:'pending'},
  publication:'Candidate only. Native acceptance and explicit owner approval are required before public release.'
});
console.log('候选产物已绑定源码提交、构建参数与哈希；实机验收和公开发布确认仍为待完成。');
