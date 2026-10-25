import fs from 'node:fs';
import { createOfflineClient } from './offline-client.mjs';

export function normalizeHistoryText(value) {
  return value.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
}

export function validateHistoryCatalog(value) {
  if (value?.version !== 1 || !Array.isArray(value.entries)) throw new Error('历史译文必须为 version: 1 和 entries 数组。');
  const entries = value.entries.map((entry) => {
    if (typeof entry.source !== 'string' || typeof entry.translation !== 'string' || !entry.source.trim() || !entry.translation.trim()) throw new Error('每条历史译文需要非空 source、translation。');
    if (entry.source.length > 30000 || entry.translation.length > 60000) throw new Error('请按段落拆分过长的历史译文。');
    return { source: entry.source, translation: entry.translation };
  });
  if (new Set(entries.map(e => normalizeHistoryText(e.source))).size !== entries.length) throw new Error('历史译文原文重复。');
  return { version: 1, entries };
}

export function readHistoryCatalog(file) {
  return fs.existsSync(file) ? validateHistoryCatalog(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))) : { version: 1, entries: [] };
}

export function translateHistoryStatus(value) {
  const duration = s => s.replace(/([a-z])(?=\d)/gi,'$1 ').replace(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s|days?|d)(?=\s|$)/gi, (_, n, u) => n + ({h:' 小时',m:' 分',s:' 秒',d:' 天'}[u[0].toLowerCase()])).replace(/\s+/g,' ').trim();
  let m = /^(Worked\s*for|Thought\s*for|Thought)\s+((?:\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s|days?|d)\s*)+)$/i.exec(value);
  if (m) return (m[1].replace(/\s/g,'').toLowerCase() === 'workedfor' ? '耗时 ' : '思考用时 ') + duration(m[2]);
  m = /^(\d+)\s*(s|m|h|d|w|mo|y|seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago$/i.exec(value);
  if (m) {
    const unit=m[2].toLowerCase();
    const units={s:'秒',m:'分钟',h:'小时',d:'天',w:'周',mo:'个月',y:'年',second:'秒',minute:'分钟',hour:'小时',day:'天',week:'周',month:'个月',year:'年'};
    return m[1] + ' ' + (units[unit] ?? units[unit.replace(/s$/,'')]) + '前';
  }
  m = /^(?:(Explored|已查看)\s*)?(\d+)\s+search(?:es)?$/.exec(value);
  if (m) return (m[1] ? '已查看 ' : '') + m[2] + ' 次搜索';
  return ({Skipped:'已跳过',Asked:'已提问',Asking:'正在提问',Done:'已完成',briefly:'片刻','Just now':'刚刚',Today:'今天',Yesterday:'昨天'})[value] ?? value;
}

// This function is serialized into Cursor. It only changes visible text nodes.
// Catalogs stay in each user's private state directory and are never packaged.
export function normalizeHistoryControlOptions(options = {}) {
  const mode=options.mode ?? 'compact',position=options.position ?? 'top-right';
  if(!['compact','expanded'].includes(mode))throw Error('翻译控件模式必须为 compact 或 expanded');
  if(!['top-right','top-left','bottom-right','bottom-left'].includes(position))throw Error('翻译控件位置无效');
  return {mode,position};
}

export function installHistoryOverlay(statusFormatter, offlineFactory, technicalTerms = [], uiOptions = {}) {
  globalThis.__cursorZhCnHistoryStatus = statusFormatter;
  if (typeof document === 'undefined' || globalThis.__cursorZhHistoryOverlay) return;
  globalThis.__cursorZhHistoryOverlay = true;
  const normalize = value => value.replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/\s+/g,' ').trim();
  const storageKey = 'cursor.zh.history.translations.v1';
  let dictionary = new Map();
  const acceptCatalog = value => {
    if (value?.version !== 1 || !Array.isArray(value.entries) || value.entries.some(e => typeof e.source !== 'string' || typeof e.translation !== 'string' || !e.source.trim() || !e.translation.trim() || e.source.length > 30000 || e.translation.length > 60000)) throw Error('译文文件格式不正确');
    const next = new Map(value.entries.map(e => [normalize(e.source),e.translation]));
    if(next.size !== value.entries.length) throw Error('译文原文重复');
    dictionary = next;
  };
  try { const saved = localStorage.getItem(storageKey); if(saved) acceptCatalog(JSON.parse(saved)); } catch {}
  const protectedSelector = 'script,style,pre,code,kbd,svg,a,img,input,textarea,[contenteditable]:not([contenteditable="false"]),[data-tool-approval-gate],.view-lines,.xterm-rows,.explorer-folders-view,.search-view';
  const paragraphSelector = 'p,li,blockquote,h1,h2,h3,h4,h5,h6,span,div,button';
  const changes = new Map();
  const owners = new WeakMap(), dirtyRoots = new Set(), candidates = new Set(), waiting = new Map(), timers = new Map();
  const waitingSource = new WeakMap(), issues = new Map();
  const MAX_WAITING_SOURCES=128, MAX_WAITING_ELEMENTS=512, MAX_WAITING_CHARS=2000000;
  let historyCount = 0, wasEnabled = false, queuedCount = 0;
  let showChinese = true, badge, issueBadge, historyHost, scheduled = false, disposed = false;
  let disposeControls=()=>{},repositionControls=()=>{};
  function mountControls(host,shadow){
    const positions=['top-right','top-left','bottom-right','bottom-left'];
    const initial={mode:uiOptions.mode==='expanded'?'expanded':'compact',position:positions.includes(uiOptions.position)?uiOptions.position:'top-right'};
    const defaultsKey=initial.mode+'|'+initial.position,preferenceKey='cursor.zh.history.controls.v1';
    let preference;try{preference=JSON.parse(localStorage.getItem(preferenceKey)||'null')}catch{}
    const saved=preference?.defaultsKey===defaultsKey?preference:null;
    let position=positions.includes(saved?.position)?saved.position:initial.position;
    let point=Number.isFinite(saved?.point?.x)&&Number.isFinite(saved?.point?.y)?saved.point:null;
    let expanded=(saved?.mode||initial.mode)==='expanded';
    host.style.cssText='position:fixed;z-index:2147483000;display:flex;flex-direction:column;align-items:flex-end;gap:6px;max-width:calc(100vw - 16px);';
    const handle=document.createElement('div');handle.style.cssText='display:flex;gap:3px;align-items:center;';
    const grip=document.createElement('button');grip.textContent='↕';grip.setAttribute('aria-label','拖动翻译控件');grip.title='拖动这里调整位置';grip.style.cssText='touch-action:none;cursor:move;font:12px system-ui;padding:4px 5px;color:#ddd;background:#252525;border:1px solid #555;border-radius:12px';
    const launcher=document.createElement('button');launcher.dataset.historyControlsToggle='true';launcher.style.cssText='font:12px system-ui;padding:4px 8px;color:#ddd;background:#252525;border:1px solid #555;border-radius:12px';
    const panel=document.createElement('div');panel.dataset.historyControlsPanel='true';panel.style.cssText='flex-wrap:wrap;align-items:center;gap:6px;padding:8px;max-width:min(480px,calc(100vw - 32px));max-height:65vh;overflow:auto;background:#252525;border:1px solid #555;border-radius:12px;box-shadow:0 4px 18px #0006';
    const selection=document.createElement('select');selection.setAttribute('aria-label','翻译控件位置');
    for(const [value,label] of [['top-right','右上'],['top-left','左上'],['bottom-right','右下'],['bottom-left','左下']]){const option=document.createElement('option');option.value=value;option.textContent=label;selection.append(option)}
    const reset=document.createElement('button');reset.textContent='恢复预设位置';reset.title='恢复本次安装设置的位置并清除拖动坐标';
    const applyPosition=()=>{
      host.style.left=host.style.right=host.style.top=host.style.bottom='';
      host.style.flexDirection=position.startsWith('bottom')?'column-reverse':'column';
      host.style.alignItems=position.endsWith('left')?'flex-start':'flex-end';
      if(point){const r=host.getBoundingClientRect();host.style.left=Math.max(8,Math.min(point.x,innerWidth-Math.max(64,r.width)-8))+'px';host.style.top=Math.max(8,Math.min(point.y,innerHeight-Math.max(28,r.height)-30))+'px'}
      else{host.style[position.endsWith('left')?'left':'right']='16px';host.style[position.startsWith('bottom')?'bottom':'top']=position.startsWith('bottom')?'48px':'80px'}
      selection.value=position;
    };
    const save=()=>{try{localStorage.setItem(preferenceKey,JSON.stringify({defaultsKey,mode:expanded?'expanded':'compact',position,point}))}catch{}};
    const show=value=>{expanded=value;panel.hidden=!value;panel.style.display=value?'flex':'none';launcher.textContent=value?'收起译文工具':'译文';launcher.setAttribute('aria-expanded',String(value));applyPosition();save()};
    launcher.onclick=()=>show(!expanded);
    selection.onchange=()=>{position=selection.value;point=null;applyPosition();save()};
    reset.onclick=()=>{position=initial.position;point=null;show(initial.mode==='expanded')};
    let dragging=null;
    grip.onpointerdown=event=>{if(event.button!==0)return;const r=host.getBoundingClientRect();dragging={id:event.pointerId,x:event.clientX,y:event.clientY,left:r.left,top:r.top};grip.setPointerCapture?.(event.pointerId);event.preventDefault()};
    grip.onpointermove=event=>{if(!dragging||event.pointerId!==dragging.id)return;point={x:dragging.left+event.clientX-dragging.x,y:dragging.top+event.clientY-dragging.y};applyPosition()};
    grip.onpointerup=event=>{if(!dragging||event.pointerId!==dragging.id)return;dragging=null;grip.releasePointerCapture?.(event.pointerId);save()};
    grip.onpointercancel=()=>{dragging=null;save()};
    const outside=event=>{if(expanded&&!event.composedPath().includes(host))show(false)};
    const escape=event=>{if(expanded&&event.key==='Escape')show(false)};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);window.addEventListener('resize',applyPosition);
    const sizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(applyPosition):null;sizeObserver?.observe(host);
    repositionControls=applyPosition;
    disposeControls=()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);window.removeEventListener('resize',applyPosition);sizeObserver?.disconnect()};
    handle.append(grip,launcher);panel.append(selection,reset);shadow.append(handle,panel);show(expanded);
    return panel;
  }
  const scheduleRefresh=()=>{if(!disposed&&!scheduled){scheduled=true;requestAnimationFrame(refresh)}};
  const offline=offlineFactory(reason => {
    const active = offline.enabled?.() === true;
    if (active && (!wasEnabled || reason?.retry)) {
      for (const root of document.querySelectorAll(transcriptSelector+',#glass-sidebar,[role="dialog"],[role="alertdialog"],[data-component*="modal"]')) dirtyRoots.add(root);
    }
    wasEnabled = active;
    for (const [source, elements] of waiting) {
      for (const element of elements) if (element.isConnected) candidates.add(element); else forgetWaiting(element);
      if (!elements.size) { waiting.delete(source); offline.release?.(source); }
    }
    // Overflow is represented on the existing DOM, not in an unbounded queue
    // retaining another copy of every paragraph. Refill after a batch finishes.
    let count=0;
    const queued=queuedCount?document.querySelectorAll('[data-cursor-zh-translation-status="queued"]'):[];
    queuedCount=queued.length;
    for(const element of queued){
      candidates.add(element);if(++count>=MAX_WAITING_ELEMENTS)break;
    }
    scheduleRefresh();
  });
  const settled=new WeakMap();
  const transcriptSelector='[aria-label="对话记录"],[aria-label="Conversation transcript"],[aria-label="Chat transcript"],.composer-assistant-message,.composer-human-message';
  const technicalPattern=technicalTerms.length?new RegExp('(?<![A-Za-z0-9_])(?:'+technicalTerms.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).sort((a,b)=>b.length-a.length).join('|')+')(?![A-Za-z0-9_])','gi'):null;
  const looksEnglish=source=>/[A-Za-z]{2}/.test(technicalPattern?source.replace(technicalPattern,' '):source)&&!/^[\s\d\p{P}]*$/u.test(source)&&!/^https?:\/\/\S+$/.test(source)&&!/^\S+\.(?:js|ts|tsx|jsx|py|json|md|txt|c|cpp|cs|html|css|yml|yaml)$/i.test(source);
  const existingChinese=(element,context=true)=>{
    const block=(context&&element.closest('p,li,blockquote,h1,h2,h3,h4,h5,h6,td,th'))||element;
    const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT);
    while(walker.nextNode())if(!walker.currentNode.parentElement?.closest('script,style,pre,code,kbd,svg')&&/[\u3400-\u9fff\uf900-\ufaff]/.test(walker.currentNode.nodeValue))return true;
    return false;
  };
  // Reject layout containers before querying descendants or reading their text.
  // Individual paragraphs and inline groups are the largest translation units.
  const textUnit=element=>element.matches(paragraphSelector)&&[...element.children].every(child=>/^(STRONG|B|EM|I|SPAN|SMALL|BR|SVG)$/.test(child.tagName));
  function autoEligible(element,source){
    if(!showChinese||!offline.enabled?.()||!looksEnglish(source))return false;
    const inDialog=element.closest('[role="dialog"],[role="alertdialog"],[data-component*="modal"]');
    const inSidebar=element.closest('#glass-sidebar li,#glass-sidebar [role="listitem"],#glass-sidebar [role="tab"]');
    const inTranscript=element.closest(transcriptSelector);
    if(!inDialog&&!inSidebar&&!inTranscript)return false;
    if(!inSidebar&&element.closest('button,[role="button"],[role="menuitem"],[role="tab"],[role="option"]'))return false;
    if(existingChinese(element,!inSidebar)){forgetWaiting(element);return false;}
    const previous=settled.get(element);
    if(!previous||previous.source!==source){
      settled.set(element,{source,at:Date.now()});clearTimeout(timers.get(element));
      timers.set(element,setTimeout(()=>{timers.delete(element);if(element.isConnected){candidates.add(element);scheduleRefresh()}},1250));return false;
    }
    if(Date.now()-previous.at<1200)return false;
    if(inDialog)return element.matches('p,h1,h2,h3,h4,h5,h6,button')||element.childElementCount===0;
    if(inSidebar)return element.matches('button,span,[role="tab"]')&&element.childElementCount<=3;
    return element.matches('p,blockquote,h1,h2,h3,h4,h5,h6,li')||element.childElementCount===0||([...element.children].every(child=>/^(STRONG|B|EM|I|SPAN)$/.test(child.tagName))&&[...element.childNodes].some(node=>node.nodeType===3&&/[A-Za-z]/.test(node.nodeValue)));
  }
  function markIssue(element,detail){
    const target=element.nodeType===3?element.parentElement:element;
    if(target?.dataset.cursorZhTranslationStatus==='queued')queuedCount=Math.max(0,queuedCount-1);
    if(!detail){issues.delete(element);if(target?.dataset.cursorZhTranslationStatus){delete target.dataset.cursorZhTranslationStatus;delete target.dataset.cursorZhTranslationReason}return}
    if(issues.has(element)||issues.size<MAX_WAITING_ELEMENTS)issues.set(element,detail);
    if(target){target.dataset.cursorZhTranslationStatus='original';target.dataset.cursorZhTranslationReason=detail}
  }
  function forgetWaiting(element){
    const source=waitingSource.get(element),elements=waiting.get(source);
    if(elements){elements.delete(element);if(!elements.size){waiting.delete(source);offline.release?.(source)}}
    waitingSource.delete(element);clearTimeout(timers.get(element));timers.delete(element);markIssue(element,null);
  }
  function automatic(source,element){
    if(waitingSource.get(element)!==source)forgetWaiting(element);
    if(!waitingSource.has(element)&&source.length<=240000){
      let elements=0,chars=0;for(const [text,group] of waiting){elements+=group.size;chars+=text.length}
      if(elements>=MAX_WAITING_ELEMENTS||(!waiting.has(source)&&(waiting.size>=MAX_WAITING_SOURCES||chars+source.length>MAX_WAITING_CHARS))){
        const target=element.nodeType===3?element.parentElement:element;
        if(target){if(target.dataset.cursorZhTranslationStatus!=='queued')queuedCount++;target.dataset.cursorZhTranslationStatus='queued';target.dataset.cursorZhTranslationReason='翻译队列繁忙，等待前面的内容完成'}
        return null;
      }
    }
    const value=offline.get(source);
    const state=offline.status?.(source);
    if(value&&value!==source){forgetWaiting(element);return value}
    if(value===source){forgetWaiting(element);markIssue(element,state?.detail||'引擎保留了原文，可导入人工译文');return null}
    markIssue(element,state?.detail||(value===source?'引擎保留了原文，可导入人工译文':null));
    if(!waiting.has(source))waiting.set(source,new Set());waiting.get(source).add(element);
    waitingSource.set(element,source);
    return null;
  }
  function dropRecord(key){
    const record=changes.get(key);if(!record)return;
    if(record.isHistory)historyCount--;
    for(const node of record.nodes)owners.delete(node);
    changes.delete(key);
  }
  function setRecord(element, nodes, values, isHistory) {
    const originals = nodes.map(n => n.nodeValue);
    changes.set(element, {nodes, originals, values, isHistory});
    if(isHistory)historyCount++;
    nodes.forEach((node,i)=>owners.set(node,{key:element,index:i}));
    nodes.forEach((n,i) => { n.nodeValue = !isHistory || showChinese ? values[i] : originals[i]; });
    // Original content remains in its store and in this in-memory record.
  }
  function translateElement(element) {
    if (!textUnit(element) || changes.has(element) || element.closest(protectedSelector) || element.querySelector(protectedSelector)) return;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    if (!nodes.length || nodes.some(n => owners.has(n))) {forgetWaiting(element);return;}
    const source = normalize(element.textContent);
    const historical = dictionary.get(source);
    // Duration headers may be split across nested spans. Match the complete
    // UI phrase while preserving the existing element and text node structure.
    const status = /^(?:Worked\s*for|Thought\s*for|Thought)\s/.test(source) ? statusFormatter(source) : source;
    const auto=!historical&&status===source&&autoEligible(element,source)?automatic(source,element):null;
    const translated = historical || (status !== source ? status : auto!==source?auto:null);
    if (!translated) return;
    const values = nodes.map(() => '');
    // Keep unchanged emphasized tokens (for example the bold digit 1) in place.
    const protectedIndexes = nodes.map((n,i) => n.parentElement.closest('strong,b,em,i') && n.nodeValue.trim() ? i : -1).filter(i => i >= 0);
    let rest = translated, start = 0, rich = protectedIndexes.length > 0;
    for (const i of protectedIndexes) {
      const token = nodes[i].nodeValue, at = rest.indexOf(token);
      if (at < 0 || (i === start && at > 0)) { rich = false; break; }
      if (i > start) values[start] = rest.slice(0,at);
      values[i] = token; rest = rest.slice(at + token.length); start = i + 1;
    }
    if (rich && start < nodes.length) values[start] = rest;
    else if (rich && rest) rich = false;
    if (!rich && protectedIndexes.length) { markIssue(element,'译文无法保留原有强调格式，已保留原文'); return; }
    if (!rich) { values.fill(''); values[0] = translated; }
    setRecord(element, nodes, values, Boolean(historical||auto));
  }
  function translateStatus(node) {
    const parent = node.parentElement;
    if (!parent || parent.closest(protectedSelector + ',p,blockquote,[data-streamdown],.rendered-markdown,.markdown-body')) return;
    const text = node.nodeValue, trimmed = text.trim();
    if (trimmed.length > 150) return;
    const sidebarTime = parent.closest('#glass-sidebar') && /^\d+\s*(?:s|m|h|d|w|mo|y)$/.test(trimmed);
    const translated = statusFormatter(sidebarTime ? trimmed + ' ago' : trimmed);
    if (translated !== trimmed) node.nodeValue = text.replace(trimmed, translated);
  }
  function translateMixedText(node){
    const parent=node.parentElement;
    if(!showChinese||!parent||!parent.closest(transcriptSelector)||parent.closest(protectedSelector))return;
    const paragraph=parent.closest('p,li,blockquote');
    if(!paragraph?.querySelector('a,code')||!looksEnglish(node.nodeValue)||owners.has(node))return;
    const source=node.nodeValue;
    const manual=dictionary.get(normalize(source));
    if(!manual&&existingChinese(paragraph)){forgetWaiting(node);return;}
    const translated=manual||(offline.enabled?.()?automatic(source,node):null);
    if(translated&&translated!==source)setRecord(node,[node],[translated],true);
  }
  function refresh() {
    if(disposed)return;
    scheduled = false;
    const textNodes=new Set();
    const roots=[...dirtyRoots];dirtyRoots.clear();
    for(const root of roots){
      if(!root.isConnected||historyHost?.contains(root)||root.nodeType!==1)continue;
      if(root.matches(protectedSelector)||root.closest(protectedSelector))continue;
      if(root.matches(paragraphSelector))candidates.add(root);
      for(const element of root.querySelectorAll(paragraphSelector))candidates.add(element);
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
      while(walker.nextNode())textNodes.add(walker.currentNode);
    }
    const work=[...candidates];candidates.clear();
    const depth=node=>{let n=0;while(node?.parentNode){n++;node=node.parentNode}return n};
    work.sort((a,b)=>depth(b)-depth(a));
    for(const element of work){
      if(!element.isConnected)continue;
      if(element.nodeType===3)textNodes.add(element);
      else if(element.nodeType===1){translateElement(element);for(const node of element.childNodes)if(node.nodeType===3)textNodes.add(node)}
    }
    for(const node of textNodes){if(!owners.has(node)){translateStatus(node);translateMixedText(node)}}
    if (!badge?.isConnected) {
      disposeControls();
      const host = document.createElement('div');
      historyHost = host;
      host.dataset.cursorHistoryLanguage = 'true';
      const shadow = host.attachShadow({mode:'closed'});
      const panel=mountControls(host,shadow);
      badge = document.createElement('button');
      badge.dataset.historyOriginalToggle='true';
      badge.style.cssText = 'font:12px system-ui;padding:7px 12px;color:#ddd;background:#252525;border:1px solid #555;border-radius:16px;cursor:pointer;';
      const loadFile = () => {
        const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
        input.onchange = async () => {
          try {
            if (!input.files?.[0]) return;
            const catalog = JSON.parse((await input.files[0].text()).replace(/^\uFEFF/,''));
            acceptCatalog(catalog);
            // Replacing a catalog must update paragraphs already on screen.
            for (const [element,record] of changes) if(record.isHistory) {
              record.nodes.forEach((node,i) => { if(node.isConnected && node.nodeValue === record.values[i]) node.nodeValue = record.originals[i]; });
              dropRecord(element);
            }
            try { localStorage.setItem(storageKey,JSON.stringify(catalog)); } catch {}
            showChinese = true;
            dirtyRoots.add(document.body || document.documentElement);
            refresh();
            badge.textContent = '历史译文 · 查看原文';
          } catch { badge.textContent = '译文格式有误，请重新导入'; }
        };
        input.click();
      };
      badge.onclick = () => {
        if (!dictionary.size&&![...changes.values()].some(record=>record.isHistory)) { loadFile(); return; }
        showChinese = !showChinese;
        for (const record of changes.values()) if(record.isHistory) record.nodes.forEach((n,i) => {
          if (n.isConnected && (n.nodeValue === record.values[i] || n.nodeValue === record.originals[i])) n.nodeValue = showChinese ? record.values[i] : record.originals[i];
        });
        badge.textContent = showChinese ? '历史译文 · 查看原文' : '历史原文 · 查看中文';
      };
      badge.textContent = dictionary.size ? '历史译文 · 查看原文' : '载入历史译文';
      badge.title='自动译文未经人工校对；可随时查看原文或导入人工译文';
      const load = document.createElement('button'); load.textContent = '导入译文'; load.style.cssText = badge.style.cssText + 'margin-left:6px'; load.onclick = loadFile;
      issueBadge=document.createElement('span');issueBadge.style.cssText='font:12px system-ui;color:#efc172;margin-left:8px';issueBadge.setAttribute('role','status');
      panel.append(badge,load);offline.attach(panel,badge.style.cssText);panel.append(issueBadge); (document.body || document.documentElement).append(host);
    }
    historyHost.style.display=document.querySelector(transcriptSelector+',#glass-sidebar li,#glass-sidebar [role="listitem"],#glass-sidebar [role="tab"]')?'flex':'none';
    if(historyCount)badge.textContent=showChinese?'历史译文 · 查看原文':'历史原文 · 查看中文';
    for(const element of issues.keys())if(!element.isConnected)forgetWaiting(element);
    issueBadge.textContent=issues.size?`${issues.size} 处保留原文`:'';
    if(queuedCount)issueBadge.textContent+=(issues.size?'；':'')+'部分内容排队中';
    issueBadge.title=[...new Set(issues.values())].join('；');
    repositionControls();
  }
  function queueContext(node){
    if(node.nodeType===3)candidates.add(node);
    let element=node.nodeType===1?node:node.parentElement;
    for(let i=0;element&&i<5&&!element.matches('body,html');i++,element=element.parentElement){
      if(historyHost?.contains(element)||element.closest(protectedSelector))break;
      if(!textUnit(element))break;
      candidates.add(element);
    }
  }
  const observer = new MutationObserver(records => {
    for(const mutation of records){
      if(historyHost?.contains(mutation.target))continue;
      if(mutation.type==='characterData'){
        const owner=owners.get(mutation.target), record=owner&&changes.get(owner.key);
        if(record&&(mutation.target.nodeValue===record.values[owner.index]||mutation.target.nodeValue===record.originals[owner.index]))continue;
        if(owner){for(let i=0;i<record.nodes.length;i++){const node=record.nodes[i];if(node!==mutation.target&&node.nodeValue===record.values[i])node.nodeValue=record.originals[i]}dropRecord(owner.key)}
        forgetWaiting(mutation.target);if(mutation.target.parentElement)forgetWaiting(mutation.target.parentElement);
        queueContext(mutation.target);
      }else{
        for(const node of mutation.removedNodes){
          if(historyHost&&(node===historyHost||node.contains?.(historyHost)))continue;
          const removed=node.nodeType===3?[node]:[];
          if(node.nodeType===1){const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);while(walker.nextNode())removed.push(walker.currentNode)}
          if(!node.isConnected)forgetWaiting(node);
          for(const text of removed){
            if(text.isConnected)continue;
            forgetWaiting(text);if(text.parentElement)forgetWaiting(text.parentElement);
            const owner=owners.get(text),record=owner&&changes.get(owner.key);
            if(record){for(let i=0;i<record.nodes.length;i++){const node=record.nodes[i];if(!node.isConnected&&node.nodeValue===record.values[i])node.nodeValue=record.originals[i]}dropRecord(owner.key)}
          }
        }
        for(const node of mutation.addedNodes){if(node!==historyHost){if(node.nodeType===1)dirtyRoots.add(node);queueContext(node)}}
        queueContext(mutation.target);
      }
    }
    // A removed wrapper may own nested paragraphs whose immediate parent was
    // not itself removed. Release those requests and stabilization timers too.
    for(const [source,elements] of waiting)for(const element of elements)if(!element.isConnected)forgetWaiting(element);
    for(const element of timers.keys())if(!element.isConnected){clearTimeout(timers.get(element));timers.delete(element)}
    if(candidates.size||dirtyRoots.size||!badge?.isConnected||records.some(record=>record.removedNodes.length))scheduleRefresh();
  });
  observer.observe(document,{childList:true,subtree:true,characterData:true});
  window.addEventListener('pagehide',()=>{disposed=true;observer.disconnect();disposeControls();offline.dispose();for(const timer of timers.values())clearTimeout(timer);timers.clear();waiting.clear();issues.clear();changes.clear()},{once:true});
  const initial=()=>{dirtyRoots.add(document.body || document.documentElement);refresh()};
  if (document.body) initial(); else document.addEventListener('DOMContentLoaded',initial,{once:true});
}

export function historyBootstrap(_ignoredCatalog, options = {}) {
  // No personal text, username or filesystem path enters shared app resources.
  const terms=JSON.parse(fs.readFileSync(new URL('../../offline/protected-terms.json',import.meta.url),'utf8'));
  return `\n;(${installHistoryOverlay.toString()})(${translateHistoryStatus.toString()},${createOfflineClient.toString()},${JSON.stringify(terms)},${JSON.stringify(normalizeHistoryControlOptions(options))});\n`;
}
