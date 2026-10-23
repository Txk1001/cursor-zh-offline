#!/usr/bin/env node
import os from 'node:os';import path from 'node:path';import fs from 'node:fs';import {createRequire} from 'node:module';
import {p,parseArgs} from './lib/util.mjs';import {findCursorInstall,readCursorInfo} from './lib/cursor-paths.mjs';
const {flags}=parseArgs();const install=findCursorInstall();const folder=install?readCursorInfo(install.appRoot).dataFolderName:'.cursor';
const state=typeof flags.state==='string'?path.resolve(flags.state):path.join(os.homedir(),folder,'cursor-language-pack','offline');
const service=createRequire(import.meta.url)(p('src','extension','offline.cjs'));
if(flags.stop){
 const file=path.join(state,'runtime.json');if(fs.existsSync(file)){const value=JSON.parse(fs.readFileSync(file,'utf8'));value.enabled=false;fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n')}
 await service.stop(state);console.log('离线翻译已停用。');
}else if(flags.status){const result=await service.health(state);console.log(result?.ready?'离线翻译已就绪。':'离线翻译未运行。')}
else{
 const file=path.join(state,'runtime.json');if(fs.existsSync(file)){const value=JSON.parse(fs.readFileSync(file,'utf8'));value.enabled=true;fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n')}
 const result=await service.start(state);if(!result?.ready)throw Error('请先运行离线引擎安装入口。');console.log('离线翻译已启动。');
}
