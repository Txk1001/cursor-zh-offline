import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync,spawn} from 'node:child_process';
import {withInstallationLock} from '../scripts/lib/installation-lock.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'cursor-zh-lock-'));
const moduleUrl=new URL('../scripts/lib/installation-lock.mjs',import.meta.url).href;
let index=0;
const fixture=()=>path.join(root,'中文 空格 '+index++,'journal.json');
const realWrite=fs.writeFileSync, realLink=fs.linkSync;
const child=(journal,body)=>spawnSync(process.execPath,['--input-type=module','-e',
  `import fs from 'node:fs';import {withInstallationLock} from ${JSON.stringify(moduleUrl)};const journal=${JSON.stringify(journal)};${body}`],{windowsHide:true});
try {
  // Empty/truncated legacy locks are diagnosed, preserved, and never blindly removed.
  for(const bytes of ['', '{"pid":', '{"pid":-1}']) {
    const journal=fixture(),lock=journal+'.lock';fs.mkdirSync(path.dirname(lock),{recursive:true});fs.writeFileSync(lock,bytes);
    assert.throws(()=>withInstallationLock(journal,()=>assert.fail('must not enter')),/无法安全取得安装锁/);
    assert.equal(fs.readFileSync(lock,'utf8'),bytes);
  }
  // Neither partial owner writes nor crashes before publication create a visible lock.
  const failed=fixture();let injected=false;
  fs.writeFileSync=(file,bytes,...args)=>{if(typeof file==='number'&&!injected){injected=true;realWrite(file,'{');throw Error('injected owner ENOSPC')}return realWrite(file,bytes,...args)};
  assert.throws(()=>withInstallationLock(failed,()=>assert.fail()),/ENOSPC/);
  fs.writeFileSync=realWrite;assert(injected);assert(!fs.existsSync(failed+'.lock'));
  assert.equal(withInstallationLock(failed,()=>42),42);
  const beforePublish=fixture();
  assert.equal(child(beforePublish,`const write=fs.writeFileSync;fs.writeFileSync=(...args)=>{write(...args);process.exit(71)};withInstallationLock(journal,()=>{});`).status,71);
  assert.equal(withInstallationLock(beforePublish,()=>43),43);

  // A dead owner after atomic publication is safely reclaimed without a JSON error.
  const afterPublish=fixture();
  assert.equal(child(afterPublish,`const link=fs.linkSync;fs.linkSync=(a,b)=>{link(a,b);if(b===journal+'.lock')process.exit(72)};withInstallationLock(journal,()=>{});`).status,72);
  assert.equal(withInstallationLock(afterPublish,()=>44),44);
  // Same PID but a different process birth identity is not treated as the old owner.
  const reused=fixture(),lock=reused+'.lock';fs.mkdirSync(path.dirname(lock),{recursive:true});
  fs.writeFileSync(lock,JSON.stringify({version:2,pid:process.pid,start:'not-this-process-birth',token:'old'}));
  assert.equal(withInstallationLock(reused,()=>45),45);
  // Failure to publish is safe and leaves installed resources untouched.
  fs.linkSync=()=>{throw Object.assign(Error('not supported'),{code:'ENOTSUP'})};
  assert.throws(()=>withInstallationLock(fixture(),()=>assert.fail()),/硬链接/);fs.linkSync=realLink;

  // An actual live process holds the lock while a second installer tries to enter.
  const live=fixture(),ready=path.join(root,'ready'),release=path.join(root,'release');
  const running=spawn(process.execPath,['--input-type=module','-e',
    `import fs from 'node:fs';import {withInstallationLock} from ${JSON.stringify(moduleUrl)};withInstallationLock(${JSON.stringify(live)},()=>{fs.writeFileSync(${JSON.stringify(ready)},'ready');const until=Date.now()+20000;while(!fs.existsSync(${JSON.stringify(release)})&&Date.now()<until)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30)});`],{windowsHide:true,stdio:'pipe'});
  try {
    const deadline=Date.now()+15000;
    while(!fs.existsSync(ready)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,30));
    assert(fs.existsSync(ready),'child must acquire the lock');
    assert.throws(()=>withInstallationLock(live,()=>assert.fail('concurrent entry')),/另一个/);
  } finally { fs.writeFileSync(release,'release'); }
  const status=await new Promise(resolve=>{running.on('exit',resolve);if(running.exitCode!==null)resolve(running.exitCode)});
  assert.equal(status,0);assert.equal(withInstallationLock(live,()=>46),46);
  console.log('安装锁：损坏旧记录、写入失败、发布前后中断、死进程、PID 复用、文件系统失败和真实并发：通过');
} finally {
  fs.writeFileSync=realWrite;fs.linkSync=realLink;
  console.log('隔离持锁证据保留于：'+root);
}
