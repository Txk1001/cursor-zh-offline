import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {restoreTrackedFiles,finalizeInstallation,activeExtensionNames,findVersionedVsix} from '../scripts/lib/install-state.mjs';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cursor-zh-restore-'));
fs.writeFileSync(path.join(root,'pack-1.0.70.vsix'),'old');assert.equal(findVersionedVsix(root,'pack','1.0.7'),null);
fs.writeFileSync(path.join(root,'pack-1.0.7.vsix'),'expected');assert.equal(findVersionedVsix(root,'pack','1.0.7'),path.join(root,'pack-1.0.7.vsix'));
const ext=path.join(root,'extensions');fs.mkdirSync(ext);fs.mkdirSync(path.join(ext,'old-pack'));fs.mkdirSync(path.join(ext,'new-pack'));fs.writeFileSync(path.join(ext,'.obsolete'),JSON.stringify({'old-pack':true}));
assert.deepEqual(activeExtensionNames(ext),['new-pack']);assert.deepEqual(activeExtensionNames(path.join(root,'missing')),[]);
const target=path.join(root,'app.js'),backup=path.join(root,'original.bak');
const entry={original:hash('original'),patched:hash('patched'),backup};
fs.writeFileSync(target,'patched');
let result=restoreTrackedFiles({'app.js':entry},()=>target);
assert(!result.complete);assert.deepEqual(result.remaining['app.js'],entry);assert.equal(fs.readFileSync(target,'utf8'),'patched');
fs.writeFileSync(backup,'corrupt');assert(!restoreTrackedFiles({'app.js':entry},()=>target).complete);
fs.writeFileSync(backup,'original');fs.writeFileSync(target,'third-party');assert(!restoreTrackedFiles({'app.js':entry},()=>target).complete);
fs.writeFileSync(target,'patched');result=restoreTrackedFiles({'app.js':entry,'missing.js':{...entry,backup:path.join(root,'missing.bak')}},rel=>path.join(root,rel));
assert(!result.complete);assert.equal(result.restored,1);assert(result.remaining['missing.js']);assert(!result.remaining['app.js']);assert(fs.existsSync(backup));
assert(restoreTrackedFiles({'app.js':entry},()=>target).complete);
fs.unlinkSync(backup);assert(restoreTrackedFiles({'app.js':entry},()=>target).complete);
for(const options of [{vsix:null},{cli:null},{installPack:()=>false},{installPack:()=>{throw Error('CLI failure')}},{setLocale:()=>{throw Error('EACCES')}}]){
  let localeCalls=0;
  const completed=finalizeInstallation({packNeeded:true,vsix:'test.vsix',cli:'cursor',installPack:()=>true,setLocale:()=>localeCalls++,...options});
  assert(!completed.complete);assert(completed.failures.length);if(completed.stages.languagePack==='failed')assert.equal(localeCalls,0);
}
assert(finalizeInstallation({packNeeded:false,setLocale:()=>{}}).complete);
assert(finalizeInstallation({packNeeded:true,cli:'cursor',vsix:'pack',installPack:()=>true,setLocale:()=>{}}).complete);
// Only this freshly created, resolved fixture directory is removed.
assert(root.startsWith(path.join(os.tmpdir(),'cursor-zh-restore-')));fs.rmSync(root,{recursive:true});
console.log('安装失败、缺失/损坏备份、冲突文件、部分恢复和重试：通过');
