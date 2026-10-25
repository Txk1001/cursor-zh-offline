import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

// Exercise the BSD ps contract without needing a Mac on the maintainer's PC.
// Real Darwin concurrency/recovery is separately tested by both macOS CI jobs.
const moduleUrl=new URL('../scripts/lib/installation-lock.mjs',import.meta.url).href;
const program=`
import assert from 'node:assert/strict';import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
Object.defineProperty(process,'platform',{value:'darwin'});
let value='Sun Oct 25 11:30:00 2026\\n',failure=false;
process.env.LC_ALL='zh_CN.UTF-8';process.env.TZ='Asia/Shanghai';
cp.execFileSync=(file,args,options)=>{assert.equal(file,'/bin/ps');assert.deepEqual(args,['-p','42','-o','lstart=']);assert.equal(options.env.LC_ALL,'C');assert.equal(options.env.TZ,'UTC');if(failure)throw Error('ps denied');return value};syncBuiltinESMExports();
const {startIdentity}=await import(${JSON.stringify(moduleUrl)});
const first=startIdentity(42);assert.equal(first,'darwin-lstart:Sun Oct 25 11:30:00 2026');
value='  Sun   Oct 25 11:30:00 2026  \\n';assert.equal(startIdentity(42),first);
value='Sun Oct 25 11:30:01 2026';assert.notEqual(startIdentity(42),first);
for(const invalid of ['', 'PID COMMAND', '周日 10月 25 11:30:00 2026', 'Sun Oct 25 11:30:00 2026\\nMon Oct 26 11:30:00 2026']){value=invalid;assert.throws(()=>startIdentity(42),/无法读取/)}
failure=true;assert.throws(()=>startIdentity(42),/ps denied/);
`;
const result=spawnSync(process.execPath,['--input-type=module','-e',program],{encoding:'utf8',windowsHide:true});
assert.equal(result.status,0,result.stderr);
console.log('macOS 进程身份：固定语言/时区、空白规范、启动时间变化、异常与不完整输出安全拒绝：通过');
