// Replaces only the teacher grant-list rendering function in teacher-roles.js.
// Continues using its existing api(), host, el(), create-teacher and transfer handlers.
async function reload(){
 let data,catalogue;
 try{
  [data,catalogue]=await Promise.all([api('/admin/teachers'),api('/admin/classes')]);
 }catch(err){host.hidden=true;console.error('[teacher grant v2]',err);return;}
 host.hidden=false;
 const classes=(catalogue.classes||[]).slice().sort((a,b)=>
   String(a.stage||'').localeCompare(String(b.stage||''),'zh-CN')||
   a.name.localeCompare(b.name,'zh-CN',{numeric:true}));
 const target=document.getElementById('teacherList');target.replaceChildren();
 const transfer=document.getElementById('transferTeacher');transfer.replaceChildren();
 for(const u of data.teachers){const opt=el('option',u.username);opt.value=u.id;transfer.append(opt);}
 for(const t of data.teachers){
  const wrap=el('div');wrap.className='class-grant-row';
  wrap.style='border-top:1px solid #e7e5f3;padding:14px 0;display:grid;grid-template-columns:minmax(90px,140px) minmax(240px,1fr) auto;gap:12px;align-items:start';
  const name=el('strong',t.username);name.style='padding-top:10px';
  const panel=el('details');panel.className='class-grant-dropdown';panel.style='border:1px solid #d9d4f4;border-radius:12px;background:#fff;padding:9px 12px;min-width:220px';
  const summary=el('summary');summary.style='cursor:pointer;color:#33296d;font-weight:600';
  const selected=new Set(t.classes||[]);
  function label(){summary.textContent='选择任教班级 · 已选 '+selected.size+' 个  ▾';}
  label();panel.append(summary);
  const filter=el('input');filter.type='search';filter.placeholder='搜索已创建的班级…';filter.setAttribute('aria-label','筛选'+t.username+'可分配的班级');filter.style='width:100%;margin:10px 0 8px';
  const list=el('div');list.className='class-grant-list';list.style='max-height:228px;overflow:auto;border:1px solid #efedf9;border-radius:8px;padding:5px';
  const note=el('p','从学校班级目录勾选，可同时选择多个班级。');note.style='font-size:12px;color:#726f86;margin:7px 0 0';
  function draw(){
   const text=filter.value.trim().toLowerCase();list.replaceChildren();
   for(const c of classes){if(text&&!`${c.name} ${c.stage||''} ${c.grade||''}`.toLowerCase().includes(text))continue;
    const row=el('label');row.style='display:flex;align-items:center;gap:8px;padding:7px 6px;cursor:pointer;border-bottom:1px solid #f3f1fa';
    const input=el('input');input.type='checkbox';input.checked=selected.has(c.name);
    input.disabled=c.active===false&&!input.checked;
    input.addEventListener('change',()=>{if(input.checked)selected.add(c.name);else selected.delete(c.name);label();});
    row.append(input,el('span',c.name+(c.active===false?'（已停用）':'')));
    list.append(row);
   }
   if(!list.children.length)list.append(el('div','没有符合条件的班级，请先在「学校班级管理」中创建。'));
  }
  filter.addEventListener('input',draw);draw();panel.append(filter,list,note);
  const save=el('button','保存班级权限');save.type='button';save.className='light small';save.style='margin-top:4px';
  save.onclick=async()=>{
   const grants=[...selected];
   if(grants.length>50){alert('每位教师最多分配50个班级');return;}
   save.disabled=true;
   try{await api('/admin/teachers/'+encodeURIComponent(t.id)+'/classes','POST',{classes:grants});
    alert('已为 '+t.username+' 保存 '+grants.length+' 个任教班级，立即生效。');await reload();
   }catch(err){alert('保存失败：'+err.message);save.disabled=false;}
  };
  wrap.append(name,panel,save);target.append(wrap);
 }
 if(!data.teachers.length)target.textContent='目前没有教师账号，可在上方创建。';
 const hint=document.getElementById('teacherClassHint');
 if(hint)hint.textContent='学校班级目录：共 '+classes.length+' 个（含空班级）；请从下拉清单勾选，避免手动输入出错。';
}
