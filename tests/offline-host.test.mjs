import assert from 'node:assert/strict';import vm from 'node:vm';import path from 'node:path';
import {offlineHostBootstrap,offlineMainBootstrap} from '../scripts/lib/offline-host.mjs';
let starts=0,period=0;const context={require:id=>id==='node:fs'?{existsSync:()=>true}:id==='node:path'?path:id==='node:os'?{homedir:()=>'/fixture'}:{start:async state=>{assert(state.includes('cursor-language-pack'));starts++}},setInterval:(fn,ms)=>{period=ms;return {unref(){}}}};
vm.runInNewContext(offlineHostBootstrap('.cursor'),context);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(starts,1);assert.equal(period,30000);
vm.runInNewContext(offlineHostBootstrap('.cursor'),context);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(starts,1);
assert(!offlineHostBootstrap('.cursor').includes('connection.json'));
assert(offlineMainBootstrap('.cursor').includes('createRequire(import.meta.url)'));
console.log('应用宿主启动离线服务、重复启动保护和无凭据注入：通过');
