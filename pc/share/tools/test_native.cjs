/* Native UI behavior checks. jsdom is a test-only dependency, never a PC asset.
 * Run with NODE_PATH pointing at a temporary jsdom installation. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path');
const source=path.join(__dirname,'../js');
function setup(html){
 const dom=new JSDOM('<div id="main">'+html+'</div><div id="mergeDrawers"></div><div id="modal"></div>',{url:'https://local.test/',runScripts:'dangerously',pretendToBeVisual:true});
 const w=dom.window;w.icon=()=>'<svg></svg>';w.syncDrawerInteraction=()=>{};
 for(const name of ['components.js','ui-collections.js','ui-richtext.js'])w.eval(fs.readFileSync(path.join(source,name),'utf8'));
 return {dom,w,d:w.document,ui:w.PCUI,close:()=>w.close()};
}
const tick=()=>new Promise(r=>setTimeout(r,0));
test('optional search columns align mixed widths and adapt without changing field values',()=>{
 const e=setup('<section class="query-module"><form class="filterbar" data-pc-query-align="columns"><div class="mr-date" data-pc-label="投诉时间"><input type="date" name="start"><span>至</span><input type="date" name="end"></div>'+['客诉等级','售后来源','关键词','订单状态','接单人'].map((label,i)=>`<input name="field${i}" aria-label="${label}" value="保留${i}">`).join('')+'</form><form class="filterbar"><input aria-label="普通搜索"></form></section>');
 try{
  let available=1540;const observers=[],computed=e.w.getComputedStyle.bind(e.w);
  e.w.ResizeObserver=class{constructor(callback){this.callback=callback;observers.push(this)}observe(){}disconnect(){this.disconnected=true}};
  Object.defineProperty(e.w.HTMLElement.prototype,'clientWidth',{configurable:true,get(){return this.classList.contains('pc-search-items')?available:0}});
  e.w.HTMLElement.prototype.getBoundingClientRect=function(){return {width:this.classList.contains('pc-search-label')?68:0,height:32}};
  e.w.getComputedStyle=el=>{const style=computed(el);return new Proxy(style,{get(target,key){if(key==='getPropertyValue')return name=>name==='--pc-search-field-width'?(el.querySelector('.pc-query-range')?'320px':'280px'):target.getPropertyValue(name);if(key==='columnGap')return '24px';const value=target[key];return typeof value==='function'?value.bind(target):value}})};
  const form=e.d.querySelector('form'),original=[...form.querySelectorAll('input')];e.ui.sweep();
  const items=form.querySelector('.pc-search-items');assert.ok(items.classList.contains('pc-search-items-aligned'));
  const tracks=()=>Array.from(items.style.gridTemplateColumns.matchAll(/minmax\(0(?:px)?,\s*(\d+)px\)/g),match=>Number(match[1]));
  for(const [width,expected]of [[1540,[388,348,348,348]],[1200,[388,348,348]],[800,[388,348]],[340,[340]],[1540,[388,348,348,348]]]){
   available=width;observers.forEach(observer=>observer.callback());assert.deepEqual(tracks(),expected);
  }
  assert.ok(original.every(input=>input.isConnected&&form.contains(input)));assert.equal(new e.w.FormData(form).get('field3'),'保留3');
  const ordinary=e.d.querySelectorAll('form')[1].querySelector('.pc-search-items');assert.equal(ordinary.classList.contains('pc-search-items-aligned'),false);assert.equal(ordinary.style.gridTemplateColumns,'');
  form.remove();e.ui.sweep();assert.ok(observers.every(observer=>observer.disconnected));
 }finally{e.close()}
});
test('enhancement preserves original fields, form identity, listeners and FormData',async()=>{
 const e=setup('<section class="query-module"><form id="search" class="filterbar"><input id="keyword" name="keyword" aria-label="关键词" value="原值"><select id="state" name="state" aria-label="类型"><option value="a">甲</option><option value="b">乙</option></select><div class="query-actions"><button type="submit">搜索</button></div></form></section>');
 try{const original=e.d.querySelector('#state'),form=e.d.querySelector('form');let changes=0;original.addEventListener('change',()=>changes++);e.ui.sweep();assert.equal(e.d.querySelector('#state'),original);assert.equal(e.d.querySelector('form'),form);e.d.querySelector('.pc-select-trigger').click();e.d.querySelectorAll('.pc-select-option')[1].click();assert.equal(original.value,'b');assert.equal(changes,1);assert.deepEqual([...new e.w.FormData(form)],[['keyword','原值'],['state','b']]);form.reset();await tick();assert.equal(e.d.querySelector('.pc-select-caption').textContent,'甲');}finally{e.close();}
});
test('multiple selectors and dynamic options keep values and disabled states',async()=>{
 const e=setup('<select multiple id="multi"><option value="a" selected>甲</option><option value="b">乙</option></select>');
 try{e.ui.sweep();const s=e.d.querySelector('#multi');e.d.querySelector('.pc-select-trigger').click();e.d.querySelectorAll('.pc-select-option')[1].click();assert.deepEqual([...s.selectedOptions].map(o=>o.value),['a','b']);assert.ok(e.ui.isPopupOpen());s.disabled=true;e.ui.syncControl(s);assert.equal(e.d.querySelector('.pc-select-trigger').disabled,true);s.disabled=false;s.innerHTML='<option value="c" selected>丙</option>';await tick();assert.equal(e.d.querySelector('.pc-select-tag>span').textContent,'丙');e.d.querySelector('.pc-tag-close').click();assert.equal(s.selectedOptions.length,0);}finally{e.close();}
});
test('date selection and typing respect native formats and allowed ranges',()=>{
 const e=setup('<input id="date" type="date" value="2026-11-05" min="2026-11-03" max="2026-11-10">');
 try{e.ui.sweep();const s=e.d.querySelector('#date'),display=e.d.querySelector('.pc-date-display');let changes=0;s.addEventListener('change',()=>changes++);e.d.querySelector('.pc-date-open').click();assert.equal(e.d.querySelector('[aria-label="2026-11-02"]').disabled,true);e.d.querySelector('[aria-label="2026-11-06"]').click();assert.equal(s.value,'2026-11-06');assert.equal(changes,1);display.value='2026-11-20';display.dispatchEvent(new e.w.Event('change'));assert.equal(s.value,'2026-11-06');assert.equal(display.getAttribute('aria-invalid'),'true');}finally{e.close();}
});
test('table keeps row elements and events, and column resizing persists',()=>{
 const e=setup('<div class="table-wrap"><table data-pc-table-name="widths"><thead><tr><th>名称</th><th>操作</th></tr></thead><tbody><tr data-id="row"><td>甲</td><td><button id="edit">编辑</button></td></tr><tr data-pc-full-row><td colspan="2">分组内容</td></tr></tbody></table></div>');
 try{const edit=e.d.querySelector('#edit');let clicks=0;edit.addEventListener('click',()=>clicks++);e.ui.sweep();assert.equal(e.d.querySelector('#edit'),edit);edit.click();assert.equal(clicks,1);assert.equal(e.d.querySelector('[colspan]').colSpan,2);e.d.querySelector('.pc-column-resize').dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(JSON.parse(e.w.localStorage.widths)[0].width,120);e.d.querySelector('.reset-button button').click();assert.equal(JSON.parse(e.w.localStorage.widths)[0].width,110);}finally{e.close();}
});
test('pager reports both page and size, with a valid page after resizing',()=>{
 const e=setup('<div data-pc-pager=\'{"total":37,"page":2,"size":10,"action":"test"}\'></div>');
 try{let next;e.ui.registerPager('test',value=>next=value);e.ui.sweep();e.d.querySelector('[aria-label="下一页"]').click();assert.equal(next.currentPage,3);e.d.querySelector('.pc-page-size').value='20';e.d.querySelector('.pc-page-size').dispatchEvent(new e.w.Event('change'));assert.equal(next.currentPage,1);assert.equal(next.pageSize,20);}finally{e.close();}
});
test('hierarchy keeps leaf values while compacting the visible selection',()=>{
 const data={nodes:[{value:'root',label:'总部',children:[{value:'a',label:'一部'},{value:'b',label:'二部'}]}],value:[]};
 const e=setup('<div id="hierarchy"></div>');
 try{const el=e.d.querySelector('#hierarchy');el.dataset.pcHierarchy=JSON.stringify(data);let selected;el.addEventListener('pc-hierarchy-change',event=>selected=event.detail);e.ui.sweep();e.d.querySelector('.pc-hierarchy-row input').click();assert.deepEqual(Array.from(selected),['a','b']);assert.match(e.d.querySelector('.pc-selected-tag').textContent,/总部/);e.d.querySelector('.pc-tag-close').click();assert.equal(selected.length,0);}finally{e.close();}
});
test('popup Escape closes only the popup and dialog keeps original form fields',async()=>{
 const e=setup('<button id="opener">打开</button>');
 try{e.d.querySelector('#opener').focus();e.ui.dialog({title:'编辑',content:'<div class="ub-form"><div class="field"><label for="name">名称</label><input id="name" value="草稿"></div><div class="field"><label>类型</label><select><option>甲</option></select></div></div>',buttons:[{text:'取消',action:e.ui.closeDialog}]});e.d.querySelector('.pc-select-trigger').click();e.d.body.dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(e.ui.isPopupOpen(),false);assert.ok(e.d.querySelector('.pc-dialog'));assert.equal(e.d.querySelector('#name').value,'草稿');e.ui.closeDialog();await new Promise(r=>setTimeout(r,320));assert.equal(e.d.querySelector('.pc-dialog'),null);assert.equal(e.d.activeElement.id,'opener');}finally{e.close();}
});
test('rich text source mode preserves business events and sanitizes active markup',()=>{
 const e=setup('<textarea id="rich" data-pc-richtext>&lt;p&gt;原文&lt;/p&gt;</textarea>');
 try{const original=e.d.querySelector('#rich');let changes=0;original.addEventListener('input',()=>changes++);e.ui.sweep();const sourceButton=[...e.d.querySelectorAll('button')].find(b=>b.textContent==='源代码');assert.ok(sourceButton);sourceButton.click();changes=0;const raw=e.d.querySelector('.pc-richtext-source');raw.value='<p>正文</p><script>alert(1)</script><img src="javascript:alert(2)" onerror="bad()">';raw.dispatchEvent(new e.w.Event('input'));assert.equal(changes,1);assert.equal(original.value,'<p>正文</p><img>');assert.equal(e.d.querySelector('#rich'),original);}finally{e.close();}
});

test('ordinary form actions do not accidentally submit, and corrupt width storage stays untouched',()=>{
 const e=setup('<form><button id="action" class="btn">选择</button><button id="submit" type="submit">保存</button></form><div class="phone"><button id="mobile" class="btn">手机操作</button></div><div class="page-tabs"><button id="tab" class="btn active">页签</button></div><div class="table-wrap"><table data-pc-table-name="bad"><thead><tr><th>名称</th></tr></thead><tbody></tbody></table></div>');
 try{e.w.localStorage.setItem('bad','corrupt');e.ui.sweep();assert.equal(e.d.querySelector('#action').type,'button');assert.equal(e.d.querySelector('#submit').type,'submit');assert.equal(e.d.querySelector('#action').classList.contains('pc-native-button'),true);assert.equal(e.d.querySelector('#mobile').classList.contains('pc-native-button'),false);assert.equal(e.d.querySelector('#tab').classList.contains('pc-native-button'),false);assert.match(e.d.querySelector('.pc-table-storage-error').textContent,/原配置已保留/);e.d.querySelector('.pc-column-resize').dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(e.w.localStorage.getItem('bad'),'corrupt');assert.equal(e.d.querySelector('.reset-button button').disabled,true);assert.match(e.d.querySelector('tbody').textContent,/暂无符合条件的数据/);}finally{e.close();}
});
