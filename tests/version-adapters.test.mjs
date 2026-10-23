import assert from 'node:assert/strict';import vm from 'node:vm';
import {injectRuntimeOverrides} from '../scripts/translate-install.mjs';
for(const anchor of ['const Te=j?M?"":ciy:M?"":K?.text??"";','const Ce=j?M?"":uyy:M?"":V?.text??"";','const Ce=j?M?"":qky:M?"":V?.text??"";']){
  const source='void({"data-component":"glass-empty-state-rotating-tips"});'+anchor;
  const patched=injectRuntimeOverrides(source,{'Example tip':'示例提示'});
  assert(patched.includes('=globalThis.__cursorZhCnTranslateUiText('));new vm.Script(patched);
}
assert.throws(()=>injectRuntimeOverrides('void({"data-component":"glass-empty-state-rotating-tips"});',{'Example':'示例'}),/入口已变化/);
console.log('已知轮播提示版本入口、生成语法与未知入口拒绝：通过');
