#!/usr/bin/env node
import assert from 'node:assert/strict';
import { normalizeHistoryText, validateHistoryCatalog, translateHistoryStatus, historyBootstrap } from './lib/history-localization.mjs';

const cases = [
  ['Worked for 2m 15s','耗时 2 分 15 秒'],
  ['Worked for 2m15s','耗时 2 分 15 秒'],
  ['Workedfor 2m 15s','耗时 2 分 15 秒'],
  ['Worked\nfor 2m 15s','耗时 2 分 15 秒'],
  ['worked for 1h','耗时 1 小时'],
  ['Thought 4s','思考用时 4 秒'],
  ['13h ago','13 小时前'],
  ['2 months ago','2 个月前'],
  ['1 search','1 次搜索'],
  ['Explored 3 searches','已查看 3 次搜索'],
  ['已查看 1 search','已查看 1 次搜索'],
  ['Skipped','已跳过'],
  ['briefly','片刻'],
  ['const text = "Skipped";','const text = "Skipped";']
];
for (const [source,translation] of cases) assert.equal(translateHistoryStatus(source),translation,source);
assert.equal(normalizeHistoryText(' This “text”\n has spaces '),'This "text" has spaces');
assert.throws(()=>validateHistoryCatalog({version:1,entries:[{source:'example',translation:''}]}));
assert.throws(()=>validateHistoryCatalog({version:1,entries:[{source:' A ',translation:'甲'},{source:'A',translation:'乙'}]}));
const personal = {version:1,entries:[{source:'PRIVATE_CANARY_SOURCE',translation:'PRIVATE_CANARY_TRANSLATION'}]};
const bootstrap = historyBootstrap(personal);
assert(!bootstrap.includes('PRIVATE_CANARY'));
assert(bootstrap.includes('localStorage.getItem(storageKey)'));
assert(bootstrap.includes('!badge?.isConnected'));
assert(bootstrap.includes('pre,code,a,img,input,textarea'));
assert(bootstrap.includes('127\\.0\\.0\\.1'));
assert(!bootstrap.includes('https://'));
assert(bootstrap.includes("'X-Cursor-Zh-Token'"));
console.log(`历史显示检查通过：${cases.length} 条状态用例、词典校验、私人内容隔离、按钮重建与代码保护。`);
