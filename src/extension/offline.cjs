'use strict';
const fs=require('fs'), path=require('path'), http=require('http'), {spawn}=require('child_process');
function privateConnection(state){
  const value=JSON.parse(fs.readFileSync(path.join(state,'connection.json'),'utf8'));
  if(value.type!=='cursor-zh-offline'||!/^http:\/\/127\.0\.0\.1:\d+$/.test(value.url)||!/^[a-f0-9]{64}$/.test(value.token)) throw Error('Invalid offline connection');
  return value;
}
function request(connection,endpoint,method='GET'){
  return new Promise(resolve=>{
    const req=http.request(connection.url+endpoint,{method,headers:{'X-Cursor-Zh-Token':connection.token},timeout:2000},res=>{
      let text='';res.on('data',chunk=>{if(text.length<16000) text+=chunk});res.on('end',()=>{try{resolve(res.statusCode===200?JSON.parse(text):null)}catch{resolve(null)}});
    });
    req.on('error',()=>resolve(null));req.on('timeout',()=>{req.destroy();resolve(null)});req.end();
  });
}
async function health(state){try{return await request(privateConnection(state),'/health')}catch{return null}}
async function start(state){
  const configPath=path.join(state,'runtime.json');
  if(!fs.existsSync(configPath)) return {ready:false,reason:'not_installed'};
  const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
  if(config.enabled!==true) return {ready:false,reason:'disabled'};
  const existing=await health(state);if(existing?.ready)return existing;
  const lock=path.join(state,'start.lock');
  if(fs.existsSync(lock)&&Date.now()-fs.statSync(lock).mtimeMs>120000)fs.unlinkSync(lock);
  let fd;
  try{fd=fs.openSync(lock,'wx')}catch{return {ready:false,reason:'starting'}}
  try{
    const executable=path.resolve(state,config.python);
    if(!executable.startsWith(path.resolve(state)+path.sep)||!fs.existsSync(executable))throw Error('Offline runtime is missing');
    const log=fs.openSync(path.join(state,'engine.log'),'a');
    try{const child=spawn(executable,[path.join(state,'engine.py'),'--state',state],{detached:true,windowsHide:true,stdio:['ignore',log,log],env:{...process.env,PYTHONUTF8:'1',PYTHONUNBUFFERED:'1'}});child.on('error',()=>{});child.unref()}finally{fs.closeSync(log)}
    for(let i=0;i<60;i++){await new Promise(resolve=>setTimeout(resolve,500));const result=await health(state);if(result?.ready)return result}
    return {ready:false,reason:'start_failed'};
  }finally{fs.closeSync(fd);try{fs.unlinkSync(lock)}catch{}}
}
async function stop(state){try{return await request(privateConnection(state),'/stop','POST')}catch{return null}}
module.exports={start,stop,health};
