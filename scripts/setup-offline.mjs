#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {p,parseArgs,writeJson} from './lib/util.mjs';
import {findCursorInstall,readCursorInfo} from './lib/cursor-paths.mjs';
const require=createRequire(import.meta.url);
const {flags}=parseArgs();
if(process.platform!=='win32'||process.arch!=='x64')throw Error('本次预构建离线运行时适用于 Windows x64，其他系统需另行适配。');
const install=findCursorInstall();
const folder=install?readCursorInfo(install.appRoot).dataFolderName:'.cursor';
const state=typeof flags.state==='string'?path.resolve(flags.state):path.join(os.homedir(),folder,'cursor-language-pack','offline');
fs.mkdirSync(state,{recursive:true});
const assetRoot=p('offline','assets');
const manifestPath=p('offline','assets.json');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8').replace(/^\uFEFF/,''));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.mkdirSync(assetRoot,{recursive:true});
for(const asset of manifest.assets){
  if(path.basename(asset.file)!==asset.file)throw Error('无效的离线资产文件名。');
  const file=path.join(assetRoot,asset.file);
  if(!fs.existsSync(file)){
    if(!flags.download)throw Error(`离线包缺少 ${asset.file}，请使用完整离线包，或加 --download 从官方来源下载。`);
    const allowed=new URL(asset.url);if(allowed.protocol!=='https:'||!['www.python.org','argos-net.com','files.pythonhosted.org'].includes(allowed.hostname))throw Error('非官方资产地址。');
    const result=spawnSync('curl.exe',['--fail','--location','--retry','3','--output',file,asset.url],{stdio:'inherit',windowsHide:true});
    if(result.status!==0)throw Error('离线资产下载未完成。');
  }
  if(hash(file)!==asset.sha256.toLowerCase())throw Error(`离线资产校验失败：${asset.file}`);
}
console.log(`已校验 ${manifest.assets.length} 项离线资产。`);
if(flags.preview)process.exit(0);
const service=require(p('src','extension','offline.cjs'));
const configPath=path.join(state,'runtime.json');
if(fs.existsSync(configPath)){
  const previous=JSON.parse(fs.readFileSync(configPath,'utf8'));previous.enabled=false;writeJson(configPath,previous);
  await service.stop(state);
  for(let i=0;i<30;i++){if(!(await service.health(state))?.ready)break;await new Promise(resolve=>setTimeout(resolve,100))}
}
const revision=hash(manifestPath).slice(0,12);
const runtime=path.join(state,'runtime',`python-${manifest.python}-${revision}`);
const python=path.join(runtime,'python.exe');
const marker=path.join(runtime,'installed.json');
if(!fs.existsSync(marker)||!fs.existsSync(path.join(state,'models','translate-en_zh-1_9','model','model.bin'))){
  if(!fs.existsSync(python)){
    const archive=path.join(assetRoot,manifest.assets.find(asset=>asset.kind==='runtime').file);
    fs.mkdirSync(path.dirname(runtime),{recursive:true});
    const command='Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory($env:CURSOR_ZH_ARCHIVE,$env:CURSOR_ZH_RUNTIME)';
    const extracted=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{env:{...process.env,CURSOR_ZH_ARCHIVE:archive,CURSOR_ZH_RUNTIME:runtime},stdio:'inherit',windowsHide:true});
    if(extracted.status!==0)throw Error('无法解压离线 Python 运行时。');
  }
  fs.writeFileSync(path.join(runtime,'python312._pth'),'python312.zip\n.\nLib/site-packages\nimport site\n','utf8');
  const result=spawnSync(python,[p('offline','install-assets.py'),'--state',state,'--assets',assetRoot,'--manifest',manifestPath],{stdio:'inherit',windowsHide:true,env:{...process.env,PYTHONUTF8:'1',PYTHONUNBUFFERED:'1'}});
  if(result.status!==0)throw Error('离线依赖安装未完成，原有界面补丁未受影响。');
  writeJson(marker,{revision,installedAt:new Date().toISOString()});
}
fs.copyFileSync(p('offline','engine.py'),path.join(state,'engine.py'));
fs.copyFileSync(p('src','extension','offline.cjs'),path.join(state,'service.cjs'));
fs.copyFileSync(p('offline','THIRD-PARTY.md'),path.join(state,'THIRD-PARTY.md'));
fs.copyFileSync(p('offline','terms.default.json'),path.join(state,'terms.default.json'));
fs.copyFileSync(p('offline','protected-terms.json'),path.join(state,'protected-terms.json'));
fs.copyFileSync(p('offline','reviewed.zh-cn.json'),path.join(state,'reviewed.zh-cn.json'));
fs.cpSync(p('offline','licenses'),path.join(state,'licenses'),{recursive:true});
writeJson(configPath,{version:1,enabled:true,python:path.relative(state,python),revision,engine:'argos-en-zh-1.9'});
const result=await service.start(state);
if(!result?.ready)throw Error(`离线引擎未能启动，请查看本机 ${path.join(state,'engine.log')}。`);
console.log('离线翻译已就绪。首次启用时，在 Cursor 历史页选择以下连接文件：');
console.log(path.join(state,'connection.json'));
