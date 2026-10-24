import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {injectSettingsLabels,translateSettingsLabel} from '../scripts/lib/settings-labels.mjs';

const labels=JSON.parse(fs.readFileSync(new URL('../src/i18n/zh-cn/settings-labels.json',import.meta.url),'utf8'));
for(const [input,expected] of [
  ['Blame › Editor Decoration','行追溯 › 编辑器标记'],
  ['Force Disabled','强制禁用'],['Font Size','字号'],
  ['Unknown Extension › Font Size','Unknown Extension › 字号'],
  ['editor.fontSize','editor.fontSize'],['${subject}, ${authorName}','${subject}, ${authorName}'],
  ['EnabledInCode','EnabledInCode'],['未知设置','未知设置'],[null,null]
]) assert.equal(translateSettingsLabel(input,labels),expected);
const source=`globalThis.setting={key:'git.blame.editorDecoration.enabled',value:'Enabled'};
globalThis.item=new(class {
 constructor(){this._displayCategory=null;this._displayLabel=null;this.setting=setting}
 get displayCategory(){return this._displayCategory||this.initLabels(),this._displayCategory}get displayLabel(){return this._displayLabel||this.initLabels(),this._displayLabel}
 initLabels(){this._displayCategory='Blame › Editor Decoration';this._displayLabel='Enabled'}
})();`;
const patched=injectSettingsLabels(source,labels),context=vm.createContext({});
vm.runInContext(patched,context);
assert.equal(context.item.displayCategory,'行追溯 › 编辑器标记');
assert.equal(context.item.displayLabel,'启用');
assert.equal(context.item._displayLabel,'Enabled');
assert.equal(context.item.setting.key,'git.blame.editorDecoration.enabled');
assert.equal(context.item.setting.value,'Enabled');
assert.equal(injectSettingsLabels(patched,labels),patched);
assert.equal(injectSettingsLabels('const unrelated="Font Size"',labels),'const unrelated="Font Size"');
assert.throws(()=>injectSettingsLabels('void("span.setting-item-label");',labels),/入口已变化/);
assert.throws(()=>injectSettingsLabels(source+source,labels),/入口已变化/);
assert.throws(()=>injectSettingsLabels(source,{Enabled:''}),/无效/);
console.log('设置可见标题、缓存原文、技术键值及未知入口拒绝：通过');
