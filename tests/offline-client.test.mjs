import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createOfflineClient} from '../scripts/lib/offline-client.mjs';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){const end=Date.now()+7000;while(!check()){assert.ok(Date.now()<end,'Timed out: '+label);await wait(20)}}
function fixture(translate=texts=>texts.map(text=>'译文：'+text)){
  const dom=new JSDOM('<body></body>',{url:'https://fixture.invalid',runScripts:'outside-only'}),{window}=dom;
  const connection={version:1,type:'cursor-zh-offline',url:'http://127.0.0.1:49152',token:'a'.repeat(64)};
  window.localStorage.setItem('cursor.zh.offline.connection.v1',JSON.stringify(connection));
  window.AbortSignal=AbortSignal;window.AbortController=AbortController;
  const requests=[],events=[];
  const state={translate,healthy:true};
  window.fetch=async(url,options)=>{
    assert.equal(options.headers['X-Cursor-Zh-Token'],connection.token);
    assert.ok(url.startsWith(connection.url+'/'),'Translation may only use the configured loopback endpoint');
    if(url.endsWith('/health'))return {ok:true,json:async()=>({ready:state.healthy,offline:true})};
    const texts=JSON.parse(options.body).texts;requests.push(texts);
    assert.ok(texts.length<=8&&texts.every(text=>text.length<=12000),'Backend batch and text limits');
    return {ok:true,json:async()=>({translations:await state.translate(texts,options.signal)})};
  };
  const client=window.eval('('+createOfflineClient.toString()+')')(event=>events.push(event));
  const controls=window.document.createElement('div');window.document.body.append(controls);client.attach(controls,'');
  return {client,controls,requests,events,state,close(){client.dispose();window.close()}};
}

{
  const f=fixture(texts=>texts.map(text=>text.replaceAll('word','词')));
  try{
    await until(()=>f.client.ready(),'health');
    const source='  '+('word '.repeat(2399))+'{{name}} $HOME `npm install` 中文原文 '+Array.from({length:18000},(_,i)=>'word'+i+' ').join('')+' \n';
    assert.equal(f.client.get(source),null);
    await until(()=>f.client.status(source).state==='complete','all long paragraph chunks');
    assert.equal(f.client.get(source),source.replaceAll('word','词'),'Chunk joins preserve whitespace and Chinese content');
    const chunks=f.requests.flat();
    for(const token of ['{{name}}','$HOME','`npm install`','中文原文'])assert.equal(chunks.filter(text=>text.includes(token)).length,1,'Never split protected token '+token);
    assert.ok(f.requests.length>=2&&f.requests.some(batch=>batch.length===8));
    const count=f.requests.length;assert.equal(f.client.get(source),source.replaceAll('word','词'));await wait(70);assert.equal(f.requests.length,count,'Cached paragraphs do not issue new requests');
    const tooLong='x'.repeat(240001);assert.equal(f.client.get(tooLong),tooLong);assert.match(f.client.status(tooLong).detail,/240,000/);
    const indivisible='`'+'x'.repeat(12001)+'`';assert.equal(f.client.get(indivisible),indivisible);assert.match(f.client.status(indivisible).detail,/保护代码/);
    assert.match(f.controls.firstChild.textContent,/点击重试/,'Retained paragraphs expose a retry control');
  }finally{f.close()}
}

{
  let rejected=true;
  const f=fixture(texts=>{if(rejected)throw Error('Simulated service failure');return texts.map(text=>'已翻译：'+text)});
  try{
    await until(()=>f.client.ready(),'health');
    f.client.get('Please continue after a transient failure.');
    await until(()=>f.client.status('Please continue after a transient failure.').state==='failed','failed request state');
    assert.equal(f.client.get('Please continue after a transient failure.'),null);
    assert.match(f.controls.firstChild.textContent,/点击重试/);
    rejected=false;f.controls.firstChild.click();
    await until(()=>f.events.some(event=>event?.retry),'retry notification');
    f.client.get('Please continue after a transient failure.');
    await until(()=>f.client.status('Please continue after a transient failure.').state==='complete','retry success');
    assert.equal(f.client.get('Please continue after a transient failure.'),'已翻译：Please continue after a transient failure.');
  }finally{f.close()}
}

{
  const f=fixture(texts=>texts.map((text,i)=>i===0?'译文：'+text:text));
  try{
    await until(()=>f.client.ready(),'health');
    const source='Long paragraph with protected technical content. '.repeat(600);
    f.client.get(source);await until(()=>f.client.status(source).state==='retained','retained segment');
    assert.equal(f.client.get(source),source,'A failed segment must retain the entire original paragraph');
    assert.match(f.controls.firstChild.textContent,/点击重试/);
  }finally{f.close()}
}

{
  const f=fixture();
  try{
    await until(()=>f.client.ready(),'health');
    const sources=Array.from({length:129},(_,i)=>'Pending paragraph '+i);
    sources.forEach(source=>f.client.get(source));
    assert.equal(sources.filter(source=>f.client.status(source).state==='pending').length,128,'Job queue is bounded');
    assert.equal(f.client.status(sources[128]).state,'waiting');
    f.client.release(sources[0]);f.client.get(sources[128]);assert.equal(f.client.status(sources[128]).state,'pending','Removing a paragraph frees capacity');
    f.client.dispose();await wait(80);assert.equal(f.requests.length,0,'Dispose cancels scheduled work');
  }finally{f.close()}
}

{
  const f=fixture();
  try{
    await until(()=>f.client.ready(),'health');
    // Each job is legal by itself; total queued source text is capped at 2M.
    const large=Array.from({length:12},(_,i)=>'Unique '+i+' '+('word '.repeat(39999)));
    large.forEach(source=>f.client.get(source));
    assert.ok(large.filter(source=>f.client.status(source).state==='pending').length<=10,'Queue has a character budget as well as a job budget');
  }finally{f.close()}
}

{
  const f=fixture();
  try{
    await until(()=>f.client.ready(),'health');
    for(let batch=0;batch<3;batch++){
      const sources=Array.from({length:90},(_,i)=>'Cache paragraph '+(batch*90+i));sources.forEach(source=>f.client.get(source));
      await until(()=>sources.every(source=>f.client.status(source).state==='complete'),'cache batch '+batch);
    }
    assert.equal(f.client.status('Cache paragraph 0').state,'waiting','Paragraph memo evicts old entries');
    const count=f.requests.length;
    f.client.get('Cache paragraph 0');await until(()=>f.client.status('Cache paragraph 0').state==='complete','evicted chunk');
    assert.ok(f.requests.length>count,'Segment cache also evicts old entries');
  }finally{f.close()}
}

{
  let resolveTranslation;
  const f=fixture(()=>new Promise(resolve=>{resolveTranslation=resolve}));
  try{
    await until(()=>f.client.ready(),'health');
    f.client.get('This request will be paused.');await until(()=>resolveTranslation,'request in flight');
    f.controls.firstChild.click();assert.equal(f.client.enabled(),false);const count=f.events.length;
    resolveTranslation(['迟到的译文']);await wait(70);
    assert.equal(f.events.length,count,'A response from an old generation must not update the renderer');
    assert.equal(f.client.get('This request will be paused.'),null);assert.equal(f.client.status('This request will be paused.').state,'paused');
  }finally{f.close()}
}

console.log('离线客户端：长段落完整拼接、中文/占位符边界、8×12000 请求限制、整段失败保留/重试、队列与缓存上限、取消和过期响应保护通过');
