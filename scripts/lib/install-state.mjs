import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { writeFileAtomic } from './file-transaction.mjs';

const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export function findVersionedVsix(dir, name, version) {
  const file = path.join(dir,`${name}-${version}.vsix`);
  return fs.existsSync(file) ? file : null;
}

export function activeExtensionNames(dir) {
  if (!fs.existsSync(dir)) return [];
  const marker = path.join(dir,'.obsolete');
  const obsolete = fs.existsSync(marker) ? JSON.parse(fs.readFileSync(marker,'utf8')) : {};
  return fs.readdirSync(dir,{withFileTypes:true}).filter(entry => entry.isDirectory() && !obsolete[entry.name]).map(entry => entry.name);
}

// Keep unrecovered records, including missing/corrupt backups. Backups are kept
// after restoration so an interrupted ledger write remains safely retryable.
export function restoreTrackedFiles(files, targetFor) {
  const remaining = {}, failures = [], planned = [];
  let restored = 0, alreadyOriginal = 0;
  for (const [rel, entry] of Object.entries(files ?? {})) {
    try {
      const target = targetFor(rel);
      const current = fs.existsSync(target) ? digest(target) : null;
      if (current === entry.original) { alreadyOriginal++; continue; }
      if (current && current !== entry.patched) throw Error('文件已被其他程序修改');
      if (!entry.backup || !fs.existsSync(entry.backup)) throw Error('原始备份不存在');
      if (digest(entry.backup) !== entry.original) throw Error('原始备份校验失败');
      planned.push({rel, entry, target});
    } catch (error) { remaining[rel] = entry; failures.push({rel, reason:error.message}); }
  }
  for (const {rel, entry, target} of planned) {
    try {
      const current = fs.existsSync(target) ? digest(target) : null;
      if (current && current !== entry.patched) throw Error('预检后文件发生变化');
      writeFileAtomic(target, fs.readFileSync(entry.backup));
      if (digest(target) !== entry.original) throw Error('恢复后的文件校验失败');
      restored++;
    } catch (error) { remaining[rel] = entry; failures.push({rel, reason:error.message}); }
  }
  return {remaining, failures, restored, alreadyOriginal, complete:failures.length === 0};
}

export function finalizeInstallation({packNeeded, vsix, cli, installPack, setLocale}) {
  const stages = {languagePack:packNeeded ? 'pending' : 'complete', displayLanguage:'pending'};
  const failures = [];
  try {
    if (packNeeded) {
      if (!vsix) throw Error('缺少配套 VSIX');
      if (!cli) throw Error('未找到 Cursor 命令行入口');
      if (!installPack()) throw Error('配套语言包安装失败');
      stages.languagePack = 'complete';
    }
  } catch (error) { stages.languagePack = 'failed'; failures.push(error.message); }
  if (stages.languagePack === 'complete') {
    try { setLocale(); stages.displayLanguage = 'complete'; }
    catch (error) { stages.displayLanguage = 'failed'; failures.push('显示语言设置失败：'+error.message); }
  } else stages.displayLanguage = 'skipped';
  return {stages, failures, complete:failures.length === 0};
}
