import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';
import {injectRuntimeOverrides} from '../scripts/translate-install.mjs';
const overrides=JSON.parse(fs.readFileSync(new URL('../runtime-overrides.zh-cn.json',import.meta.url),'utf8'));
const dom=new JSDOM('<body><button id="open" aria-label="打开 Cursor 帐户"><span>Open</span></button><p id="ordinary">Open</p><code id="code">Open</code><textarea id="input">Open</textarea><div role="menu" id="menu" aria-label="Prompt input actions"></div></body>',{url:'https://fixture.invalid',runScripts:'outside-only',pretendToBeVisual:true});
try{
 dom.window.eval(injectRuntimeOverrides('',overrides));
 assert.equal(dom.window.document.querySelector('#open').textContent,'打开');
 for(const id of ['ordinary','code','input'])assert.equal(dom.window.document.getElementById(id).textContent,'Open');
 assert.equal(dom.window.document.getElementById('menu').getAttribute('aria-label'),'输入操作');
 const button=dom.window.document.createElement('button');button.textContent='Open';dom.window.document.body.append(button);
 await new Promise(r=>setTimeout(r,70));assert.equal(button.textContent,'打开');
 console.log('设置可见 Open、动态按钮、辅助功能标签及内容保护：通过');
}finally{dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.__cursorZhCnRuntimeTextObserver?.disconnect();dom.window.close()}
