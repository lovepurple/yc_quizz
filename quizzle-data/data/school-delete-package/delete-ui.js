(()=>{'use strict';
const $=id=>document.getElementById(id);
const api=async (p,method='GET',body)=>{const r=await fetch('/api/school/admin'+p,{method,credentials:'same-origin',cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.message||'操作失败（'+r.status+'）');return d;};
function el(tag,text){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;}
const style=el('style');style.textContent=`.qds-del{border:1px solid #f3a5a5!important;background:#fff4f4!important;color:#bf2626!important;margin-left:5px!important}.qds-del:hover{background:#fee2e2!important}.qds-recycle{margin:18px 0;background:#fff;border:1px solid #e1def3;border-radius:18px;padding:20px 24px}.qds-recycle h2{margin:0 0 12px}.qds-section{margin-top:16px}.qds-line{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 4px;border-bottom:1px solid #eeedf4}.qds-line button{flex-shrink:0}.qds-feedback{color:#6948cc;font-size:13px;margin-left:10px}.qds-muted{font-size:13px;color:#756e87;margin:4px 0 12px}.qds-toggle{border:1px solid #c6baf6;color:#5135ab;border-radius:9px;padding:9px 13px;background:#faf8ff;cursor:pointer}.qds-body[hidden]{display:none}@media(max-width:600px){.qds-line{align-items:start;flex-direction:column}}`;
document.head.append(style);
let pending=false,timer=0,version=0;
function button(text,callback,danger){const b=el('button',text);b.type='button';b.className=danger?'light small qds-del':'light small';b.addEventListener('click',callback);return b;}
function ask(kind,name){return window.confirm('请确认是否删除'+kind+'：'+name+'？\n\n删除后将移入回收站，学生无法再访问对应账号或测验任务。\n原有答题和成绩文件会保留，可在回收站恢复。\n\n确定继续吗？');}
function flash(text){let node=$('qds-flash');if(!node){node=el('span');node.id='qds-flash';node.className='qds-feedback';const host=$('totalAccounts');host?.after(node);}node.textContent=text;}
async function makeAccountButtons(){const tb=$('accountsBody');if(!tb||pending)return;
 const rows=[...tb.querySelectorAll('tr')].filter(row=>row.cells.length===6&&row.cells[0]?.textContent&&!row.querySelector('.qds-del'));
 if(!rows.length)return;pending=true;
 try{
  const pageMatch=($('pageText')?.textContent||'').match(/第\s*(\d+)\s*页/);const page=pageMatch?Number(pageMatch[1]):1;
  const query=($('search')?.value||'').trim();const data=await api('/accounts?page='+page+'&q='+encodeURIComponent(query));
  const ids=new Map(data.accounts.map(a=>[a.username,a]));
  for(const row of rows){if(!row.isConnected)continue;const user=row.cells[0]?.textContent?.trim(),a=ids.get(user),operation=row.cells[5];if(!a||!operation||row.querySelector('.qds-del'))continue;
   operation.append(button('删除',async()=>{if(!ask('学生账号',a.name+'（'+a.username+' / '+a.className+'）'))return;try{await api('/accounts/'+encodeURIComponent(a.id),'DELETE',{confirm:a.username});flash('已移入回收站：'+a.username);const reload=$('reloadBtn');if(reload)reload.click();else location.reload();updateRecycleIfOpen();}catch(e){alert('删除失败：'+e.message);}},true));
  }
 }catch(e){console.warn('[delete addon] load accounts',e);}finally{pending=false;}
}
function makeAssignmentButtons(){const tb=$('assignmentBody');if(!tb)return;for(const row of [...tb.querySelectorAll('tr')]){
 if(row.cells.length!==6||row.querySelector('.qds-del'))continue;const c=row.cells[0]?.textContent?.trim()?.toUpperCase();if(!/^[A-Z]{4}$/.test(c))continue;const title=row.cells[1]?.textContent?.trim()||'';
 row.cells[5].append(button('删除',async()=>{if(!ask('测验任务',title+'（'+c+'）'))return;
 try{await api('/assignments/'+encodeURIComponent(c),'DELETE',{confirm:c});row.remove();flash('测验任务 '+c+' 已移入回收站。原始试卷及成绩保留。');updateRecycleIfOpen();}catch(e){alert('删除失败：'+e.message);}},true));
 }}
let body=null;
async function loadRecycle(){if(!body||body.hidden)return;body.replaceChildren(el('p','正在查询回收站…'));
 try{const {accounts=[],assignments=[]}=await api('/recycle');body.replaceChildren();
  function section(title,arr,kind){const box=el('section');box.className='qds-section';box.append(el('h3',title+'（'+arr.length+'）'));
   if(!arr.length){const hint=el('p','暂无已删除内容');hint.className='qds-muted';box.append(hint);}
   for(const a of arr){const line=el('div');line.className='qds-line';const desc=el('span',kind==='account'?`${a.name}（${a.username} · ${a.className}）`: `${a.title}（${a.code} · ${a.className||'全校'}）`);const b=button('恢复',async()=>{
    const display=kind==='account'?a.username:a.code;
    if(!confirm('确认恢复 '+display+'？\n测验恢复后默认为暂停，需教师主动点击「开放」。'))return;
    b.disabled=true;try{const url=kind==='account'?'/accounts/'+encodeURIComponent(a.id)+'/restore':'/assignments/'+encodeURIComponent(a.code)+'/restore';const resp=await api(url,'POST',{});alert(resp.message||'恢复成功');await loadRecycle();if(kind==='account')$('reloadBtn')?.click();else location.reload();}
    catch(e){alert('恢复失败：'+e.message);b.disabled=false;}
   });line.append(desc,b);box.append(line);}
   return box;
  }
  body.append(section('已删除学生账号',accounts,'account'),section('已删除测验任务',assignments,'assignment'));
  const note=el('p','本版采用可恢复删除，不直接清空学生历史成绩或原始试卷。若确实需要永久删除个人信息，请由学校管理员另行审核并进行专项数据清理。');note.className='qds-muted';body.append(note);
 }catch(e){body.replaceChildren(el('p','加载失败：'+e.message));}
}
function updateRecycleIfOpen(){if(body&&!body.hidden)loadRecycle();}
function setup(){if($('qds-panel')||!$('content'))return;
 const panel=el('section');panel.id='qds-panel';panel.className='qds-recycle';const top=el('div');top.style='display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap';top.append(el('h2','🗑️ 回收站 · 删除记录'));
 const toggle=button('查看回收站',()=>{body.hidden=!body.hidden;toggle.textContent=body.hidden?'查看回收站':'收起回收站';if(!body.hidden)loadRecycle();});toggle.className='qds-toggle';top.append(toggle);panel.append(top);
 const note=el('p','教师可删除自己任教班级的学生账号、自己负责的测验任务；超级管理员可管理全校。删除前会弹窗二次确认。');note.className='qds-muted';panel.append(note);
 body=el('div');body.className='qds-body';body.hidden=true;panel.append(body);
 const assignmentTable=$('assignmentBody');const card=assignmentTable?.closest('.card');if(card)card.after(panel);else $('content').append(panel);
 const obs=()=>{clearTimeout(timer);timer=setTimeout(()=>{makeAccountButtons();makeAssignmentButtons();},90);};
 const accounts=$('accountsBody'),assignments=$('assignmentBody');if(accounts)new MutationObserver(obs).observe(accounts,{childList:true,subtree:false});if(assignments)new MutationObserver(obs).observe(assignments,{childList:true,subtree:false});obs();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
