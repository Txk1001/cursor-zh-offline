import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installHistoryOverlay,translateHistoryStatus} from '../scripts/lib/history-localization.mjs';

const preferenceKey='cursor.zh.history.controls.v1';
const fixtures=[];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function fixture({saved,options={mode:'expanded',position:'top-right'}}={}){
  const dom=new JSDOM('<body><div id="glass-sidebar"><li><span id="chinese-title">已有中文 title</span><span>3 小时前</span></li><li><span id="english-title">Review changes</span><span id="chinese-date">3 小时前</span></li></div><section aria-label="对话记录"><p>现有中文正文。</p></section><div id="outside">外部区域</div></body>',{url:'https://fixture.invalid',runScripts:'outside-only',pretendToBeVisual:true});
  const {window}=dom;
  const frames=new Set(),requestFrame=window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame=callback=>{const id=requestFrame(time=>{frames.delete(id);callback(time)});frames.add(id);return id};
  if(saved)window.localStorage.setItem(preferenceKey,JSON.stringify(saved));
  let shadow;
  const attach=window.Element.prototype.attachShadow;
  window.Element.prototype.attachShadow=function(options){shadow=attach.call(this,options);return shadow};
  const sizes={expandedWidth:480,expandedHeight:200,compactWidth:88,compactHeight:28};
  // JSDOM does not lay out elements. Report zero before connection, then give
  // the complete control panel realistic dimensions. This is a position/state
  // regression fixture, not evidence of a native Cursor visual acceptance run.
  window.Element.prototype.getBoundingClientRect=function(){
    if(!this.matches('[data-cursor-history-language]')||!this.isConnected||this.style.display==='none')return {x:0,y:0,left:0,top:0,right:0,bottom:0,width:0,height:0};
    const expanded=shadow.querySelector('[data-history-controls-panel]')?.hidden===false;
    const complete=Boolean(shadow.querySelector('[data-history-original-toggle]')&&shadow.querySelector('[data-fixture-offline-control]'));
    const width=expanded&&complete?Math.min(sizes.expandedWidth,window.innerWidth-32):sizes.compactWidth;
    const height=expanded&&complete?sizes.expandedHeight:sizes.compactHeight;
    const left=this.style.left?parseFloat(this.style.left):this.style.right?window.innerWidth-parseFloat(this.style.right)-width:0;
    const top=this.style.top?parseFloat(this.style.top):this.style.bottom?window.innerHeight-parseFloat(this.style.bottom)-height:0;
    return {x:left,y:top,left,top,right:left+width,bottom:top+height,width,height};
  };
  const sizeObservers=[];
  window.ResizeObserver=class{
    constructor(callback){this.callback=callback;this.disconnected=false;sizeObservers.push(this)}
    observe(target){this.target=target}
    disconnect(){this.disconnected=true}
    notify(){if(!this.disconnected)this.callback([{target:this.target}],this)}
  };
  const calls=[];
  window.testOffline={
    enabled:()=>true,
    get(source){calls.push(source);return source==='Review changes'?'检查更改':source},
    status:()=>({state:'retained'}),release(){},dispose(){},
    attach(panel){const button=window.document.createElement('button');button.dataset.fixtureOfflineControl='true';button.textContent='离线翻译 · 已启用';panel.append(button)},
  };
  window.eval(`(${installHistoryOverlay.toString()})(${translateHistoryStatus.toString()},()=>window.testOffline,[],${JSON.stringify(options)});`);
  const host=window.document.querySelector('[data-cursor-history-language]');
  const panel=shadow.querySelector('[data-history-controls-panel]');
  const launcher=shadow.querySelector('[data-history-controls-toggle]');
  const grip=shadow.querySelector('[aria-label="拖动翻译控件"]');
  const selection=shadow.querySelector('[aria-label="翻译控件位置"]');
  const reset=[...shadow.querySelectorAll('button')].find(button=>button.textContent==='恢复预设位置');
  const readPreference=()=>JSON.parse(window.localStorage.getItem(preferenceKey));
  const assertInside=()=>{
    const rect=host.getBoundingClientRect();
    assert.ok(rect.left>=8&&rect.top>=8,`Control origin must remain visible: ${JSON.stringify(rect)}`);
    assert.ok(rect.right<=window.innerWidth-8&&rect.bottom<=window.innerHeight-30,`Control panel must fit the viewport: ${JSON.stringify(rect)}`);
  };
  const dragTo=(left,top)=>{
    const start=host.getBoundingClientRect();let prevented=false;
    // JSDOM has no pointer capture implementation; exercise the installed
    // pointer handlers without replacing their movement/persistence logic.
    const captured=[];grip.setPointerCapture=id=>captured.push(id);grip.releasePointerCapture=id=>captured.push(-id);
    grip.onpointerdown({button:0,pointerId:7,clientX:10,clientY:10,preventDefault(){prevented=true}});
    grip.onpointermove({pointerId:7,clientX:10+left-start.left,clientY:10+top-start.top});
    grip.onpointerup({pointerId:7});
    assert.equal(prevented,true);assert.deepEqual(captured,[7,-7]);
  };
  const value={window,host,shadow,panel,launcher,grip,selection,reset,sizes,calls,sizeObservers,readPreference,assertInside,dragTo,close(){window.dispatchEvent(new window.Event('pagehide'));for(const id of frames)window.cancelAnimationFrame(id);window.close();assert.ok(sizeObservers.every(observer=>observer.disconnected),'Control size observers must be released')}};
  fixtures.push(value);return value;
}

try{
  const view=fixture({saved:{defaultsKey:'expanded|top-right',mode:'expanded',position:'top-right',point:{x:970,y:700}}});
  assert.equal(view.panel.hidden,false);
  assert.equal(view.host.style.left,'536px');assert.equal(view.host.style.top,'538px');
  view.assertInside();
  assert.equal(view.sizeObservers.length,1);assert.equal(view.sizeObservers[0].target,view.host);

  view.dragTo(350,300);
  assert.deepEqual(view.readPreference().point,{x:350,y:300});
  assert.equal(view.host.style.left,'350px');assert.equal(view.host.style.top,'300px');
  const restored=fixture({saved:view.readPreference()});
  assert.equal(restored.panel.hidden,false);assert.equal(restored.host.style.left,'350px');assert.equal(restored.host.style.top,'300px');restored.assertInside();

  for(const corner of ['top-right','top-left','bottom-right','bottom-left']){
    view.dragTo(250,220);assert.notEqual(view.readPreference().point,null);
    view.selection.value=corner;view.selection.dispatchEvent(new view.window.Event('change'));
    assert.equal(view.readPreference().position,corner);assert.equal(view.readPreference().point,null);
    assert.equal(view.host.style[corner.endsWith('left')?'left':'right'],'16px');
    assert.equal(view.host.style[corner.startsWith('bottom')?'bottom':'top'],corner.startsWith('bottom')?'48px':'80px');
    assert.equal(view.host.style[corner.endsWith('left')?'right':'left'],'');
    assert.equal(view.host.style[corner.startsWith('bottom')?'top':'bottom'],'');
    view.assertInside();
  }

  view.launcher.dispatchEvent(new view.window.Event('pointerdown',{bubbles:true,composed:true}));
  assert.equal(view.panel.hidden,false,'Pointer events inside the closed shadow host must not collapse controls');
  view.window.document.dispatchEvent(new view.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(view.panel.hidden,true);assert.equal(view.readPreference().mode,'compact');
  view.launcher.click();assert.equal(view.panel.hidden,false);
  view.window.document.querySelector('#outside').dispatchEvent(new view.window.Event('pointerdown',{bubbles:true}));
  assert.equal(view.panel.hidden,true);
  view.reset.click();assert.equal(view.panel.hidden,false);assert.equal(view.readPreference().mode,'expanded');
  assert.equal(view.readPreference().position,'top-right');assert.equal(view.readPreference().point,null);
  assert.equal(view.host.style.right,'16px');assert.equal(view.host.style.top,'80px');

  view.dragTo(970,700);view.assertInside();
  view.window.document.dispatchEvent(new view.window.KeyboardEvent('keydown',{key:'Escape'}));
  assert.equal(view.panel.hidden,true);assert.equal(view.host.style.left,'928px');view.assertInside();
  view.launcher.click();assert.equal(view.host.style.left,'536px');assert.equal(view.host.style.top,'538px');view.assertInside();
  view.window.innerWidth=640;view.window.innerHeight=480;
  view.window.dispatchEvent(new view.window.Event('resize'));
  assert.equal(view.host.style.left,'152px');assert.equal(view.host.style.top,'250px');view.assertInside();
  view.sizes.expandedHeight=280;view.sizeObservers[0].notify();
  assert.equal(view.host.style.top,'170px');view.assertInside();

  const compactPreset=fixture({options:{mode:'compact',position:'bottom-left'},saved:{defaultsKey:'compact|bottom-left',mode:'expanded',position:'top-right',point:{x:970,y:700}}});
  assert.equal(compactPreset.panel.hidden,false);compactPreset.reset.click();
  assert.equal(compactPreset.panel.hidden,true);assert.equal(compactPreset.readPreference().point,null);
  assert.equal(compactPreset.readPreference().position,'bottom-left');assert.equal(compactPreset.host.style.left,'16px');assert.equal(compactPreset.host.style.bottom,'48px');

  await wait(1450);
  for(const current of fixtures){
    const chinese=current.window.document.querySelector('#chinese-title');
    assert.equal(chinese.textContent,'已有中文 title');
    assert.equal(chinese.hasAttribute('data-cursor-zh-translation-status'),false);
    assert.equal(chinese.hasAttribute('data-cursor-zh-translation-reason'),false);
    assert.ok(!current.calls.includes('已有中文 title'),'Native Chinese sidebar titles must not reach the model');
    assert.ok(current.calls.includes('Review changes'),'An adjacent Chinese date must not block an English sidebar title');
    assert.equal(current.window.document.querySelector('#english-title').textContent,'检查更改');
    assert.equal(current.window.document.querySelector('#chinese-date').textContent,'3 小时前');
    assert.equal(current.shadow.querySelector('[role="status"]').textContent,'','Preserved native Chinese must not be counted as a translation failure');
  }
  console.log('历史译文控件：保存位置恢复、挂载后边界、拖动/四角/预设、收起、窗口及面板尺寸变化、侧栏中文保护与英文标题翻译通过');
}finally{for(const current of fixtures)current.close()}
