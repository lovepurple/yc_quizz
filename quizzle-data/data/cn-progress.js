/* Quizzle 2.6.3 教师自主测验进度看板 v1
 * 只读取已有的 /api/practice/:code/results 接口，不修改原题库、成绩文件和答案。
 * 状态定义：全部题目已作答 = 已答完；作答至少一题但未完成 = 作答中。
 */
(function () {
  'use strict';
  function latestStamp(x) { const d = new Date(x && x.timestamp || 0).getTime(); return Number.isFinite(d) ? d : 0; }
  function summarize(payload, expectedInput) {
    const qs = Array.isArray(payload?.quiz?.questions) ? payload.quiz.questions : [];
    const total = qs.length;
    const attempts = Array.isArray(payload?.results) ? payload.results : [];
    const groups = new Map();
    for (const a of attempts) {
      if (!a || typeof a !== 'object') continue;
      const name = String(a.name || '匿名').trim() || '匿名';
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(a);
    }
    const students = [];
    for (const [name, all] of groups) {
      const ranked = all.slice().sort((a, b) => latestStamp(b) - latestStamp(a));
      // 重复作答按最新一次完整记录统计成绩；没有完整记录时显示最近一次作答进度。
      const chosen = ranked.find(a => total > 0 && Array.isArray(a.answers) && a.answers.length >= total) || ranked[0];
      const count = Math.min(total, Array.isArray(chosen.answers) ? chosen.answers.length : 0);
      const complete = total > 0 && count >= total;
      students.push({name, count, total, complete, score: Number(chosen.score) || 0,
        timestamp: chosen.timestamp || '', attempts: all.length, answers: Array.isArray(chosen.answers) ? chosen.answers : []});
    }
    students.sort((a,b) => Number(a.complete) - Number(b.complete) || a.name.localeCompare(b.name, 'zh-CN'));
    const complete = students.filter(s => s.complete).length;
    const started = students.filter(s => !s.complete).length;
    const expectedRaw = Number(expectedInput);
    const expected = String(expectedInput ?? '').trim() !== '' && Number.isInteger(expectedRaw) && expectedRaw > 0 && expectedRaw <= 10000 ? expectedRaw : null;
    const unseen = expected == null ? null : Math.max(0, expected - students.length);
    const questions = qs.map((q, i) => {
      let correct = 0, wrong = 0, partial = 0;
      for (const s of students) {
        const ans = s.answers[i];
        if (!ans) continue;
        if (ans.result === 'correct') correct++;
        else if (ans.result === 'partial') partial++;
        else wrong++;
      }
      const answered = correct + wrong + partial;
      return {title:String(q?.title || `第${i+1}题`), answered, correct, wrong, partial,
        accuracy:answered > 0 ? Math.round(100*correct/answered) : 0};
    });
    const denominator = expected == null ? students.length : Math.max(expected, students.length);
    return {total, attempts:attempts.length, students, complete, started, unseen, expected,
      participants:students.length, progress:denominator ? Math.round(100*complete/denominator) : 0, questions};
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = {summarize}; return; }
  if (window.__quizzleCnProgress) return;
  window.__quizzleCnProgress = true;
  const esc = val => String(val ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const style=document.createElement('style');
  style.textContent=`
    #cn-progress {box-sizing:border-box; margin:0 0 24px;background:#fff;border:1px solid #e5e3f4;border-radius:18px;padding:22px;box-shadow:0 8px 30px rgba(65,49,114,.075);font-family:Inter,"Microsoft YaHei","PingFang SC",sans-serif;color:#242337}
    #cn-progress *{box-sizing:border-box} #cn-progress .cn-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:15px}
    #cn-progress h2{font-size:20px;margin:0;color:#3e2d85;font-weight:800} #cn-progress .cn-small{font-size:12px;color:#73728a}
    #cn-progress .cn-config{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:13px}
    #cn-progress input{width:76px;height:33px;min-height:33px;border:1px solid #c9c2eb;border-radius:8px;padding:4px 8px;color:#242337;background:#fff;font-size:14px}
    #cn-progress .cn-status{color:#5e48b7;font-size:12px} #cn-progress .cn-fail{color:#c23c40}
    #cn-progress .cn-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:13px}
    #cn-progress .cn-card{border:1px solid #eae8f3;background:#f8f7fd;border-radius:11px;padding:12px;text-align:center}
    #cn-progress .cn-card b{display:block;font-size:27px;color:#624ce0;line-height:1.2;margin-bottom:5px;font-variant-numeric:tabular-nums}
    #cn-progress .cn-card span{font-size:12px;color:#5d5c6e}
    #cn-progress .cn-meter{height:12px;overflow:hidden;border-radius:9px;background:#eceaf6;margin:10px 0 5px} #cn-progress .cn-meter>span{display:block;background:linear-gradient(90deg,#7759fa,#31b69b);height:100%;border-radius:9px;transition:width .3s}
    #cn-progress .cn-columns{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:17px}
    #cn-progress h3{font-size:15px;margin:0 0 8px;font-weight:750;color:#33304f}
    #cn-progress .cn-students{max-height:280px;overflow:auto;border:1px solid #eeecf5;border-radius:10px;padding:5px 10px}
    #cn-progress .cn-line{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 3px;border-bottom:1px solid #efedf6;font-size:13px}
    #cn-progress .cn-line:last-child{border-bottom:0} #cn-progress .cn-name{overflow-wrap:anywhere;min-width:0;flex:1}
    #cn-progress .cn-tag{font-size:12px;border-radius:99px;padding:3px 8px;white-space:nowrap;background:#fdf0d8;color:#8b5909}
    #cn-progress .cn-tag.done{background:#e4f6ee;color:#13794d} #cn-progress .cn-question{padding:10px 0;border-bottom:1px solid #efedf6}
    #cn-progress .cn-question:last-child{border-bottom:0} #cn-progress .cn-qname{font-size:13px;overflow-wrap:anywhere;margin-bottom:5px}
    #cn-progress .cn-qstat{font-size:12px;color:#6b6782} #cn-progress button{border:1px solid #d3c9ed;border-radius:8px;background:#f5f2ff;color:#4e38ae;padding:6px 10px;font-size:12px;cursor:pointer}
    #cn-progress .cn-disclaimer{margin-top:14px;font-size:12px;line-height:1.6;color:#727183}
    @media(max-width:750px){#cn-progress{padding:14px}#cn-progress .cn-cards{grid-template-columns:repeat(2,minmax(0,1fr))}#cn-progress .cn-columns{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
  let currentCode = '', box = null, status, totalBox, countBox, studentBox, questionBox, progressBox, note, expectedEl;
  let pending = false, activeRequest = null, lastPayload = null;
  function getCode(){const m=window.location.pathname.match(/^\/results\/([A-Za-z]{4})\/?$/);return m ? m[1].toUpperCase() : '';}
  function newPanel(code, parent) {
    const panel=document.createElement('section');panel.id='cn-progress';panel.setAttribute('data-zh-no-translate','');
    panel.innerHTML=`<div class="cn-head"><div><h2>📊 课堂答题实时监控</h2><div class="cn-small">自主测验 ${esc(code)} · 每5秒更新一次</div></div>
      <div class="cn-config"><label for="cn-expected">本班应答人数</label><input id="cn-expected" type="number" min="1" max="10000" placeholder="如36" autocomplete="off"/>
      <button id="cn-force" type="button">立即更新</button><span class="cn-status" id="cn-state">正在读取…</span></div></div>
      <div class="cn-cards" id="cn-cards"><div class="cn-card"><b>—</b><span>已参与人数</span></div><div class="cn-card"><b>—</b><span>已答完人数</span></div><div class="cn-card"><b>—</b><span>作答中</span></div><div class="cn-card"><b>—</b><span>未开始／未记录</span></div></div>
      <div class="cn-meter"><span id="cn-bar" style="width:0%"></span></div><div class="cn-small" id="cn-note">等待数据…</div>
      <div class="cn-columns"><div><h3>学生进度（姓名去重）</h3><div class="cn-students" id="cn-students"></div></div><div><h3>每题作答统计（每人取一份记录）</h3><div id="cn-questions"></div></div></div>
      <div class="cn-disclaimer">注意：只有学生至少答完一题，系统才会保存作答记录。已答完表示全部题目的答案已保存，并非另有“交卷”按钮；未开始学生无法在此显示姓名。下方原版报表不会自动刷新，如需导出最新数据，请先刷新整个网页。</div>`;
    parent.prepend(panel);
    box=panel; status=panel.querySelector('#cn-state'); totalBox=panel.querySelector('#cn-cards'); studentBox=panel.querySelector('#cn-students'); questionBox=panel.querySelector('#cn-questions'); progressBox=panel.querySelector('#cn-bar'); note=panel.querySelector('#cn-note'); expectedEl=panel.querySelector('#cn-expected');
    try {expectedEl.value=localStorage.getItem('quizzle.cn.expected.'+code) || '';}catch(e){}
    expectedEl.addEventListener('change',()=>{let v=expectedEl.value;if(v && (!Number.isInteger(Number(v)) || Number(v)<1 || Number(v)>10000)){expectedEl.value='';v='';}
      try {localStorage.setItem('quizzle.cn.expected.'+code,v);}catch(e){} if(lastPayload)render(lastPayload);});
    panel.querySelector('#cn-force').addEventListener('click',()=>poll(true));
  }
  function render(payload) {
    if (!box || !box.isConnected) return;
    const s=summarize(payload,expectedEl.value);
    const remaining=s.unseen == null ? '—' : s.unseen;
    totalBox.innerHTML=`<div class="cn-card"><b>${s.participants}</b><span>已参与人数</span></div><div class="cn-card"><b>${s.complete}</b><span>已答完人数</span></div><div class="cn-card"><b>${s.started}</b><span>作答中</span></div><div class="cn-card"><b>${remaining}</b><span>未开始／未记录</span></div>`;
    progressBox.style.width=s.progress+'%';
    note.textContent=`完成进度 ${s.progress}% · 共有 ${s.total} 题 · 已产生 ${s.attempts} 份作答记录` + (s.expected==null?' · 填写应答人数后可计算缺席／未记录人数':'');
    studentBox.innerHTML=s.students.length ? s.students.map(t=>`<div class="cn-line"><span class="cn-name" title="${esc(t.name)}">${esc(t.name)}</span><span class="cn-small">${t.count}/${t.total}题${t.complete?' · '+esc(t.score)+'分':''}</span><span class="cn-tag ${t.complete?'done':''}">${t.complete?'已答完':'作答中'}</span></div>`).join('') : '<div class="cn-line">尚无学生答题记录</div>';
    questionBox.innerHTML=s.questions.map((q,i)=>`<div class="cn-question"><div class="cn-qname">第${i+1}题：${esc(q.title)}</div><div class="cn-qstat">已答 ${q.answered} 人 · 答对 ${q.correct} · 答错 ${q.wrong}${q.partial?' · 部分正确 '+q.partial:''} · 正确率 ${q.accuracy}%</div></div>`).join('') || '<div class="cn-small">尚无题目</div>';
  }
  async function poll(force=false) {
    const code=getCode(); if(!code || !box?.isConnected || pending || (!force && document.hidden))return;
    pending=true; status.classList.remove('cn-fail');status.textContent='正在更新…';
    const controller=new AbortController();activeRequest=controller;
    const timeout=setTimeout(()=>controller.abort(),8000);
    try {
      const response=await fetch('/api/practice/'+encodeURIComponent(code)+'/results',{
        method:'POST',headers:{'Content-Type':'application/json'},body:'{}',credentials:'same-origin',cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error(response.status===401?'教师登录已过期，请重新登录':'读取成绩失败（HTTP '+response.status+'）');
      const data=await response.json();
      if(getCode()===code){lastPayload=data;render(data);status.textContent='已同步 '+new Date().toLocaleTimeString('zh-CN',{hour12:false});}
    }catch(e){if(getCode()===code){status.textContent=e.name==='AbortError'?'连接超时，下次自动重试':e.message;status.classList.add('cn-fail');}}
    finally{clearTimeout(timeout);pending=false;activeRequest=null;}
  }
  function ensure(){
    const code=getCode(), target=code && document.querySelector('.practice-results-page .results-content');
    if(!code || !target){if(box && box.isConnected)box.remove();box=null;currentCode='';lastPayload=null;return;}
    if(currentCode!==code || !box || !box.isConnected){
      if(activeRequest)activeRequest.abort();
      if(box?.isConnected)box.remove();
      currentCode=code;lastPayload=null;newPanel(code,target);poll(true);
    }
  }
  setInterval(ensure,1200);
  setInterval(()=>poll(),5000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){ensure();poll(true);}});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensure,{once:true});else ensure();
})();
