#!/usr/bin/env node
// Only public runtime metadata is recorded; never dump the environment or paths.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {p,parseArgs} from './lib/util.mjs';
const {flags}=parseArgs();
const git=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true});
assert.equal(git.status,0,'Cannot identify tested source commit');
const commit=git.stdout.trim();assert.match(commit,/^[a-f0-9]{40}$/);
const status=spawnSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8',windowsHide:true});
assert.equal(status.status,0,'Cannot identify source changes');
const python=spawnSync('python',['-c','import json,platform;print(json.dumps({"version":platform.python_version(),"architecture":platform.machine()}))'],{encoding:'utf8',windowsHide:true});
assert.equal(python.status,0,'Cannot identify Python test runtime');
const runtime=JSON.parse(python.stdout);
const record={schema:1,commit,dirty:Boolean(status.stdout.trim()),platform:process.platform,architecture:process.arch,systemRelease:os.release(),node:process.version,python:runtime,
  scope:'Maintenance tests and standard language pack build. Native Cursor UI is not tested by this record.',
  fullPatchSupport:'Windows x64 only; this workflow does not admit macOS or Linux.'};
const destination=p('reports','ci-test-environment.json');
fs.mkdirSync(path.dirname(destination),{recursive:true});
// Save observed values even when an expectation fails, for failure artifacts.
fs.writeFileSync(destination,JSON.stringify(record,null,2)+'\n');
if(process.env.GITHUB_ACTIONS==='true')assert.equal(record.dirty,false,'CI source has uncommitted changes');
assert.equal(process.platform,flags.platform,'Unexpected OS');
assert.equal(process.arch,flags.arch,'Unexpected Node architecture');
assert.equal(process.versions.node.split('.')[0],flags['node-major'],'Unexpected Node major version');
const machine=runtime.architecture.toLowerCase();
assert((flags.arch==='arm64'?['arm64','aarch64']:['amd64','x86_64']).includes(machine),'Python architecture differs from target');
assert.equal(runtime.version,fs.readFileSync(p('.python-version'),'utf8').trim(),'Unexpected Python version');
console.log(JSON.stringify(record,null,2));
