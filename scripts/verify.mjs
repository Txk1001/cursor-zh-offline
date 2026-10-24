import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {p} from './lib/util.mjs';
for(const script of ['build.mjs','validate-dist.mjs']){
  const result=spawnSync(process.execPath,[p('scripts',script)],{stdio:'inherit',windowsHide:true});
  if(result.error||result.status!==0)process.exit(result.status??1);
}
if(fs.existsSync(p('metadata','cursor.json'))){
  const result=spawnSync(process.execPath,[p('scripts','coverage.mjs')],{stdio:'inherit',windowsHide:true});
  process.exit(result.status??1);
}
console.log('标准资源构建与结构校验通过；没有本机 Cursor 元数据，未执行针对已安装版本的键覆盖率检查。');
