import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {applyFileTransaction,recoverFileTransaction} from '../scripts/lib/file-transaction.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cursor-zh-transaction-'));
const realWrite=fs.writeFileSync,realRename=fs.renameSync;
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
let count=0;
function fixture(upgrade=false){
 const dir=path.join(root,String(count++)),appRoot=path.join(dir,'安装目录 with spaces','resources','app'),state=path.join(dir,'独立用户','state');
 fs.mkdirSync(appRoot,{recursive:true});fs.mkdirSync(state,{recursive:true});
 const app=path.join(appRoot,'main.js'),product=path.join(appRoot,'product.json'),ledgerPath=path.join(state,'rewrite.json');
 fs.writeFileSync(app,upgrade?'previous-patched':'original');fs.writeFileSync(product,'old checksums');if(upgrade)fs.writeFileSync(ledgerPath,'old ledger');
 const operations=[{file:app,bytes:Buffer.from('new patched')},{file:product,bytes:Buffer.from('new checksums')},{file:ledgerPath,bytes:Buffer.from('new ledger')}];
 const before=operations.map(x=>fs.existsSync(x.file)?fs.readFileSync(x.file,'utf8'):null);
 return {app,product,options:{appRoot,ledgerPath,journalPath:path.join(state,'install-transaction.json'),commit:'a'.repeat(40),operations},before};
}
function unchanged(f){f.options.operations.forEach((o,i)=>assert.equal(fs.existsSync(o.file)?fs.readFileSync(o.file,'utf8'):null,f.before[i]));}
try{
 for(const upgrade of [false,true])for(const stage of ['partial-main','after-product','partial-ledger','commit-journal']){
  const f=fixture(upgrade);let injected=false;
  fs.writeFileSync=(file,bytes,...args)=>{
   const name=typeof file==='string'?path.basename(file):'';
   const hit=stage==='partial-main'&&name.startsWith('.main.js.cursor-zh-')||stage==='partial-ledger'&&name.startsWith('.rewrite.json.cursor-zh-')||stage==='commit-journal'&&name.startsWith('.install-transaction.json.cursor-zh-')&&String(bytes).includes('"committed"');
   if(!injected&&hit){injected=true;realWrite(file,String(bytes).slice(0,3),...args);throw Object.assign(Error('injected ENOSPC'),{code:'ENOSPC'})}return realWrite(file,bytes,...args);
  };
  fs.renameSync=(from,to)=>{realRename(from,to);if(!injected&&stage==='after-product'&&to===f.product){injected=true;throw Error('injected after replacement')}};
  assert.throws(()=>applyFileTransaction(f.options),error=>error.recovery?.complete===true);
  fs.writeFileSync=realWrite;fs.renameSync=realRename;assert(injected);unchanged(f);assert(!fs.existsSync(f.options.journalPath));
 }
 // Recovery itself can fail. Never report success, and keep a durable retry path.
 const retry=fixture(true);let replaced=false;
 fs.renameSync=(from,to)=>{if(to===retry.app&&replaced)throw Error('recovery temporarily blocked');realRename(from,to);if(to===retry.app){replaced=true;throw Error('after replacement')}};
 assert.throws(()=>applyFileTransaction(retry.options),e=>e.recovery?.complete===false);
 fs.renameSync=realRename;assert(fs.existsSync(retry.options.journalPath));assert(recoverFileTransaction(retry.options).complete);unchanged(retry);
 // A different process dies after a replacement, leaving its lock and journal.
 const crash=fixture(true),moduleUrl=new URL('../scripts/lib/file-transaction.mjs',import.meta.url).href;
 const childCode=`import fs from 'node:fs';import {applyFileTransaction} from ${JSON.stringify(moduleUrl)};const options=${JSON.stringify({...crash.options,operations:crash.options.operations.map(o=>({...o,bytes:o.bytes.toString()}))})};const rename=fs.renameSync;fs.renameSync=(a,b)=>{rename(a,b);if(b===${JSON.stringify(crash.app)})process.exit(73)};applyFileTransaction(options);`;
 assert.equal(spawnSync(process.execPath,['--input-type=module','-e',childCode],{windowsHide:true}).status,73);
 assert(recoverFileTransaction(crash.options).complete);unchanged(crash);
 const success=fixture();assert(applyFileTransaction(success.options).complete);success.options.operations.forEach(o=>assert.equal(hash(fs.readFileSync(o.file)),hash(o.bytes)));
 const conflict=fixture();conflict.options.operations[0].expectedBefore=hash('another value');assert.throws(()=>applyFileTransaction(conflict.options),/变化/);unchanged(conflict);
 const locked=fixture();fs.writeFileSync(locked.options.journalPath+'.lock',JSON.stringify({pid:process.pid}));assert.throws(()=>applyFileTransaction(locked.options),/另一个/);unchanged(locked);
 console.log('安装事务：首次/重装四阶段故障、恢复失败重试、进程中断、并发保护、中文空格路径与成功提交：通过');
}finally{
 fs.writeFileSync=realWrite;fs.renameSync=realRename;
 assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'cursor-zh-transaction-'));
 console.log('隔离测试目录已保留，供复查。');
}
