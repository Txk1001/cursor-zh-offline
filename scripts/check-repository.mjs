import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import assert from 'node:assert/strict';import {p,readJson} from './lib/util.mjs';
const config=readJson(p('config.json')),pkg=readJson(p('package.json')),lock=readJson(p('package-lock.json'));
const actionLock=readJson(p('.github/actions-lock.json'));
assert.equal(actionLock.schema,1);
assert.deepEqual(actionLock.actions.map(a=>a.action).sort(),['actions/checkout','actions/setup-node','actions/setup-python','actions/upload-artifact'].sort());
for(const workflow of ['ci.yml','release.yml']) {
 const content=fs.readFileSync(p('.github','workflows',workflow),'utf8');
 for(const action of actionLock.actions) {
  assert.match(action.sha,/^[a-f0-9]{40}$/);
  assert.equal(action.runtime,'node24');
  assert(content.includes(`${action.action}@${action.sha} # ${action.tag}`),`${workflow}: Action 与审核锁记录不一致：${action.action}`);
 }
}
for(const version of [pkg.version,lock.version,lock.packages[''].version])assert.equal(version,config.version);
assert.notEqual(config.publisher,'polang233','Integrated release must use its own identity');
assert.equal(config.release.marketplaceEnabled,false);
for(const item of readJson(p('offline/licenses/manifest.json')).entries){const bytes=fs.readFileSync(p('offline/licenses',item.file));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256)}
const broken=[];
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)])}
const docs=['README.md','README-通用安装.md','AGENTS.md','CHANGELOG.md',...walk(p('docs')).filter(f=>f.endsWith('.md'))];
for(const file of docs){const full=path.isAbsolute(file)?file:p(file);for(const match of fs.readFileSync(full,'utf8').matchAll(/!?\[[^\]\r\n]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g)){const link=match[1];if(/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(link))continue;const rel=decodeURIComponent(link.split(/[?#]/)[0]);if(rel&&!fs.existsSync(path.resolve(path.dirname(full),rel)))broken.push(file+': '+link)}}
assert.deepEqual(broken,[]);
assert(fs.existsSync(p('tests/history-dom.test.mjs')));assert(fs.existsSync(p('.github/workflows/ci.yml')));
console.log('仓库版本、独立标识、许可哈希、维护入口及相对文档链接：通过');
