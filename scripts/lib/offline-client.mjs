// Serialized into the renderer. Credentials and text stay in this user's storage.
export function createOfflineClient(onChange) {
  const key='cursor.zh.offline.connection.v1', enabledKey='cursor.zh.offline.enabled.v1';
  const MAX_CHUNK=12000, MAX_SOURCE=240000, MAX_JOBS=128, MAX_CHARS=2000000;
  let connection=null,enabled=false,ready=false,working=false,button,loadButton,controller,generation=0,disposed=false,pumpTimer;
  const memo=new Map(),segments=new Map(),jobs=new Map(),pending=new Set();
  const hasFailures=()=>[...jobs.values()].some(job=>job.state==='failed')||[...memo.values()].some(result=>result.state==='retained');
  const valid=value=>value?.version===1&&value.type==='cursor-zh-offline'&&/^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})$/.test(value.url)&&Number(value.url.split(':').pop())<=65535&&/^[a-f0-9]{64}$/.test(value.token);
  try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(valid(saved)){connection=saved;enabled=localStorage.getItem(enabledKey)!=='false'}}catch{}
  function remember(map,source,value,limit){
    map.delete(source);map.set(source,value);
    let size=0;for(const [text,entry] of map)size+=text.length+(typeof entry==='string'?entry.length:entry.value.length);
    while(map.size>limit||size>MAX_CHARS){const [old,entry]=map.entries().next().value;size-=old.length+(typeof entry==='string'?entry.length:entry.value.length);map.delete(old)}
  }
  const render=()=>{
    if(disposed||!button)return;
    const failed=hasFailures();
    button.textContent=!connection?'启用离线翻译':!enabled?'离线翻译 · 已暂停':failed?'部分内容未译 · 点击重试':!ready?'离线翻译 · 点击重连':working?'正在离线翻译…':'离线翻译 · 已启用';
  };
  function schedulePump(){if(!pumpTimer&&!disposed)pumpTimer=setTimeout(()=>{pumpTimer=null;void pump()},50)}
  async function health(){
    if(disposed||!connection||!enabled)return false;
    const current=generation,endpoint=connection,wasReady=ready;
    let healthy=false;
    try{
      const response=await fetch(endpoint.url+'/health',{headers:{'X-Cursor-Zh-Token':endpoint.token},signal:AbortSignal.timeout(4000)});
      const value=await response.json();healthy=response.ok&&value.ready===true&&value.offline===true;
    }catch{}
    if(disposed||current!==generation||endpoint!==connection||!enabled)return false;
    ready=healthy;render();if(ready&&!wasReady){onChange();schedulePump()}return ready;
  }
  // Whitespace boundaries keep identifiers, paths and placeholders intact.
  // Backtick spans are indivisible, including an unfinished fenced block.
  function split(source){
    if(source.length>MAX_SOURCE)return {error:'段落超过 240,000 字符，请拆分后重试'};
    const tokens=source.match(/\x60\x60\x60[\s\S]*?(?:\x60\x60\x60|$)|\x60[^\x60\n]*\x60|\S+|\s+/g)||[];
    const chunks=[];let chunk='';
    for(const token of tokens){
      if(token.length>MAX_CHUNK)return {error:'连续内容超过单段限制，已保留原文以保护代码和变量'};
      if(chunk.length+token.length>MAX_CHUNK){chunks.push(chunk);chunk=''}
      chunk+=token;
    }
    if(chunk)chunks.push(chunk);
    return {parts:chunks.map(text=>{const lead=/^\s*/.exec(text)[0],tail=/\s*$/.exec(text)[0];const value=text.slice(lead.length,text.length-tail.length);return value?{source:value,lead,tail,value:segments.get(value)}:{literal:text}})};
  }
  function finishJobs(){
    for(const [source,job] of jobs){
      if(job.state!=='pending'||!job.parts.every(part=>part.literal!==undefined||part.value!==undefined))continue;
      const value=job.parts.map(part=>part.literal??part.lead+part.value+part.tail).join('');
      const retained=job.parts.some(part=>part.source&&/[A-Za-z]{2}/.test(part.source)&&part.value===part.source);
      // Do not replace half a paragraph when one segment fell back to English.
      const result={value:retained?source:value,state:retained?'retained':'complete',detail:retained?'引擎未能可靠翻译此段，已保留原文':''};
      remember(memo,source,result,128);jobs.delete(source);
    }
  }
  async function pump(){
    if(disposed||working||!ready||!enabled||!pending.size)return;
    working=true;render();
    const sources=[...pending].slice(0,8);sources.forEach(source=>pending.delete(source));
    const current=generation,request=new AbortController();controller=request;const timer=setTimeout(()=>request.abort(),90000);
    try{
      const response=await fetch(connection.url+'/translate',{method:'POST',headers:{'Content-Type':'application/json','X-Cursor-Zh-Token':connection.token},body:JSON.stringify({texts:sources}),signal:request.signal});
      const value=await response.json();
      if(!response.ok||!Array.isArray(value.translations)||value.translations.length!==sources.length||value.translations.some(t=>typeof t!=='string'||!t.length||t.length>60000))throw Error();
      if(current===generation&&!disposed){
        sources.forEach((source,i)=>{remember(segments,source,value.translations[i],256);for(const job of jobs.values())for(const part of job.parts)if(part.source===source)part.value=value.translations[i]});
        finishJobs();onChange();
      }
    }catch{
      if(current===generation&&!disposed){for(const job of jobs.values())if(job.parts.some(part=>sources.includes(part.source))){job.state='failed';job.detail='离线请求失败；点击“重试”后重新翻译'}ready=false;onChange()}
    }finally{
      clearTimeout(timer);
      if(controller===request){working=false;controller=null;render();if(pending.size&&ready&&enabled)schedulePump()}
    }
  }
  function get(source){
    if(memo.has(source)){const entry=memo.get(source);memo.delete(source);memo.set(source,entry);return entry.value}
    if(jobs.has(source))return null;
    if(!enabled)return null;
    const plan=split(source);
    if(plan.error){remember(memo,source,{value:source,state:'retained',detail:plan.error},128);render();return source}
    let chars=source.length;for(const text of jobs.keys())chars+=text.length;
    if(jobs.size>=MAX_JOBS||chars>MAX_CHARS)return null;
    jobs.set(source,{state:'pending',parts:plan.parts,detail:''});
    for(const part of plan.parts)if(part.source&&part.value===undefined)pending.add(part.source);
    finishJobs();schedulePump();return memo.get(source)?.value??null;
  }
  function status(source){
    return memo.get(source)||jobs.get(source)||{state:enabled?'waiting':'paused',detail:enabled?'正在等待翻译队列':'离线翻译已暂停'};
  }
  function release(source){
    jobs.delete(source);
    for(const chunk of pending)if(![...jobs.values()].some(job=>job.parts.some(part=>part.source===chunk)))pending.delete(chunk);
  }
  function resetRequests(){generation++;controller?.abort();controller=null;working=false;ready=false;pending.clear();jobs.clear();clearTimeout(pumpTimer);pumpTimer=null}
  async function retry(){
    resetRequests();
    for(const [source,result] of memo)if(result.state==='retained')memo.delete(source);
    segments.clear();await health();if(!disposed)onChange({retry:true});render();
  }
  function load(){
    const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
    input.onchange=async()=>{
      try{
        if(!input.files?.[0])return;
        const value=JSON.parse((await input.files[0].text()).replace(/^\uFEFF/,''));if(!valid(value))throw Error();
        resetRequests();memo.clear();segments.clear();connection=value;enabled=true;
        localStorage.setItem(key,JSON.stringify(value));localStorage.setItem(enabledKey,'true');await health();onChange({retry:true});
      }catch{if(button)button.textContent='连接文件有误，请重新选择'}
    };input.click();
  }
  function attach(shadow,style){
    button=document.createElement('button');button.style.cssText=style+'margin-left:6px';
    button.title='仅在本机翻译对话标题和正文；失败时保留整段原文，可重试';
    button.onclick=async()=>{
      if(!connection){load();return}
      if(enabled&&(!ready||hasFailures())){await retry();return}
      enabled=!enabled;localStorage.setItem(enabledKey,String(enabled));
      if(!enabled){resetRequests();onChange()}else{await health();onChange()}render();
    };
    loadButton=document.createElement('button');loadButton.textContent='连接文件';loadButton.title='选择本机离线引擎生成的 connection.json';loadButton.style.cssText=style+'margin-left:6px';loadButton.onclick=load;
    const notice=document.createElement('span');notice.textContent='自动译文 · 未校对';notice.style.cssText='font:12px system-ui;color:#aaa;margin-left:8px';notice.title='固定词典与人工导入优先；自动译文仍可能有误，请结合原文核对';
    shadow.append(button,loadButton,notice);render();
  }
  if(connection&&enabled)void health();
  const heartbeat=setInterval(()=>{if(enabled)void health()},30000);
  const dispose=()=>{disposed=true;enabled=false;resetRequests();clearInterval(heartbeat);memo.clear();segments.clear()};
  return {get,status,release,attach,dispose,ready:()=>ready,enabled:()=>enabled};
}
