(()=>{
'use strict';
const $=id=>document.getElementById(id);
const state={meta:null,page:1,total:0,questions:[],parsed:[],drawn:[],filters:null,allocation:null,editingId:null,answers:[]};
const SOURCES=['教材原题','学科网','练习册','教师题库'];
const DIFF={easy:'简单',medium:'中等',hard:'困难'};
const api=async(path,method='GET',body)=>{
 const response=await fetch('/api/question-bank'+path,{method,credentials:'same-origin',cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok){const error=new Error(data.message||('请求失败：'+response.status));error.data=data;throw error;}
 return data;
};
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined&&text!==null)node.textContent=text;if(className)node.className=className;return node;};
const splitList=value=>String(value||'').split(/[，,、;；\n]/).map(x=>x.trim()).filter(Boolean);
const setMessage=(node,message,type='')=>{node.textContent=message||'';node.className='message'+(type?' '+type:'');};
const addOption=(select,value,label,selected=false)=>{const option=el('option',label);option.value=value;option.selected=selected;select.append(option);};
function switchTab(name){document.querySelectorAll('.tab').forEach(tab=>tab.classList.toggle('active',tab.dataset.tab===name));document.querySelectorAll('.panel').forEach(panel=>panel.classList.toggle('active',panel.id==='panel-'+name));if(name==='bank')loadQuestions().catch(showError);if(name==='draw')refreshDrawChoices();}
function showError(error){console.error(error);alert(error.message||'操作失败');}
function populateSelect(id,values,firstLabel,selected=''){
 const select=$(id);if(!select)return;select.replaceChildren();addOption(select,'',firstLabel,selected==='');
 for(const value of values||[])addOption(select,value,value,selected===value);
}
function populateClasses(id,selected=''){
 const select=$(id);if(!select)return;select.replaceChildren();
 const isAdmin=state.meta?.role==='admin';
 addOption(select,'',isAdmin?'不限定班级':'请选择任教班级',selected==='');
 for(const name of state.meta?.classes||[])addOption(select,name,name,selected===name);
 if(!isAdmin&&!selected&&state.meta?.classes?.length&&['drawClass','publishClass'].includes(id))select.value=state.meta.classes[0];
}
function updateStats(){
 const stats=$('bankStats');if(!stats||!state.meta)return;
 const vals=[state.meta.counts?.total||0,...SOURCES.map(source=>state.meta.counts?.bySource?.[source]||0)];
 const names=['题库总量','教材原题','学科网','练习册','教师题库'];stats.replaceChildren();
 vals.forEach((value,index)=>{const box=el('div');box.append(el('strong',String(value)),el('span',names[index]));stats.append(box);});
}
function renderCheckCloud(containerId,values){
 const host=$(containerId);host.replaceChildren();
 if(!values?.length){host.append(el('span','题库暂无可选项','muted'));return;}
 values.forEach(value=>{const label=el('label');const input=el('input');input.type='checkbox';input.value=value;label.append(input,document.createTextNode(value));host.append(label);});
}
function selectedChecks(id){return [...$(id).querySelectorAll('input[type=checkbox]:checked')].map(input=>input.value);}
async function loadMeta(){
 state.meta=await api('/meta');updateStats();
 populateSelect('filterSource',SOURCES,'全部来源');populateSelect('filterGrade',state.meta.grades,'全部年级');populateSelect('filterSubject',state.meta.subjects,'全部学科');populateSelect('filterKnowledge',state.meta.knowledgePoints,'全部知识点');populateSelect('filterTag',state.meta.tags,'全部标签');
 populateSelect('drawGrade',state.meta.grades,'全部年级');populateSelect('drawSubject',state.meta.subjects,'全部学科');
 ['importClass','editClass','drawClass','publishClass'].forEach(id=>populateClasses(id));
 renderCheckCloud('drawKnowledge',state.meta.knowledgePoints);renderCheckCloud('drawTags',state.meta.tags);
 if(state.meta.role==='teacher'&&!state.meta.classes.length){$('drawMessage').textContent='当前教师账号尚未分配任教班级，请联系管理员分配班级后再组卷。';$('drawBtn').disabled=true;}
 else $('drawBtn').disabled=false;
 await loadQuestions();
}
function sourceClass(source){return source==='学科网'?'source-xkw':source==='练习册'?'source-workbook':source==='教师题库'?'source-teacher':'source-tag';}
function addTagCell(td,values){(values||[]).forEach(value=>td.append(el('span',value,'tag')));if(!values?.length)td.textContent='—';}
function queryFilters(){return {q:$('filterQ').value.trim(),source:$('filterSource').value,grade:$('filterGrade').value,subject:$('filterSubject').value,difficulty:$('filterDifficulty').value,knowledgePoint:$('filterKnowledge').value,tag:$('filterTag').value};}
async function loadQuestions(){
 const query=queryFilters();query.page=state.page;const params=new URLSearchParams(query);
 const data=await api('/questions?'+params.toString());state.total=data.total;state.questions=data.questions;
 $('listSummary').textContent='当前筛选 '+data.total+' 道题 · 每页 '+data.pageSize+' 道';$('pageText').textContent='第 '+data.page+' 页 / 共 '+Math.max(1,Math.ceil(data.total/data.pageSize))+' 页';
 $('prevPage').disabled=state.page<=1;$('nextPage').disabled=state.page>=Math.ceil(data.total/data.pageSize)||data.total===0;
 const tbody=$('questionRows');tbody.replaceChildren();
 if(!data.questions.length){const row=el('tr'),cell=el('td','当前条件下没有找到题目。可先导入 Word / Excel 试题。','empty-cell');cell.colSpan=8;row.append(cell);tbody.append(row);return;}
 for(const question of data.questions){
  const row=el('tr');
  const title=el('td',question.title,'question-cell');if(question.media?.length)title.append(el('div','含 '+question.media.length+' 个图片/视频','muted'));row.append(title);
  const source=el('td');source.append(el('span',question.source,'tag '+sourceClass(question.source)));row.append(source);
  row.append(el('td',(question.grade||'—')+' / '+(question.subject||'—')));
  row.append(el('td',DIFF[question.difficulty]||'—','difficulty '+question.difficulty));
  const kp=el('td');addTagCell(kp,question.knowledgePoints);row.append(kp);
  const tags=el('td');addTagCell(tags,question.tags);row.append(tags);
  row.append(el('td',String(question.points)));
  const actions=el('td');actions.className='row-actions';
  const edit=el('button','编辑','secondary');edit.type='button';edit.onclick=()=>openEditor(question);
  const del=el('button','删除','ghost');del.type='button';del.onclick=()=>deleteQuestion(question);
  actions.append(edit,del);row.append(actions);tbody.append(row);
 }
}
async function deleteQuestion(question){
 if(!confirm('确定删除这道题吗？\n'+question.title.slice(0,90)+'\n删除后不会影响已经发布的试卷和历史成绩。'))return;
 try{await api('/questions/'+encodeURIComponent(question.id),'DELETE');await Promise.all([loadMeta(),loadQuestions()]);}catch(error){showError(error);}
}
function file64(file){return file.arrayBuffer().then(buffer=>{const bytes=new Uint8Array(buffer);let binary='';for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));return btoa(binary);});}
function importMetadata(){
 return {source:$('importSource').value,grade:$('importGrade').value.trim(),subject:$('importSubject').value.trim(),difficulty:$('importDifficulty').value,knowledgePoints:splitList($('importKnowledge').value),tags:splitList($('importTags').value),className:$('importClass').value};
}
function validateImportMetadata(){
 const m=importMetadata();const missing=[];
 if(!m.source)missing.push('试题来源');if(!m.grade)missing.push('年级');if(!m.subject)missing.push('学科');if(!m.knowledgePoints.length)missing.push('知识点');if(!m.tags.length)missing.push('分类标签');
 if(missing.length){setMessage($('importMessage'),'请先填写：'+missing.join('、'),'error');return false;}
 if(m.className&&state.meta.role==='teacher'&&!state.meta.classes.includes(m.className)){setMessage($('importMessage'),'只能选择自己任教的班级','error');return false;}
 return true;
}
function renderImportPreview(){
 const host=$('importPreview');host.replaceChildren();
 if(!state.parsed.length){host.append(el('div','选择 Word 或 Excel 文件后，识别的题目会显示在这里。','empty-state'));$('saveImportBtn').disabled=true;$('importSummary').textContent='等待选择文件';return;}
 const invalid=state.parsed.filter(q=>Array.isArray(q.warning)&&q.warning.length).length;
 $('importSummary').textContent='识别 '+state.parsed.length+' 题 · '+(state.parsed.length-invalid)+' 题通过初步检查'+(invalid?' · '+invalid+' 题需要修正':'');
 state.parsed.forEach((question,index)=>{
  const card=el('article',undefined,'preview-item');const head=el('div',undefined,'preview-head');head.append(el('b','第 '+(index+1)+' 题 · '+(question.type==='multiple-choice'?'选择题':question.type==='true-false'?'判断题':'填空题')));head.append(el('span',''+(Number(question.points)||0)+' 分','tag'));card.append(head);
  card.append(el('p',question.title||'（题干未识别）'));
  const answerText=question.type==='text'?(question.answers||[]).map(a=>a.content).join(' / '):(question.answers||[]).map((a,i)=>String.fromCharCode(65+i)+'. '+a.content+(a.is_correct?' ✓':'')).join('　');
  if(answerText)card.append(el('p','答案 / 选项：'+answerText,'muted'));
  const meta=el('div',undefined,'preview-meta');if(question.media?.length)meta.append(el('span','媒体 '+question.media.length+' 个','tag'));if(question.origin)meta.append(el('span',question.origin,'tag'));card.append(meta);
  if(question.warning?.length)card.append(el('div','需修正：'+question.warning.join('；'),'preview-warning'));
  if(question.notes?.length)card.append(el('div',question.notes.join('；'),'hint'));
  const defaults=importMetadata();
  const metaEditor=el('div',undefined,'preview-meta-editor');
  const sourceLabel=el('label','本题来源 *');const sourceSelect=el('select',undefined,'qb-source');addOption(sourceSelect,'','请选择来源');SOURCES.forEach(source=>addOption(sourceSelect,source,source,source===(question.bankMetadata?.source||defaults.source)));sourceLabel.append(sourceSelect);metaEditor.append(sourceLabel);
  const diffLabel=el('label','本题难度 *');const diffSelect=el('select',undefined,'qb-difficulty');[['easy','简单'],['medium','中等'],['hard','困难']].forEach(([value,label])=>addOption(diffSelect,value,label,value===(question.bankMetadata?.difficulty||defaults.difficulty||'medium')));diffLabel.append(diffSelect);metaEditor.append(diffLabel);
  const kpLabel=el('label','本题知识点 *');kpLabel.className='full';const kpInput=el('input',undefined,'qb-knowledge');kpInput.value=(question.bankMetadata?.knowledgePoints||defaults.knowledgePoints||[]).join(', ');kpInput.placeholder='多个知识点用逗号分隔';kpLabel.append(kpInput);metaEditor.append(kpLabel);
  const tagLabel=el('label','本题分类标签 *');tagLabel.className='full';const tagInput=el('input',undefined,'qb-tags');tagInput.value=(question.bankMetadata?.tags||defaults.tags||[]).join(', ');tagInput.placeholder='多个标签用逗号分隔';tagLabel.append(tagInput);metaEditor.append(tagLabel);
  card.append(metaEditor);host.append(card);
 });
 $('saveImportBtn').disabled=invalid>0;
 if(invalid)setMessage($('importMessage'),'识别结果中有 '+invalid+' 道题未通过校验，请修正原文件后重新导入。','error');
 else setMessage($('importMessage'),'识别完成。填写上方必填分类信息后即可保存。');
}
$('questionFile').addEventListener('change',event=>{
 const file=event.target.files?.[0]||null;$('fileName').textContent=file?file.name+' · '+(file.size/1024/1024).toFixed(2)+' MB':'尚未选择文件';$('parseFileBtn').disabled=!file;state.parsed=[];renderImportPreview();setMessage($('importMessage'),'');
});
$('parseFileBtn').onclick=async()=>{
 const file=$('questionFile').files?.[0];if(!file)return;
 if(!/\.(docx|xlsx)$/i.test(file.name)){setMessage($('importMessage'),'请上传 .docx 或 .xlsx 文件；旧格式请先另存为新格式。','error');return;}
 if(file.size>9*1024*1024){setMessage($('importMessage'),'文件超过9MB，请拆分后上传。','error');return;}
 $('parseFileBtn').disabled=true;setMessage($('importMessage'),'正在识别题目、选项、答案、公式和媒体…');
 try{
  const result=await fetch('/api/school-import/parse',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:file.name,base64:await file64(file)})});
  const data=await result.json().catch(()=>({}));if(!result.ok)throw new Error(data.message||'文件识别失败');
  state.parsed=data.questions||[];renderImportPreview();if(!state.parsed.length)setMessage($('importMessage'),'没有识别到题目，请检查文件格式。','error');
 }catch(error){setMessage($('importMessage'),error.message,'error');}
 finally{$('parseFileBtn').disabled=false;}
};
$('applyDefaultsBtn').onclick=()=>{
 const defaults=importMetadata();
 document.querySelectorAll('.preview-item').forEach(card=>{
  const source=card.querySelector('.qb-source'),difficulty=card.querySelector('.qb-difficulty'),knowledge=card.querySelector('.qb-knowledge'),tags=card.querySelector('.qb-tags');
  if(source)source.value=defaults.source;if(difficulty)difficulty.value=defaults.difficulty;if(knowledge)knowledge.value=defaults.knowledgePoints.join(', ');if(tags)tags.value=defaults.tags.join(', ');
 });
 setMessage($('importMessage'),'已将左侧默认分类应用到全部题目。','success');
};
$('saveImportBtn').onclick=async()=>{
 if(!state.parsed.length||!validateImportMetadata())return;
 if(state.parsed.some(q=>q.warning?.length)){setMessage($('importMessage'),'仍有未通过校验的题目，不能保存。','error');return;}
 const cards=[...$('importPreview').querySelectorAll('.preview-item')];
 const questions=state.parsed.map((question,index)=>{
  const card=cards[index];return {...question,bankMetadata:{source:card?.querySelector('.qb-source')?.value||'',difficulty:card?.querySelector('.qb-difficulty')?.value||'',knowledgePoints:splitList(card?.querySelector('.qb-knowledge')?.value),tags:splitList(card?.querySelector('.qb-tags')?.value)}};
 });
 const missing=questions.map((q,i)=>({i,meta:q.bankMetadata})).filter(row=>!row.meta.source||!row.meta.difficulty||!row.meta.knowledgePoints.length||!row.meta.tags.length);
 if(missing.length){setMessage($('importMessage'),'第 '+missing.slice(0,8).map(x=>x.i+1).join('、')+' 题的来源、难度、知识点或标签未填写完整。','error');return;}
 $('saveImportBtn').disabled=true;setMessage($('importMessage'),'正在保存题目和媒体文件…');
 try{
  const result=await api('/import','POST',{questions,metadata:importMetadata()});
  setMessage($('importMessage'),'保存成功：已归档 '+result.imported+' 道题。','success');state.parsed=[];$('questionFile').value='';$('fileName').textContent='尚未选择文件';renderImportPreview();
  await loadMeta();switchTab('bank');
 }catch(error){setMessage($('importMessage'),error.message,'error');}
 finally{$('saveImportBtn').disabled=!state.parsed.length;}
};
$('clearImportBtn').onclick=()=>{state.parsed=[];$('questionFile').value='';$('fileName').textContent='尚未选择文件';renderImportPreview();setMessage($('importMessage'),'');};

function openEditor(question=null){
 state.editingId=question?.id||null;
 $('modalTitle').textContent=question?'编辑题目':'手动新增题目';$('editTitle').value=question?.title||'';$('editType').value=question?.type||'multiple-choice';$('editPoints').value=question?.points??2;
 $('editSource').value=question?.source||'教师题库';$('editGrade').value=question?.grade||$('importGrade').value||'';$('editSubject').value=question?.subject||$('importSubject').value||'';$('editDifficulty').value=question?.difficulty||'medium';
 $('editKnowledge').value=(question?.knowledgePoints||splitList($('importKnowledge').value)).join(', ');$('editTags').value=(question?.tags||splitList($('importTags').value)).join(', ');populateClasses('editClass',question?.className||'');
 if(question){state.answers=(question.answers||[]).map(a=>({...a}));}else if($('editType').value==='true-false'){state.answers=[{content:'正确',is_correct:true},{content:'错误',is_correct:false}];}else if($('editType').value==='text'){state.answers=[{content:''}];}else{state.answers=[{content:'',is_correct:true},{content:'',is_correct:false},{content:'',is_correct:false},{content:'',is_correct:false}];}
 renderAnswerEditor();setMessage($('editMessage'),'');$('editModal').classList.add('open');$('editModal').setAttribute('aria-hidden','false');
}
function renderAnswerEditor(){
 const host=$('editAnswers');host.replaceChildren();const type=$('editType').value;
 if(type==='text'){
  host.append(el('h4','参考答案（多个可接受答案用 | 分隔）'));
  const input=el('input');input.type='text';input.id='editFillAnswers';input.value=state.answers.map(a=>a.content).join(' | ');input.placeholder='例如：数据包 | 分组';input.style='width:100%;padding:10px;border:1px solid #dfdce9;border-radius:8px;font:inherit';host.append(input);return;
 }
 host.append(el('h4',type==='true-false'?'选择正确的判断答案':'填写选项，并勾选正确答案（可多选）'));
 if(type==='true-false'){
  if(state.answers.length!==2)state.answers=[{content:'正确',is_correct:true},{content:'错误',is_correct:false}];
  state.answers.forEach((answer,index)=>{const row=el('label',undefined,'answer-row');const radio=el('input');radio.type='radio';radio.name='editCorrect';radio.checked=!!answer.is_correct;radio.onchange=()=>state.answers.forEach((a,i)=>a.is_correct=i===index);row.append(radio,el('span',index===0?'正确':'错误'),el('span','正确答案','correct-label'));host.append(row);});return;
 }
 state.answers.forEach((answer,index)=>{
  const row=el('div',undefined,'answer-row');const check=el('input');check.type='checkbox';check.checked=!!answer.is_correct;check.title='勾选为正确答案';check.onchange=()=>answer.is_correct=check.checked;
  const input=el('input');input.type='text';input.value=answer.content||'';input.placeholder='选项 '+String.fromCharCode(65+index);input.oninput=()=>answer.content=input.value;
  const remove=el('button','移除');remove.type='button';remove.disabled=state.answers.length<=2;remove.onclick=()=>{state.answers.splice(index,1);renderAnswerEditor();};
  row.append(check,input,remove);host.append(row);
 });
 const actions=el('div',undefined,'answer-actions');const add=el('button','＋ 添加选项','ghost');add.type='button';add.disabled=state.answers.length>=6;add.onclick=()=>{state.answers.push({content:'',is_correct:false});renderAnswerEditor();};actions.append(add);host.append(actions);
}
$('editType').onchange=()=>{const type=$('editType').value;if(type==='true-false')state.answers=[{content:'正确',is_correct:true},{content:'错误',is_correct:false}];else if(type==='text')state.answers=[{content:''}];else state.answers=[{content:'',is_correct:true},{content:'',is_correct:false},{content:'',is_correct:false},{content:'',is_correct:false}];renderAnswerEditor();};
$('manualAddBtn').onclick=()=>openEditor(null);
document.querySelectorAll('[data-close-modal]').forEach(node=>node.addEventListener('click',()=>{$('editModal').classList.remove('open');$('editModal').setAttribute('aria-hidden','true');}));
$('editForm').onsubmit=async event=>{
 event.preventDefault();
 const type=$('editType').value;let answers;
 if(type==='text')answers=splitList($('editFillAnswers')?.value).map(content=>({content}));
 else answers=state.answers.map(answer=>({type:'text',content:String(answer.content||'').trim(),is_correct:!!answer.is_correct}));
 const question={title:$('editTitle').value.trim(),type,points:Number($('editPoints').value),answers};
 const metadata={source:$('editSource').value,grade:$('editGrade').value.trim(),subject:$('editSubject').value.trim(),difficulty:$('editDifficulty').value,knowledgePoints:splitList($('editKnowledge').value),tags:splitList($('editTags').value),className:$('editClass').value};
 if(!question.title||!metadata.source||!metadata.grade||!metadata.subject||!metadata.knowledgePoints.length||!metadata.tags.length){setMessage($('editMessage'),'请填写题目、来源、年级、学科、知识点和分类标签。','error');return;}
 if(type==='multiple-choice'&&(answers.length<2||answers.length>6||!answers.some(a=>a.content)&&!answers.some(a=>a.is_correct))){setMessage($('editMessage'),'选择题至少填写两个选项。','error');return;}
 if(type==='multiple-choice'&&answers.some(a=>!a.content)){setMessage($('editMessage'),'请补全所有选项内容。','error');return;}
 if(type==='multiple-choice'&&!answers.some(a=>a.is_correct)){setMessage($('editMessage'),'请至少勾选一个正确答案。','error');return;}
 if(type==='text'&&!answers.length){setMessage($('editMessage'),'请填写填空题参考答案。','error');return;}
 if(type==='true-false'&&answers.filter(a=>a.is_correct).length!==1){setMessage($('editMessage'),'判断题必须选择一个正确答案。','error');return;}
 $('editSaveBtn').disabled=true;setMessage($('editMessage'),'正在保存…');
 try{
  if(state.editingId)await api('/questions/'+encodeURIComponent(state.editingId),'PATCH',{question,metadata});else await api('/questions','POST',{question,metadata});
  $('editModal').classList.remove('open');$('editModal').setAttribute('aria-hidden','true');await loadMeta();await loadQuestions();
 }catch(error){setMessage($('editMessage'),error.message,'error');}
 finally{$('editSaveBtn').disabled=false;}
};

function ratioValues(){return {'教材原题':Number($('ratioTextbook').value),'学科网':Number($('ratioXkw').value),'练习册':Number($('ratioWorkbook').value),'教师题库':Number($('ratioTeacher').value)};}
function ratioSum(){return Object.values(ratioValues()).reduce((sum,value)=>sum+(Number.isFinite(value)?value:0),0);}
function updateRatioHint(){const sum=ratioSum(),node=$('ratioHint').parentElement;node.classList.toggle('invalid',sum!==100);$('ratioHint').textContent='当前比例合计：'+sum+'%'+(sum===100?'':'（必须为100%）');}
['ratioTextbook','ratioXkw','ratioWorkbook','ratioTeacher'].forEach(id=>$(id).addEventListener('input',updateRatioHint));
$('resetRatioBtn').onclick=()=>{$('ratioTextbook').value=10;$('ratioXkw').value=20;$('ratioWorkbook').value=35;$('ratioTeacher').value=35;updateRatioHint();};
function drawFilters(){return {className:$('drawClass').value,grade:$('drawGrade').value,subject:$('drawSubject').value,difficulty:$('drawDifficulty').value,knowledgePoints:selectedChecks('drawKnowledge'),tags:selectedChecks('drawTags')};}
function renderAllocation(allocation){
 const host=$('allocationView');host.replaceChildren();SOURCES.forEach(source=>{const box=el('div',undefined,'allocation-chip');box.append(el('span',source),el('b',String(allocation?.[source]||0)+' 题'));host.append(box);});
}
function renderDrawn(){
 const host=$('drawQuestions');host.replaceChildren();
 if(!state.drawn.length){host.append(el('div','暂无抽题结果。','empty-state'));$('publishBtn').disabled=true;return;}
 state.drawn.forEach((question,index)=>{
  const card=el('article',undefined,'draw-item');const top=el('div',undefined,'draw-item-top');top.append(el('span','第 '+(index+1)+' 题 · '+question.source,'tag '+sourceClass(question.source)));
  const actions=el('div',undefined,'draw-item-actions');const swap=el('button','换一道','ghost');swap.type='button';swap.onclick=()=>replaceDrawn(question.id);actions.append(swap);top.append(actions);card.append(top);
  card.append(el('div',question.title,'draw-item-title'));
  const meta=el('div',undefined,'draw-item-meta');meta.append(el('span',DIFF[question.difficulty]||'—','tag'),el('span',question.grade+' / '+question.subject,'tag'),el('span',question.points+'分','tag'));
  (question.knowledgePoints||[]).forEach(value=>meta.append(el('span',value,'tag')));(question.tags||[]).forEach(value=>meta.append(el('span',value,'tag')));if(question.media?.length)meta.append(el('span','媒体 '+question.media.length+' 个','tag'));card.append(meta);host.append(card);
 });
 $('publishBtn').disabled=false;
}
function refreshDrawChoices(){if(state.meta){renderCheckCloud('drawKnowledge',state.meta.knowledgePoints);renderCheckCloud('drawTags',state.meta.tags);}}
$('drawBtn').onclick=async()=>{
 const count=Number($('drawCount').value);if(!Number.isInteger(count)||count<1||count>50){setMessage($('drawMessage'),'题量必须为1至50题。','error');return;}
 if(ratioSum()!==100){setMessage($('drawMessage'),'四类来源比例合计必须为100%。','error');return;}
 const filters=drawFilters();if(state.meta.role==='teacher'&&!filters.className){setMessage($('drawMessage'),'请选择任教班级后再组卷。','error');return;}
 $('drawBtn').disabled=true;setMessage($('drawMessage'),'正在按来源比例抽题…');
 try{
  const data=await api('/draw','POST',{...filters,count,ratios:ratioValues()});state.drawn=data.questions;state.filters=filters;state.allocation=data.allocation;renderAllocation(data.allocation);renderDrawn();
  $('drawSummary').textContent='已抽取 '+data.count+' 道题 · 总分 '+data.totalPoints+' 分 · 来源比例已按题量取整';
  $('redrawBtn').disabled=false;
  $('publishClass').value=filters.className||'';const grade=filters.grade||'';const subject=filters.subject||'';$('publishTitle').value=(grade?grade:'')+(subject?subject:'')+'自动组卷';
  setMessage($('drawMessage'),'抽题成功。请检查题目后发布。','success');
 }catch(error){
  state.drawn=[];renderDrawn();if(error.data?.shortages){const text=error.data.shortages.map(item=>item.source+'：需要'+item.required+'题，现有'+item.available+'题').join('；');setMessage($('drawMessage'),error.message+' '+text,'error');renderAllocation(error.data.allocation||{});}else setMessage($('drawMessage'),error.message,'error');
 }finally{$('drawBtn').disabled=false;}
};
$('redrawBtn').onclick=()=>{$('drawBtn').click();};
async function replaceDrawn(questionId){
 const selectedIds=state.drawn.map(item=>item.id);try{const result=await api('/replace','POST',{questionId,selectedIds,filters:state.filters});const index=state.drawn.findIndex(item=>item.id===questionId);if(index>=0){state.drawn[index]=result.question;renderDrawn();}}catch(error){setMessage($('drawMessage'),error.message,'error');}
}
$('publishBtn').onclick=async()=>{
 if(!state.drawn.length)return;
 const title=$('publishTitle').value.trim(),className=$('publishClass').value,mode=$('publishMode').value;
 if(!title){setMessage($('publishMessage'),'请输入试卷名称。','error');return;}
 if(state.meta.role==='teacher'&&!className){setMessage($('publishMessage'),'教师必须选择自己任教的班级。','error');return;}
 if(!confirm('确认发布试卷？\n'+title+'\n'+state.drawn.length+'道题 · '+(mode==='exam'?'考试':'自主练习')+' · '+(className||'全校')+'\n发布后学生登录即可看到任务。'))return;
 $('publishBtn').disabled=true;setMessage($('publishMessage'),'正在生成试卷并发布…');
 try{
  const result=await api('/publish','POST',{questionIds:state.drawn.map(item=>item.id),title,className,mode});
  setMessage($('publishMessage'),'发布成功！测验码：'+result.code+'；共'+result.count+'题，总分'+result.totalPoints+'分。学生登录后刷新任务即可作答。','success');
  $('publishMessage').append(document.createTextNode(' '));
 }catch(error){setMessage($('publishMessage'),error.message,'error');}
 finally{$('publishBtn').disabled=false;}
};

$('searchBtn').onclick=()=>{state.page=1;loadQuestions().catch(showError);};
$('resetFilterBtn').onclick=()=>{['filterQ','filterSource','filterGrade','filterSubject','filterDifficulty','filterKnowledge','filterTag'].forEach(id=>$(id).value='');state.page=1;loadQuestions().catch(showError);};
$('filterQ').addEventListener('keydown',event=>{if(event.key==='Enter')$('searchBtn').click();});
$('prevPage').onclick=()=>{if(state.page>1){state.page--;loadQuestions().catch(showError);}};
$('nextPage').onclick=()=>{state.page++;loadQuestions().catch(showError);};
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>switchTab(button.dataset.tab)));
document.querySelectorAll('[data-go]').forEach(button=>button.addEventListener('click',()=>switchTab(button.dataset.go)));
updateRatioHint();
loadMeta().catch(error=>{console.error(error);alert('题库加载失败：'+error.message+'。请确认教师账号已登录。');});
})();
