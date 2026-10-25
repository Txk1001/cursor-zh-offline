import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

// PID alone is not an identity: the OS can reuse it after a crash.
export function startIdentity(pid) {
  if (process.platform === 'win32') {
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `$ErrorActionPreference='Stop'; (Get-Process -Id ${pid}).StartTime.ToUniversalTime().Ticks`],
    {encoding:'utf8', windowsHide:true, timeout:10000, stdio:['ignore','pipe','pipe']}).trim();
  }
  if (process.platform === 'linux') {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    return fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim() + ':' +
      stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
  }
  if (process.platform === 'darwin') {
    const value=execFileSync('/bin/ps',['-p',String(pid),'-o','lstart='],
      {encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe'],env:{...process.env,LC_ALL:'C',TZ:'UTC'}}).trim().replace(/\s+/g,' ');
    if(!/^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/.test(value))throw Error('无法读取 macOS 进程启动身份');
    // BSD ps has second precision. A PID reused within that same second is
    // conservatively treated as active, so the old lock is never reclaimed.
    return 'darwin-lstart:'+value;
  }
  throw Error('当前系统没有受支持的进程身份检查');
}

function diagnosis(file, reason) {
  return Error(`无法安全取得安装锁：${reason}。记录已保留：${file}\n` +
    '请关闭所有安装/恢复进程后核对该记录；仅在确认没有相关进程时，将这个明确路径的文件改名留存，再重试。不要批量删除状态目录。');
}

function readOwner(file) {
  let bytes;
  try { bytes = fs.readFileSync(file,'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw diagnosis(file,'无法读取持锁记录'); }
  let owner;
  try { owner = JSON.parse(bytes); }
  catch { throw diagnosis(file,'旧版或受损的持锁记录为空或不完整，不能确认持锁者'); }
  if (!owner || !Number.isSafeInteger(owner.pid) || owner.pid <= 0 ||
      (owner.version === 2 && (typeof owner.start !== 'string' || !owner.start || typeof owner.token !== 'string' || !owner.token))) {
    throw diagnosis(file,'持锁记录格式无效');
  }
  return owner;
}

function ownerIsActive(owner, file) {
  try { process.kill(owner.pid,0); }
  catch (error) {
    if (error.code === 'ESRCH') return false;
    throw diagnosis(file,'无法检查持锁进程的存活状态');
  }
  // A legacy live PID cannot safely be reclaimed without a start identity.
  if (owner.version !== 2) return true;
  try { return startIdentity(owner.pid) === owner.start; }
  catch {
    try { process.kill(owner.pid,0); }
    catch (error) { if (error.code === 'ESRCH') return false; }
    throw diagnosis(file,'无法确认持锁进程的启动身份');
  }
}

export function withInstallationLock(journalPath, action) {
  const lock = journalPath + '.lock';
  const claims = lock + '-claims';
  fs.mkdirSync(claims,{recursive:true});
  const token = crypto.randomUUID();
  const owner = {version:2,pid:process.pid,start:startIdentity(process.pid),token};
  const bytes = JSON.stringify(owner) + '\n';
  const claim = path.join(claims,token + '.owner.json');
  const temp = path.join(path.dirname(lock),'.installation-owner-' + token + '.tmp');
  let claimed = false, acquired = false;
  try {
    // Publish only a complete, flushed file. A crash during writing leaves an
    // unadvertised temporary file, never an empty lock or visible claim.
    const fd = fs.openSync(temp,'wx',0o600);
    try { fs.writeFileSync(fd,bytes); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    try { fs.linkSync(temp,claim); claimed = true; }
    catch { throw diagnosis(claim,'文件系统不能原子发布持锁记录，请使用支持硬链接的本地文件系统'); }

    // Every contender publishes before checking others. A later contender sees
    // the current claim and must stop. Concurrent contenders may both stop;
    // neither can enter the action concurrently. Dead claims remain evidence.
    for (const name of fs.readdirSync(claims)) {
      if (!name.endsWith('.owner.json') || name === path.basename(claim)) continue;
      const otherFile = path.join(claims,name), other = readOwner(otherFile);
      if (other && ownerIsActive(other,otherFile)) throw Error('另一个安装或恢复进程仍在运行，请稍后重试');
    }
    const previous = readOwner(lock);
    if (previous) {
      if (ownerIsActive(previous,lock)) throw Error('另一个安装或恢复进程仍在运行，请稍后重试');
      // The live claim serializes stale-lock reclamation by current installers.
      // Do not run a legacy installer concurrently with this version.
      fs.unlinkSync(lock);
    }
    try { fs.linkSync(claim,lock); acquired = true; }
    catch (error) {
      if (error.code === 'EEXIST') throw Error('安装锁已由另一个进程取得，请稍后重试');
      throw diagnosis(lock,'无法发布安装锁');
    }
    return action();
  } finally {
    if (acquired) {
      const current = readOwner(lock);
      if (current?.token === token) fs.unlinkSync(lock);
    }
    if (claimed) fs.unlinkSync(claim);
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
