import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';
import {injectRuntimeOverrides,rewrite} from '../scripts/translate-install.mjs';
const overrides=JSON.parse(fs.readFileSync(new URL('../runtime-overrides.zh-cn.json',import.meta.url),'utf8'));
const dict=JSON.parse(fs.readFileSync(new URL('../src/i18n/zh-cn/hardcoded.json',import.meta.url),'utf8'));
assert.equal(rewrite('const title=`Open Browser`,id="browser.open";',dict).text,'const title=`打开浏览器`,id="browser.open";');
assert.equal(rewrite('const rpc={run:{name:"Run"}};',dict).text,'const rpc={run:{name:"Run"}};');
for(const title of ['Extend Cursor with Plugins','Connect External Tools with MCP','Teach Cursor New Skills','Delegate Work to Subagents','Guide Agent with Rules','Create Reusable Commands']){
 const source=`const card={title:${JSON.stringify(title)},id:"plugins",docsUrl:"https://fixture.invalid/plugins"};`;
 const patched=rewrite(source,dict).text;
 assert(patched.includes(JSON.stringify(dict[title])));
 assert(patched.includes('id:"plugins"'));assert(patched.includes('https://fixture.invalid/plugins'));
}
const dom=new JSDOM('<body><button id="open" aria-label="打开 Cursor 帐户"><span>Open</span></button><p id="ordinary">Open</p><code id="code">Open</code><textarea id="input">Open</textarea><div role="menu" id="menu" aria-label="Prompt input actions"></div></body>',{url:'https://fixture.invalid',runScripts:'outside-only',pretendToBeVisual:true});
try{
 dom.window.eval(injectRuntimeOverrides('',overrides));
 assert.equal(dom.window.document.querySelector('#open').textContent,'打开');
 for(const id of ['ordinary','code','input'])assert.equal(dom.window.document.getElementById(id).textContent,'Open');
 assert.equal(dom.window.document.getElementById('menu').getAttribute('aria-label'),'输入操作');
 const button=dom.window.document.createElement('button');button.textContent='Open';dom.window.document.body.append(button);
 await new Promise(r=>setTimeout(r,70));assert.equal(button.textContent,'打开');
 const box=dom.window.document.createElement('section');
 box.innerHTML='<button id="add"> + Add </button><p id="plain-add">Add</p><code id="code-add">Add</code><input id="add-value" value="Add"><button id="agent">Agent</button>';
 dom.window.document.body.append(box);
 await new Promise(r=>setTimeout(r,70));
 assert.equal(box.querySelector('#add').textContent,' + Add '); // '+' is a separate icon/node in Cursor.
 box.querySelector('#add').textContent=' Add ';
 await new Promise(r=>setTimeout(r,70));
 assert.equal(box.querySelector('#add').textContent,' 添加 ');
 assert.equal(box.querySelector('#plain-add').textContent,'Add');
 assert.equal(box.querySelector('#code-add').textContent,'Add');
 assert.equal(box.querySelector('#add-value').value,'Add');
 assert.equal(box.querySelector('#agent').textContent,'智能体');
 const approval=dom.window.document.createElement('div');approval.className='composer-assistant-message';
 approval.innerHTML='<p id="prose-run">Run</p><div data-tool-approval-gate><button id="gate-run"><span>Run</span><kbd>⏎</kbd><svg><text>↵</text></svg></button><button id="gate-always">Always Run</button><button id="gate-named">Always Run \'npm test\' + 2</button></div>';
 dom.window.document.body.append(approval);await new Promise(r=>setTimeout(r,70));
 assert.equal(approval.querySelector('#prose-run').textContent,'Run');
 assert.equal(approval.querySelector('#gate-run span').textContent,'运行');
 assert.equal(approval.querySelector('kbd').textContent,'⏎');assert.equal(approval.querySelector('svg').textContent,'↵');
 assert.equal(approval.querySelector('#gate-always').textContent,'始终允许运行');
 assert.equal(approval.querySelector('#gate-named').textContent,"始终允许运行 'npm test' + 2");
 console.log('设置可见 Open、动态按钮、辅助功能标签及内容保护：通过');
}finally{dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.__cursorZhCnRuntimeTextObserver?.disconnect();dom.window.close()}
