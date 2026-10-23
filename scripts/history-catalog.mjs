#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from './lib/util.mjs';
import { findCursorInstall, readCursorInfo } from './lib/cursor-paths.mjs';
import { readHistoryCatalog, validateHistoryCatalog, normalizeHistoryText } from './lib/history-localization.mjs';

const {flags} = parseArgs();
const install = findCursorInstall();
const folder = install ? readCursorInfo(install.appRoot).dataFolderName : '.cursor';
const target = path.join(os.homedir(),folder,'cursor-language-pack','history-translations.zh-cn.json');
if (!flags.import) { console.log(`个人历史译文文件：${target}\n合并译文：node scripts/history-catalog.mjs --import="译文.json"\n然后在 Cursor 右下角点击“导入译文”，选择此文件。无需重新应用汉化。`); }
else {
  const input = validateHistoryCatalog(JSON.parse(fs.readFileSync(path.resolve(String(flags.import)),'utf8').replace(/^\uFEFF/,'')));
  const previous = readHistoryCatalog(target);
  const entries = new Map(previous.entries.map(e => [normalizeHistoryText(e.source),e]));
  input.entries.forEach(e=>entries.set(normalizeHistoryText(e.source),e));
  fs.mkdirSync(path.dirname(target),{recursive:true});
  if (fs.existsSync(target)) fs.copyFileSync(target,target+'.'+Date.now()+'.bak');
  fs.writeFileSync(target,JSON.stringify({version:1,entries:[...entries.values()]},null,2)+'\n',{mode:0o600});
  console.log(`已导入 ${input.entries.length} 条，个人词典共 ${entries.size} 条。原始会话记录保持完整。\n${target}`);
}
