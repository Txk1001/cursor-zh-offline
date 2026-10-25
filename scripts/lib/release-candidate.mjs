import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function releaseCandidate({version,record,commit,directory,runId=null}) {
  if(record.commit!==commit||record.dirty!==false||record.profile!=='public'||record.version!==version)throw Error('候选构建记录与干净源码提交不一致');
  const source=`cursor-zh-offline-${version}-source.zip`,full=`cursor-zh-offline-${version}-Windows-x64-offline.zip`,vsix=`cursor-language-pack-${version}.vsix`;
  const expected=[source,source+'.sha256',full,full+'.sha256',vsix,'SHA256SUMS'].sort();
  const names=fs.readdirSync(directory).filter(name=>/\.(zip|vsix|sha256)$/.test(name)||name==='SHA256SUMS').sort();
  if(JSON.stringify(names)!==JSON.stringify(expected))throw Error('候选目录缺少当前版本文件，或混入其他版本产物；请使用独立目录');
  const files=names.map(file=>{
    const bytes=fs.readFileSync(path.join(directory,file));
    return {file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  });
  const hashes=new Map(files.map(f=>[f.file,f.sha256]));
  const sums=fs.readFileSync(path.join(directory,'SHA256SUMS'),'utf8').trim().split(/\r?\n/).sort();
  const wanted=[source,full,vsix].map(file=>`${hashes.get(file)}  ${file}`).sort();
  if(JSON.stringify(sums)!==JSON.stringify(wanted))throw Error('SHA256SUMS 与候选产物不一致');
  for(const file of [source,full])if(fs.readFileSync(path.join(directory,file+'.sha256'),'utf8').trim()!==`${hashes.get(file)}  ${file}`)throw Error('ZIP 外部校验值与候选产物不一致');
  return {schema:1,version,sourceCommit:commit,build:record,files,workflowRun:runId,
    acceptance:{currentWindows:'pending',independentWindows:'pending',humanApproval:'pending'},
    publication:'Candidate only. Native acceptance and explicit owner approval are required before public release.'};
}
