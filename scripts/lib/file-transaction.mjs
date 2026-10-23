import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const digest = file => fs.existsSync(file) ? hash(fs.readFileSync(file)) : null;
const inside = (root, file) => { const rel = path.relative(path.resolve(root), path.resolve(file)); return rel && !rel.startsWith('..') && !path.isAbsolute(rel); };

// Replacement happens only after a complete, flushed and verified sibling file exists.
// A partial write can damage the temporary file, never the installed destination.
export function writeFileAtomic(file, bytes) {
  bytes = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  fs.mkdirSync(path.dirname(file), {recursive:true});
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.cursor-zh-${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temp, bytes, {flag:'wx', mode:fs.existsSync(file) ? fs.statSync(file).mode : 0o600});
    if (digest(temp) !== hash(bytes)) throw Error('临时文件校验失败');
    const fd = fs.openSync(temp, 'r+');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}

const saveJournal = (file, value) => writeFileAtomic(file, JSON.stringify(value,null,2)+'\n');

function withLock(journalPath, action) {
  const lock=journalPath+'.lock';fs.mkdirSync(path.dirname(lock),{recursive:true});
  if(fs.existsSync(lock)){
    const owner=JSON.parse(fs.readFileSync(lock,'utf8'));
    let alive=true;
    try{process.kill(owner.pid,0)}catch(error){if(error.code==='ESRCH')alive=false}
    if(alive)throw Error('另一个安装或恢复进程仍在运行，请稍后重试');
    fs.unlinkSync(lock);
  }
  const fd=fs.openSync(lock,'wx',0o600);
  try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));return action()}
  finally{fs.closeSync(fd);fs.unlinkSync(lock)}
}

export function recoverFileTransaction(options) {
  return withLock(options.journalPath,()=>recoverUnlocked(options));
}

function recoverUnlocked({journalPath, appRoot, ledgerPath, commit}) {
  if (!fs.existsSync(journalPath)) return {recovered:false, complete:true, failures:[]};
  const journal = JSON.parse(fs.readFileSync(journalPath,'utf8'));
  if (journal.version !== 1 || journal.appRoot !== path.resolve(appRoot) || journal.commit !== commit || !Array.isArray(journal.operations)) {
    throw Error('未完成安装事务与当前应用版本不符，保留记录并停止写入');
  }
  const snapshotRoot = path.join(path.dirname(journalPath),'transactions');
  for (const entry of journal.operations) {
    if ((!inside(appRoot,entry.file) && path.resolve(entry.file) !== path.resolve(ledgerPath)) || !inside(snapshotRoot,entry.snapshot)) throw Error('安装事务路径不在允许范围内');
  }
  if (journal.status === 'committed') { fs.unlinkSync(journalPath); return {recovered:false,complete:true,failures:[]}; }
  if (journal.status !== 'prepared') throw Error('未知安装事务状态');
  const failures=[];
  for (const entry of [...journal.operations].reverse()) {
    try {
      const current=digest(entry.file);
      if(current===entry.before)continue;
      if(current!==entry.after)throw Error('文件已被其他程序修改，保留现场');
      if(entry.before===null)fs.unlinkSync(entry.file);
      else {
        if(digest(entry.snapshot)!==entry.before)throw Error('操作前快照损坏或缺失');
        writeFileAtomic(entry.file,fs.readFileSync(entry.snapshot));
      }
      if(digest(entry.file)!==entry.before)throw Error('恢复后校验失败');
    } catch(error) { failures.push({file:entry.file,reason:error.message}); }
  }
  if(!failures.length)fs.unlinkSync(journalPath);
  return {recovered:true,complete:failures.length===0,failures};
}

// The durable journal includes every destination BEFORE the first replacement.
// Snapshots retain the previous patched version on failed upgrades, not just the
// original vendor bytes. A subsequent invocation can recover after process exit.
export function applyFileTransaction(options) {
  return withLock(options.journalPath,()=>applyUnlocked(options));
}

function applyUnlocked({journalPath,appRoot,ledgerPath,commit,operations}) {
  const options={journalPath,appRoot,ledgerPath,commit};
  const pending=recoverUnlocked(options);
  if(!pending.complete)throw Error('先前安装事务尚未恢复：'+JSON.stringify(pending.failures));
  const snapshotDir=path.join(path.dirname(journalPath),'transactions',crypto.randomUUID());
  const entries=[];
  for(const [index,operation] of operations.entries()) {
    const file=path.resolve(operation.file);
    if(!inside(appRoot,file)&&file!==path.resolve(ledgerPath))throw Error('安装目标超出应用和记录范围');
    if(entries.some(e=>e.file===file))throw Error('安装事务包含重复目标');
    const before=fs.existsSync(file)?fs.readFileSync(file):null;
    if(operation.expectedBefore!==undefined && (before===null?null:hash(before))!==operation.expectedBefore)throw Error('准备期间文件发生变化：'+file);
    const snapshot=path.join(snapshotDir,`${index}.before`);
    if(before!==null)writeFileAtomic(snapshot,before);
    entries.push({file,before:before===null?null:hash(before),after:hash(operation.bytes),snapshot});
  }
  const journal={version:1,status:'prepared',appRoot:path.resolve(appRoot),commit,operations:entries};
  saveJournal(journalPath,journal);
  try {
    for(const [index,entry] of entries.entries()) {
      if(digest(entry.file)!==entry.before)throw Error('写入前文件发生变化：'+entry.file);
      writeFileAtomic(entry.file,operations[index].bytes);
      if(digest(entry.file)!==entry.after)throw Error('写入后校验失败：'+entry.file);
    }
    saveJournal(journalPath,{...journal,status:'committed'});
  } catch(error) {
    let recovery;
    try { recovery=recoverUnlocked(options); }
    catch(recoveryError) { recovery={complete:false,failures:[{reason:recoveryError.message}]}; }
    const message=recovery.complete?'写入失败；已核验所有目标恢复到操作前状态。':'写入失败；恢复未完成，事务记录和快照已保留，请排除原因后重试。';
    throw Object.assign(new Error(message+'\n'+error.message),{recovery,journalPath});
  }
  // A committed journal left by an interrupted cleanup is safe to clear next time.
  try { fs.unlinkSync(journalPath); } catch { /* committed on disk */ }
  return {complete:true,files:entries.length};
}
