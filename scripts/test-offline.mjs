#!/usr/bin/env node
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {spawnSync} from 'node:child_process';
import {p,parseArgs} from './lib/util.mjs';
import {checkProtectionAndTerms} from '../tests/offline-integration-cases.mjs';
const {flags}=parseArgs();
assert.equal(typeof flags.state,'string','Pass --state with an isolated test installation; the user service must not be used.');
const state=path.resolve(flags.state);
for(const file of ['engine.py','terms.default.json','reviewed.zh-cn.json']) assert(fs.readFileSync(path.join(state,file)).equals(fs.readFileSync(p('offline',file))),`Stale ${file}: run setup-offline.mjs --state first.`);
const service=createRequire(import.meta.url)(p('src','extension','offline.cjs'));
assert((await service.start(state))?.ready);
try {
const connection=JSON.parse(fs.readFileSync(path.join(state,'connection.json'),'utf8'));
const headers={'Content-Type':'application/json','X-Cursor-Zh-Token':connection.token,Origin:'vscode-file://vscode-app'};
const samples=['Hello. How can I help you today?','Example conversation title','Please keep `const answer = 1;` unchanged.','Open https://example.com/docs and read the instructions.','const message = "Hello";','Keep the API key and model GPT unchanged.','The operation completed in 15 seconds.','```js\nconsole.log("Hello");\n```'];
const response=await fetch(connection.url+'/translate',{method:'POST',headers,body:JSON.stringify({texts:samples})});assert.equal(response.status,200);
const {translations}=await response.json();assert.equal(translations.length,samples.length);
assert(/[\u3400-\u9fff]/.test(translations[0]));assert(/[\u3400-\u9fff]/.test(translations[1]));
assert(translations[2].includes('`const answer = 1;`'));
assert(translations[3].includes('https://example.com/docs'));
assert.equal(translations[4],samples[4]);assert(translations[5].includes('API')&&translations[5].includes('GPT'));assert(translations[6].includes('15'));assert.equal(translations[7],samples[7]);
assert.equal(translations[2],'请保持 `const answer = 1;` 不变。');
assert.equal(translations[5],'保持 API 密钥和 GPT 模型不变。');
assert.equal(translations[6],'操作已完成，用时 15 秒。');
const varied=await fetch(connection.url+'/translate',{method:'POST',headers,body:JSON.stringify({texts:['The operation completed in 37.5 seconds.','Please keep `let result = 42;` unchanged.','Please try again.']})});
assert.deepEqual((await varied.json()).translations,['操作已完成，用时 37.5 秒。','请保持 `let result = 42;` 不变。','请重试。']);
const repeat=await fetch(connection.url+'/translate',{method:'POST',headers,body:JSON.stringify({texts:[samples[0]]})});assert.equal((await repeat.json()).translations[0],translations[0]);
assert.equal((await fetch(connection.url+'/health',{headers:{'X-Cursor-Zh-Token':'wrong'}})).status,403);
assert.equal((await fetch(connection.url+'/health',{headers:{...headers,Origin:'https://example.com'}})).status,403);
const runtime=JSON.parse(fs.readFileSync(path.join(state,'runtime.json'),'utf8'));
const blocked=spawnSync(path.resolve(state,runtime.python),[p('tests','offline-protection.test.py'),'--probe-state',state],{encoding:'utf8',windowsHide:true,env:{...process.env,PYTHONUTF8:'1'}});assert.equal(blocked.status,0,blocked.stderr);assert(blocked.stdout.includes('outbound-blocked'));
const edgeResults=await checkProtectionAndTerms(async texts=>{
  const result=[];
  for(let i=0;i<texts.length;i+=8){const batch=texts.slice(i,i+8);const response=await fetch(connection.url+'/translate',{method:'POST',headers,body:JSON.stringify({texts:batch})});assert.equal(response.status,200);const value=await response.json();assert.equal(value.translations.length,batch.length);result.push(...value.translations)}
  return result;
});
const report={engine:'argos-en-zh-1.9-bridge-3',translationSamples:translations,cache:'pass',unauthorizedRejected:true,foreignOriginRejected:true,outboundBlocked:true,...edgeResults};
if(typeof flags.report==='string'){const destination=path.resolve(flags.report);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n')}
console.log(JSON.stringify(report,null,2));
assert.equal(edgeResults.failures.length,0,'Offline protection or terminology regressions; see results.');
} finally { await service.stop(state); }
