import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
if(process.platform!=='win32'||process.arch!=='x64'){console.log('Windows x64 安装入口测试：此平台跳过；通用事务测试另行执行。');process.exit(0)}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cursor-zh-main-fault-'));
try{
 for(const failed of ['main.js','product.json','rewrite.json']){
  const dir=path.join(root,failed);fs.mkdirSync(dir);
  const installer=new URL('../scripts/translate-install.mjs',import.meta.url).href;
  const program=`
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import cp from 'node:child_process';import crypto from 'node:crypto';import {syncBuiltinESMExports} from 'node:module';import {fileURLToPath} from 'node:url';
const dir=${JSON.stringify(dir)},install=path.join(dir,'自定义 Cursor 路径'),app=path.join(install,'resources','app'),user=path.join(dir,'新用户');
fs.mkdirSync(path.join(app,'out'),{recursive:true});fs.mkdirSync(user);process.env.APPDATA=path.join(user,'AppData');process.env.LOCALAPPDATA=path.join(user,'Local');
fs.writeFileSync(path.join(install,'Cursor.exe'),'fixture, never executed');
fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({version:'3.27.12',type:'module',main:'./out/main.js'}));
const original='// original fixture\\n',product=JSON.stringify({version:'3.27.12',commit:'a'.repeat(40),dataFolderName:'.cursor-test',checksums:{'main.js':crypto.createHash('sha256').update(original).digest('base64').replace(/=+$/,'')}});
fs.writeFileSync(path.join(app,'out','main.js'),original);fs.writeFileSync(path.join(app,'product.json'),product);
const write=fs.writeFileSync,spawn=cp.spawnSync;let injected=false;
os.homedir=()=>user;cp.spawnSync=(file,args,opts)=>/tasklist/i.test(String(file))?{status:0,stdout:'',stderr:''}:spawn(file,args,opts);
fs.writeFileSync=(file,value,...args)=>{if(!injected&&typeof file==='string'&&path.basename(file).startsWith('.'+${JSON.stringify(failed)}+'.cursor-zh-')){injected=true;write(file,String(value).slice(0,7),...args);throw Error('injected partial disk write')}return write(file,value,...args)};syncBuiltinESMExports();
process.on('exit',code=>write(path.join(dir,'result.json'),JSON.stringify({code,injected,appRestored:fs.readFileSync(path.join(app,'out','main.js'),'utf8')===original,productRestored:fs.readFileSync(path.join(app,'product.json'),'utf8')===product,ledgerExists:fs.existsSync(path.join(user,'.cursor-test','cursor-language-pack','rewrite.json'))})));
process.argv=[process.execPath,fileURLToPath(${JSON.stringify(installer)}),'--dir='+install];await import(${JSON.stringify(installer)});
`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',program],{encoding:'utf8',windowsHide:true});
  assert.equal(result.status,1,result.stderr);const record=JSON.parse(fs.readFileSync(path.join(dir,'result.json'),'utf8'));
  assert.deepEqual(record,{code:1,injected:true,appRestored:true,productRestored:true,ledgerExists:false},failed+'\n'+result.stdout);
 }
 console.log('真实安装入口：应用/校验信息/恢复记录部分写入失败均恢复，新用户及自定义路径：通过');
}finally{assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'cursor-zh-main-fault-'));fs.rmSync(root,{recursive:true,force:true})}
