/* SCHOOL_PASSWORD_ADMIN_ONLY_V1 */
(()=>{'use strict';
const $=id=>document.getElementById(id);const views=['loginView','dashboardView','quizView','resultView'];let user=null,code='',progress=null,question=null,questionType='',selected=[],assignment=null;
function show(id){views.forEach(x=>$(x).classList.toggle('hidden',x!==id));$('logoutBtn').classList.toggle('hidden',id==='loginView');}
async function api(p,method='GET',data){const res=await fetch('/api/school'+p,{method,credentials:'same-origin',cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});let obj=await res.json().catch(()=>({}));if(!res.ok)throw Error(obj.message||`请求失败 ${res.status}`);return obj;}
function escape(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function userState(u){user=u;$('currentName').textContent=u?.name||'';if(!u)show('loginView');else{show('dashboardView');$('classLabel').textContent=(u.className||'学生')+' · '+u.name;loadTasks();}}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginErr').textContent='';try{const data=await api('/login','POST',{username:$('username').value.trim(),password:$('password').value});$('password').value='';userState(data.user);}catch(err){$('loginErr').textContent=err.message;}});
$('logoutBtn').onclick=async()=>{await api('/logout','POST',{}).catch(()=>{});userState(null);};
async function loadTasks(){for(const id of ['examList','practiceList'])$(id).innerHTML='<p class="muted">正在加载…</p>';try{const data=await api('/available');for(const [id,mode] of [['examList','exam'],['practiceList','practice']]){const arr=data.assignments.filter(v=>v.mode===mode);const parent=$(id);parent.replaceChildren();if(!arr.length){parent.innerHTML='<p class="muted">暂无已发布任务</p>';continue;}for(const item of arr){const node=document.createElement('div');node.className='lesson';const label=document.createElement('div');const strong=document.createElement('strong');strong.textContent=item.title;const small=document.createElement('small');small.textContent='测验码 '+item.code+(item.className?' · '+item.className:'');label.append(strong,small);const btn=document.createElement('button');btn.className='primary small';btn.textContent='进入';btn.addEventListener('click',()=>start(item));node.append(label,btn);parent.append(node);}}}catch(err){for(const id of ['examList','practiceList'])$(id).textContent=err.message;}}
$('refreshTasks').onclick=loadTasks;
async function start(item,restart=false){assignment=item;code=item.code;try{const res=await api('/quiz/'+code+'/start','POST',{restart});progress=res.progress;question=res.question;if(progress.completed)return finish();show('quizView');render();}catch(err){alert(err.message);}}
function render(){if(!question){finish();return;}questionType=question.type;selected=[];$('quizErr').textContent='';$('qLabel').textContent=(assignment.mode==='exam'?'考试':'自主练习')+' · '+assignment.title;$('qProgress').textContent=`第${progress.answered+1}题 / 共${progress.total}题`;$('progressBar').style.width=(100*progress.answered/progress.total)+'%';$('questionTitle').textContent=question.title||`第${progress.answered+1}题`;
const area=$('answerArea');area.replaceChildren();const answers=Array.isArray(question.answers)?question.answers:[];
function c(content){const b=document.createElement('button');b.className='choice';b.type='button';b.append(document.createElement('span'));b.firstChild.className='idx';b.firstChild.textContent=String.fromCharCode(65+content.idx);if(content.type==='image'){const img=document.createElement('img');img.src=content.text;img.alt='选项图片';b.append(img);}else{const span=document.createElement('span');span.textContent=content.text;b.append(span);}return b;}
if(['single','multiple','multiple-choice','true-false'].includes(questionType)){answers.forEach((v,i)=>{const b=c({idx:i,text:v.content||'',type:v.type});b.onclick=()=>{if(questionType==='multiple'){selected.includes(i)?selected=selected.filter(n=>n!==i):selected.push(i);}else selected=[i];[...area.children].forEach((x,k)=>x.classList.toggle('selected',selected.includes(k)));};area.appendChild(b);});}
else if(questionType==='text'){area.innerHTML='<label for="freeAnswer">填写答案</label><input id="freeAnswer" maxlength="500" placeholder="请输入你的答案" autocomplete="off"/>';}
else if(questionType==='slider'){const conf=answers[0]||{};area.innerHTML=`<label for="rangeAnswer">调整数值 <strong id="rangeValue"></strong></label><input id="rangeAnswer" type="range" min="${Number(conf.min)||0}" max="${Number(conf.max)||100}" step="${Number(conf.step)||1}" value="${Number(conf.min)||0}"/>`;$('rangeAnswer').oninput=()=>$('rangeValue').textContent=$('rangeAnswer').value;$('rangeAnswer').oninput();}
else if(questionType==='sequence'){area.innerHTML='<p class="muted">请按正确顺序为每个位置选择内容（每项只能使用一次）</p>';answers.forEach((_,i)=>{const line=document.createElement('div');line.className='flex';line.style.marginBottom='10px';const lab=document.createElement('label');lab.textContent=`第${i+1}位`;const sel=document.createElement('select');sel.setAttribute('data-seq','');sel.style.maxWidth='550px';sel.innerHTML='<option value="">请选择</option>';answers.forEach((a,k)=>{const o=document.createElement('option');o.value=k;o.textContent=a.type==='image'?`图片 ${k+1}`:a.content;sel.appendChild(o);});line.append(lab,sel);area.append(line);});}
else{area.textContent='此题型暂未完成适配，请联系老师。';$('submitAnswer').disabled=true;return;}$('submitAnswer').disabled=false;
}
$('submitAnswer').onclick=async()=>{let answer;if(questionType==='text'){answer=$('freeAnswer').value.trim();if(!answer)return $('quizErr').textContent='请输入答案';}else if(questionType==='slider')answer=Number($('rangeAnswer').value);else if(questionType==='sequence'){answer=[...document.querySelectorAll('[data-seq]')].map(x=>x.value===''?null:Number(x.value));if(answer.includes(null)||new Set(answer).size!==answer.length)return $('quizErr').textContent='请按顺序选完所有内容，且不要重复';}else{if(!selected.length)return $('quizErr').textContent='请先选择答案';answer=selected;}
$('submitAnswer').disabled=true;try{const out=await api('/quiz/'+code+'/answer','POST',{answer});progress=out.progress;question=out.question;if(progress.completed)finish();else render();}catch(e){$('quizErr').textContent=e.message;$('submitAnswer').disabled=false;}};
function finish(){show('resultView');$('resultTitle').textContent=assignment.mode==='exam'?'考试已提交':'练习已完成';$('resultScore').textContent=(progress.score??'-')+' / '+(progress.maxScore??progress.total);$('resultSubtitle').textContent='成绩已自动关联到账号 '+user.username+'，老师可在原Quizzle成绩分析中查看。'+(assignment.mode==='practice'?' 如需再次练习，返回任务列表后可重新开始。':' 考试只能完成一次。');}
$('backDashboard').onclick=()=>userState(user);$('goDashboard').onclick=()=>userState(user);
const orig=start;start=async function(item){assignment=item;code=item.code;try{const r=await api('/quiz/'+code+'/start','POST',{});if(r.progress?.completed&&item.mode==='practice'){if(confirm('本次练习已完成，是否重新练习？'))return orig(item,true);}progress=r.progress;question=r.question;if(progress?.completed){finish();return;}show('quizView');render();}catch(e){alert(e.message);}};
api('/me').then(x=>userState(x.user)).catch(()=>show('loginView'));
})();

/* SCHOOL_IMPORT_MEDIA_RENDER_V1 */
(()=>{
  'use strict';
  if(typeof document==='undefined')return;
  const marker=/\[\[QUIZZLE_MEDIA:(\/school\/import\/media\/[A-Za-z0-9._~!$&'()*+,;=:@%\/-]+)\]\]/g;
  const style=document.createElement('style');
  style.textContent='.quizzle-import-media{display:block;max-width:min(100%,760px);max-height:520px;margin:14px auto;border-radius:10px;object-fit:contain;background:#fff;box-shadow:0 2px 12px rgba(50,45,100,.12)}.quizzle-import-video{width:100%;max-height:520px;background:#111}.quizzle-import-media-link{display:inline-block;margin:8px 0;color:#5b45c5;font-size:13px}';
  document.head?.append(style);
  function safeUrl(value){try{const u=new URL(value,location.origin);return u.origin===location.origin&&u.pathname.startsWith('/school/import/media/')?u.href:'';}catch{return '';}}
  function mediaNode(url){const safe=safeUrl(url);if(!safe)return null;const isVideo=/\.(?:mp4|webm|ogg|mov)(?:$|\?)/i.test(safe);if(isVideo){const v=document.createElement('video');v.className='quizzle-import-media quizzle-import-video';v.controls=true;v.preload='metadata';v.src=safe;return v;}const img=document.createElement('img');img.className='quizzle-import-media';img.alt='题目图片';img.loading='lazy';img.src=safe;return img;}
  function replaceText(node){const value=node.nodeValue||'';if(!value.includes('[[QUIZZLE_MEDIA:'))return;marker.lastIndex=0;let match,last=0,changed=false;const frag=document.createDocumentFragment();while((match=marker.exec(value))){changed=true;if(match.index>last)frag.append(document.createTextNode(value.slice(last,match.index)));const media=mediaNode(match[1]);if(media)frag.append(media);else frag.append(document.createTextNode('（题目媒体加载失败）'));last=match.index+match[0].length;}if(!changed)return;if(last<value.length)frag.append(document.createTextNode(value.slice(last)));node.parentNode?.replaceChild(frag,node);}
  function scan(){if(!document.body)return;const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const nodes=[];let n;while((n=walker.nextNode())){const tag=n.parentElement?.tagName;if(tag!=='SCRIPT'&&tag!=='STYLE'&&tag!=='TEXTAREA')nodes.push(n);}for(const text of nodes)replaceText(text);}
  function setup(){scan();new MutationObserver(scan).observe(document.body,{childList:true,subtree:true,characterData:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
/* END_SCHOOL_IMPORT_MEDIA_RENDER_V1 */


/* SCHOOL_IMPORT_MATH_FORMAT_V2 */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.QuizzleMath=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
  const decode=s=>String(s||'').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,v)=>{
    if(entities[v])return entities[v];
    const n=v[0]==='#'?(v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):parseInt(v.slice(1),10)):0;
    return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
  });
  function xmlTree(source){
    if(/<!DOCTYPE|<!ENTITY/i.test(source))throw Error('Word XML包含不支持的文档声明');
    const root={name:'root',children:[]},stack=[root];let count=0;
    for(const token of String(source).match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<[^>]*>|[^<]+/g)||[]){
      if(++count>200000)throw Error('Word段落过于复杂，请拆分导入');
      if(token.startsWith('<!--')||token.startsWith('<?'))continue;
      if(token.startsWith('</')){const name=token.slice(2,-1).trim();if(stack.length<2||stack[stack.length-1].name!==name)throw Error('Word XML结构异常');stack.pop();continue;}
      if(token.startsWith('<')){
        const m=token.match(/^<([^\s/>]+)/);if(!m)continue;
        const attrs={};for(const a of token.matchAll(/([^\s=<>]+)\s*=\s*(["'])([\s\S]*?)\2/g))attrs[a[1]]=decode(a[3]);
        const node={name:m[1],attrs,children:[]};stack[stack.length-1].children.push(node);
        if(!/\/\s*>$/.test(token)){stack.push(node);if(stack.length>128)throw Error('Word XML嵌套层数过多');}
      }else stack[stack.length-1].children.push(decode(token));
    }
    if(stack.length!==1)throw Error('Word XML没有完整结束');return root;
  }
  const elements=n=>(n?.children||[]).filter(x=>typeof x!=='string');
  const child=(n,name)=>elements(n).find(x=>x.name===name);
  const attr=(n,name,other='')=>n?.attrs?.[name]??other;
  const text=n=>typeof n==='string'?n:(n?.children||[]).map(text).join('');
  function wordParagraphText(source){
    const tree=xmlTree(source),warnings=[];
    function convert(n){
      if(typeof n==='string')return '';
      const name=n.name;
      if(/(?:Pr|PrChange)$/.test(name)||['w:del','w:moveFrom','w:instrText','w:drawing','w:pict','w:object'].includes(name))return '';
      if(name==='w:t'||name==='m:t')return text(n);
      if(name==='w:tab')return '\t';if(name==='w:br'||name==='w:cr')return '\n';
      if(name==='mc:AlternateContent'){const one=child(n,'mc:Choice')||child(n,'mc:Fallback');return one?convert(one):'';}
      const group=key=>convert(child(n,'m:'+key));
      if(name==='m:f')return '\\frac{'+group('num')+'}{'+group('den')+'}';
      if(name==='m:sSup')return group('e')+'^{'+group('sup')+'}';
      if(name==='m:sSub')return group('e')+'_{'+group('sub')+'}';
      if(name==='m:sSubSup')return group('e')+'_{'+group('sub')+'}^{'+group('sup')+'}';
      if(name==='m:sPre')return '_{'+group('sub')+'}^{'+group('sup')+'}'+group('e');
      if(name==='m:rad'){
        const degree=group('deg');return degree?'\\root{'+degree+'}{'+group('e')+'}':'\\sqrt{'+group('e')+'}';
      }
      if(name==='m:d'){
        const p=child(n,'m:dPr'),start=attr(child(p,'m:begChr'),'m:val','('),end=attr(child(p,'m:endChr'),'m:val',')');
        const separator=attr(child(p,'m:sepChr'),'m:val','|');return start+elements(n).filter(x=>x.name==='m:e').map(convert).join(separator)+end;
      }
      if(name==='m:nary'){
        const p=child(n,'m:naryPr'),symbol=attr(child(p,'m:chr'),'m:val','∫');
        const lo=group('sub'),hi=group('sup');return symbol+(lo?'_{'+lo+'}':'')+(hi?'^{'+hi+'}':'')+group('e');
      }
      if(name==='m:eqArr')return elements(n).filter(x=>x.name==='m:e').map(convert).join('；');
      if(name==='m:r'||name==='w:r'){
        const content=elements(n).map(convert).join(''),pr=child(n,'w:rPr');
        const vertical=attr(child(pr,'w:vertAlign'),'w:val');
        if(!content)return '';
        return vertical==='superscript'?'^{'+content+'}':vertical==='subscript'?'_{'+content+'}':content;
      }
      if(['m:m','m:acc','m:bar','m:groupChr','m:limLow','m:limUpp'].includes(name))warnings.push('存在需人工核对的复杂公式结构：'+name.slice(2));
      return elements(n).map(convert).join('');
    }
    return {text:convert(tree),warnings:[...new Set(warnings)]};
  }
  function parseInline(source,depth=0){
    const s=String(source||'');if(depth>24||s.length>30000)return [{type:'text',text:s}];
    const result=[];let literal='';
    const flush=()=>{if(literal){result.push({type:'text',text:literal});literal='';}};
    function group(at){
      if(s[at]!=='{')return null;let level=1;
      for(let j=at+1;j<s.length;j++){if(s[j]==='{')level++;else if(s[j]==='}'&&--level===0)return {text:s.slice(at+1,j),end:j+1};if(level>30)return null;}
      return null;
    }
    for(let i=0;i<s.length;){
      const mark=s[i];
      if((mark==='^'||mark==='_')&&s[i+1]==='{'){
        const g=group(i+1);if(g){flush();result.push({type:mark==='^'?'sup':'sub',children:parseInline(g.text,depth+1)});i=g.end;continue;}
      }
      let matched=false;
      for(const [command,type,arity] of [['\\frac','frac',2],['\\sqrt','sqrt',1],['\\root','root',2]]){
        if(!s.startsWith(command+'{',i))continue;
        const a=group(i+command.length),b=arity===2&&a?group(a.end):null;
        if(a&&(arity===1||b)){flush();result.push({type,children:parseInline(a.text,depth+1),other:b?parseInline(b.text,depth+1):[]});i=b?b.end:a.end;matched=true;break;}
      }
      if(!matched){literal+=s[i];i++;}
    }
    flush();return result;
  }
  function hasFormatting(s){return /[\^_]\{|\\(?:frac|sqrt|root)\{/.test(String(s||''));}
  function renderInline(value,target){
    const doc=target.ownerDocument;
    function render(nodes,host){for(let i=0;i<nodes.length;i++){
      const n=nodes[i];if(n.type==='text'){host.append(doc.createTextNode(n.text));continue;}
      if(n.type==='sup'||n.type==='sub'){
        const next=nodes[i+1];
        if(next&&(next.type==='sup'||next.type==='sub')&&next.type!==n.type){
          const pair=doc.createElement('span');pair.className='quizzle-math-scripts';
          for(const x of [n,next]){const part=doc.createElement(x.type);render(x.children,part);pair.append(part);}host.append(pair);i++;continue;
        }
        const el=doc.createElement(n.type);el.className='quizzle-math-'+n.type;render(n.children,el);host.append(el);continue;
      }
      if(n.type==='frac'){
        const fraction=doc.createElement('span');fraction.className='quizzle-math-frac';fraction.setAttribute('role','math');
        const numerator=doc.createElement('span'),denominator=doc.createElement('span');numerator.className='quizzle-math-num';denominator.className='quizzle-math-den';
        render(n.children,numerator);render(n.other,denominator);fraction.append(numerator,denominator);host.append(fraction);continue;
      }
      const radical=doc.createElement('span');radical.className='quizzle-math-root';
      if(n.type==='root'){const degree=doc.createElement('sup');degree.className='quizzle-math-degree';render(n.children,degree);radical.append(degree);}
      radical.append(doc.createTextNode('√'));const contents=doc.createElement('span');contents.className='quizzle-math-radicand';render(n.type==='root'?n.other:n.children,contents);radical.append(contents);host.append(radical);
    }}
    target.replaceChildren();render(parseInline(value),target);return target;
  }
  const css='.quizzle-math{white-space:pre-wrap;line-height:1.9;overflow-wrap:anywhere}.quizzle-math-sup,.quizzle-math-sub{font-size:.72em;line-height:0;position:relative;vertical-align:baseline}.quizzle-math-sup{top:-.55em}.quizzle-math-sub{top:.28em}.quizzle-math-frac{display:inline-flex;vertical-align:-.5em;flex-direction:column;align-items:stretch;text-align:center;line-height:1.2;margin:0 .13em;font-size:.95em}.quizzle-math-num{display:block;padding:0 .16em .05em;border-bottom:1px solid currentColor}.quizzle-math-den{display:block;padding:.05em .16em 0}.quizzle-math-scripts{display:inline-grid;vertical-align:-.25em;grid-template-rows:1fr 1fr;line-height:1;font-size:.72em}.quizzle-math-scripts>sup,.quizzle-math-scripts>sub{font:inherit;position:static;grid-column:1}.quizzle-math-scripts>sup{grid-row:1}.quizzle-math-scripts>sub{grid-row:2}.quizzle-math-root{display:inline-block;white-space:nowrap}.quizzle-math-radicand{border-top:1px solid currentColor;padding:.08em .12em 0 0}.quizzle-math-degree{font-size:.6em;margin-right:-.1em}';
  return {wordParagraphText,parseInline,hasFormatting,renderInline,css};
});


if(typeof globalThis.QuizzleMediaScan==='function')globalThis.QuizzleMediaScan();

/* SCHOOL_IMPORT_MATH_RENDER_V1 */
/*
 * The student page is rendered by the existing Quizzle client after the
 * document has loaded.  Older media patches only replaced image markers and
 * therefore left formula source such as x^{2} and x_{1} visible.  This small
 * client scans the rendered question text after every SPA update and uses the
 * shared, offline-safe QuizzleMath renderer.
 */
(()=>{
  'use strict';
  if(typeof document==='undefined')return;
  const cssHost=document.createElement('style');
  cssHost.dataset.quizzleMathRender='1';
  document.head?.append(cssHost);
  function addCss(){
    if(!cssHost.parentNode&&document.head)document.head.append(cssHost);
    if(globalThis.QuizzleMath?.css&&!cssHost.dataset.ready){
      cssHost.textContent=globalThis.QuizzleMath.css;
      cssHost.dataset.ready='1';
    }
  }
  function ignored(node){
    const parent=node.parentElement;
    if(!parent)return true;
    const tag=parent.tagName;
    if(tag==='SCRIPT'||tag==='STYLE'||tag==='TEXTAREA'||tag==='INPUT'||tag==='OPTION')return true;
    return !!parent.closest('.quizzle-math,[data-quizzle-math-ignore="true"]');
  }
  function nodes(){
    if(!document.body||typeof NodeFilter==='undefined')return[];
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),out=[];
    let n;
    while((n=walker.nextNode()))if(!ignored(n))out.push(n);
    return out;
  }
  function replace(node){
    const math=globalThis.QuizzleMath,value=node.nodeValue||'';
    if(!math||!math.hasFormatting(value))return;
    const host=document.createElement('span');
    host.className='quizzle-math';
    host.setAttribute('role','math');
    math.renderInline(value,host);
    node.parentNode?.replaceChild(host,node);
  }
  function scan(){
    addCss();
    for(const node of nodes())replace(node);
  }
  function setup(){
    globalThis.QuizzleMathScan=scan;
    scan();
    if(typeof MutationObserver==='function'&&document.body){
      new MutationObserver(scan).observe(document.body,{childList:true,subtree:true,characterData:true});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();
/* END_SCHOOL_IMPORT_MATH_RENDER_V1 */

