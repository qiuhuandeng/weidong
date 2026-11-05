/* Native contenteditable editor; original textarea remains the persisted field. */
(() => {
  const {node,button,escape,wrap,menu}=PCUI.dom;
  function sanitizeRichText(value){
    const template=document.createElement('template');template.innerHTML=String(value||'');
    const allowed=new Set('P BR DIV SPAN B STRONG I EM U S STRIKE SUB SUP UL OL LI BLOCKQUOTE H1 H2 H3 H4 HR TABLE THEAD TBODY TR TH TD A IMG PRE CODE VIDEO AUDIO SOURCE'.split(' '));
    for(const el of [...template.content.querySelectorAll('*')]){
      if(!allowed.has(el.tagName)){if(/SCRIPT|STYLE|IFRAME|OBJECT|EMBED|FORM/.test(el.tagName))el.remove();else el.replaceWith(...el.childNodes);continue;}
      for(const attr of [...el.attributes]){
        const key=attr.name.toLowerCase(),value=attr.value;
        if(key==='href'&&el.tagName==='A'&&/^(https?:|mailto:|#)/i.test(value))continue;
        if(key==='src'&&el.tagName==='IMG'&&/^(https?:\/\/|data:image\/(?:png|jpeg|webp);base64,)/i.test(value))continue;
        if(key==='src'&&/^(VIDEO|AUDIO|SOURCE)$/.test(el.tagName)&&/^https?:\/\//i.test(value))continue;
        if(key==='controls'&&/^(VIDEO|AUDIO)$/.test(el.tagName))continue;
        if(key==='id'&&/^[a-zA-Z][\w-]*$/.test(value))continue;
        if(['alt','title','colspan','rowspan'].includes(key))continue;
        if(key==='style'){const safe=[...el.style].filter(k=>['color','background-color','text-align','font-size','font-weight','font-style','text-decoration','text-decoration-line','padding-left','break-after'].includes(k)).map(k=>k+':'+el.style.getPropertyValue(k)).join(';');el.setAttribute('style',safe);continue;}
        el.removeAttribute(attr.name);
      }
      if(el.tagName==='A'){el.rel='noopener noreferrer';el.target='_blank';}
    }
    return template.innerHTML;
  }
  PCUI.sanitizeRichText=sanitizeRichText;
  PCUI.register('textarea[data-pc-richtext]',source=>{
    const host=wrap(source,'richtext'),readOnly=source.disabled||source.readOnly,frame=node('div',{class:'pc-richtext-frame'}),toolbar=node('div',{class:'pc-richtext-toolbar',role:'toolbar','aria-label':'内容格式'});
    const editor=node('div',{class:'pc-richtext-content',contenteditable:String(!readOnly),role:'textbox','aria-multiline':'true','aria-label':source.getAttribute('aria-label')||'内容介绍',html:sanitizeRichText(source.value)});
    const raw=node('textarea',{class:'pc-control pc-richtext-source',rows:12,hidden:true,readOnly,'aria-label':'内容源代码'}),upload=node('input',{type:'file',hidden:true,accept:'image/png,image/jpeg,image/webp'});
    let selection,codeMode=false,full=false;
    const emit=()=>{source.value=sanitizeRichText(codeMode?raw.value:editor.innerHTML);source.dispatchEvent(new Event('input',{bubbles:true}));};
    const remember=()=>{const sel=window.getSelection();if(sel?.rangeCount&&editor.contains(sel.anchorNode))selection=sel.getRangeAt(0).cloneRange();};
    const restore=()=>{editor.focus();if(selection&&editor.contains(selection.commonAncestorContainer)){const sel=window.getSelection();sel.removeAllRanges();sel.addRange(selection);}};
    const command=(cmd,value)=>{if(readOnly||codeMode||!host.isConnected)return;restore();document.execCommand('styleWithCSS',false,true);document.execCommand(cmd,false,value);remember();emit();};
    const ask=(title,label,done)=>{remember();PCUI.dialog({title,content:'<div class="ub-form"><div class="field"><label>'+escape(label)+'</label><input id="pc-rich-value" aria-label="'+escape(label)+'"></div></div>',buttons:[{text:'取消',action:PCUI.closeDialog},{text:'确定',primary:true,action:()=>{const value=document.querySelector('#pc-rich-value')?.value||'';PCUI.closeDialog();setTimeout(()=>done(value),310);}}]});};
    const actions=new Map(),formatButtons=[];
    function action(label,fn,format=true){const b=button(label,fn,{disabled:format&&readOnly});b.addEventListener('mousedown',event=>{remember();if(format)event.preventDefault();});actions.set(label,b);if(format)formatButtons.push(b);return b;}
    for(const [label,cmd,value] of [['撤销','undo'],['重做','redo'],['加粗','bold'],['斜体','italic'],['下划线','underline'],['删除线','strikeThrough'],['下标','subscript'],['上标','superscript'],['左对齐','justifyLeft'],['居中','justifyCenter'],['右对齐','justifyRight'],['无序列表','insertUnorderedList'],['有序列表','insertOrderedList'],['增加缩进','indent'],['减少缩进','outdent'],['引用','formatBlock','blockquote'],['分隔线','insertHorizontalRule'],['清除格式','removeFormat']])action(label,()=>command(cmd,value));
    for(const [label,prompt,done] of [
      ['链接','链接地址',v=>{if(!/^(https?:\/\/|mailto:|#)/i.test(v))return PCUI.message('请输入有效链接');command('createLink',v);} ],
      ['图片','图片地址',v=>{if(!/^https?:\/\//i.test(v))return PCUI.message('请输入 http 或 https 图片地址');command('insertImage',v);} ],
      ['表格','行数 × 列数',v=>{const [r,c]=v.split(/[x×*]/).map(Number);if(!Number.isInteger(r)||!Number.isInteger(c)||r<1||c<1||r>30||c>12)return PCUI.message('请输入 1–30 行和 1–12 列，如 3×4');command('insertHTML','<table><tbody>'+Array.from({length:r},()=>'<tr>'+Array.from({length:c},()=>'<td><br></td>').join('')+'</tr>').join('')+'</tbody></table><p><br></p>');}],
      ['文字颜色','颜色（如 #333333）',v=>{if(!CSS.supports('color',v))return PCUI.message('请输入有效颜色');command('foreColor',v);}],
      ['背景颜色','颜色（如 #ffff00）',v=>{if(!CSS.supports('color',v))return PCUI.message('请输入有效颜色');command('hiliteColor',v);}],
      ['标题格式','格式（p / h1 / h2 / h3 / h4）',v=>{if(!/^(p|h[1-4])$/.test(v))return PCUI.message('请输入 p 或 h1–h4');command('formatBlock',v);}],
      ['代码示例','代码',v=>command('insertHTML','<pre><code>'+escape(v)+'</code></pre><p><br></p>')],
      ['锚点','锚点名称',v=>{if(!/^[a-zA-Z][\w-]*$/.test(v))return PCUI.message('锚点以英文字母开头，可含数字和连字符');command('insertHTML','<span id="'+escape(v)+'">'+escape(v)+'</span>');}],
      ['媒体','音视频地址',v=>{if(!/^https?:\/\//i.test(v))return PCUI.message('请输入 http 或 https 音视频地址');command('insertHTML','<video controls src="'+escape(v)+'"></video>');}],
      ['表情','表情符号',v=>command('insertText',v)]
    ])action(label,()=>ask(label,prompt,done));
    action('上传图片',()=>{remember();upload.click();});action('分页符',()=>command('insertHTML','<hr style="break-after:page"><p><br></p>'));action('日期时间',()=>command('insertText',new Date().toLocaleString('zh-CN',{hour12:false})));
    action('查找替换',()=>{remember();PCUI.dialog({title:'查找与替换',content:'<div class="ub-form"><div class="field"><label>查找</label><input id="pc-rich-find" aria-label="查找内容"></div><div class="field"><label>替换为</label><input id="pc-rich-replace" aria-label="替换内容"></div></div>',buttons:[{text:'关闭',action:PCUI.closeDialog},{text:'全部替换',primary:true,action:()=>{const a=document.querySelector('#pc-rich-find').value,b=document.querySelector('#pc-rich-replace').value;if(!a)return;const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);let text,count=0;while(text=walker.nextNode()){const chunks=text.textContent.split(a);count+=chunks.length-1;text.textContent=chunks.join(b);}emit();PCUI.message('已替换 '+count+' 处');}}]});});
    const code=action('源代码',()=>{if(!codeMode){remember();raw.value=sanitizeRichText(editor.innerHTML);}else editor.innerHTML=sanitizeRichText(raw.value);codeMode=!codeMode;editor.hidden=codeMode;raw.hidden=!codeMode;code.textContent=codeMode?'可视编辑':'源代码';formatButtons.forEach(b=>b.disabled=readOnly||codeMode);emit();},false);
    action('预览',()=>PCUI.dialog({title:'内容预览',content:'<div class="pc-richtext-preview">'+sanitizeRichText(source.value)+'</div>',wide:true,buttons:[{text:'关闭',action:PCUI.closeDialog}]}),false);
    const fullButton=action('全屏',()=>fullscreen(!full),false);
    function fullscreen(value){full=value;frame.classList.toggle('is-fullscreen',full);fullButton.textContent=full?'退出全屏':'全屏';if(full){document.body.append(frame);frame.setAttribute('role','dialog');frame.setAttribute('aria-modal','true');frame.setAttribute('aria-label','内容编辑器');}else{host.prepend(frame);frame.removeAttribute('role');frame.removeAttribute('aria-modal');}editor.focus();}
    const group=(names,label,extra='')=>node('div',{class:'pc-richtext-tools '+extra,role:'group','aria-label':label},names.map(name=>actions.get(name)));
    const menus=node('div',{class:'pc-richtext-tools',role:'group','aria-label':'更多格式'});
    for(const [label,names] of [['文字格式',['删除线','下标','上标','文字颜色','背景颜色','标题格式','清除格式']],['段落',['左对齐','居中','右对齐','无序列表','有序列表','增加缩进','减少缩进','引用']],['插入',['链接','图片','上传图片','表格','代码示例','锚点','媒体','表情','分隔线','分页符','日期时间']]]){const owner=button(label+' ▾',null,{disabled:readOnly});owner.addEventListener('mousedown',remember);formatButtons.push(owner);menu(owner,names.map(name=>actions.get(name)),label);menus.append(owner);}
    toolbar.append(group(['撤销','重做','加粗','斜体','下划线'],'常用格式'),menus,group(['查找替换','源代码','预览','全屏'],'编辑工具','pc-richtext-views'));frame.append(toolbar,upload,editor,raw);host.prepend(frame);source.hidden=true;source.tabIndex=-1;
    editor.addEventListener('input',emit);raw.addEventListener('input',emit);editor.addEventListener('mouseup',remember);editor.addEventListener('keyup',remember);
    editor.addEventListener('paste',event=>{event.preventDefault();command('insertHTML',sanitizeRichText(event.clipboardData.getData('text/html')||escape(event.clipboardData.getData('text/plain')).replace(/\n/g,'<br>')));});
    upload.addEventListener('change',()=>{const file=upload.files[0];if(!file)return;if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>2*1024*1024)return PCUI.message('请选择不超过 2 MB 的 PNG、JPEG 或 WebP 图片');const reader=new FileReader();reader.onload=()=>command('insertImage',reader.result);reader.onerror=()=>PCUI.message('图片读取失败，请重新选择');reader.readAsDataURL(file);upload.value='';});
    const keydown=event=>{if(!full)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();fullscreen(false);}if(event.key==='Tab'){const items=[...frame.querySelectorAll('button:not(:disabled),textarea:not([hidden]),[contenteditable="true"]')].filter(el=>el.getClientRects().length);if(event.shiftKey&&document.activeElement===items[0]){event.preventDefault();items.at(-1)?.focus();}else if(!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();items[0]?.focus();}}};
    document.addEventListener('keydown',keydown,true);PCUI.dom.cleanups.set(host,()=>{document.removeEventListener('keydown',keydown,true);frame.remove();});
  });
})();
