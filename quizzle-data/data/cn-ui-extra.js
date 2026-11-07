/* Quizzle 2.6.3 简体中文补漏 v1：只调整界面上的固定文案，不处理用户填写内容 */
(()=>{
  'use strict';
  const map={
    // 成绩界面及课堂常见余留外文
    'Analytics':'数据分析','Details':'答题明细','Analysis':'数据分析','Code':'房间码',
    'Auswahlmöglichkeiten':'选择题选项','Beitreten':'加入房间','Raum beitreten':'加入房间',
    'Beitreten...':'正在加入…','Spiel beitreten':'加入测验','Spiel starten':'开始测验',
    'Frage':'题目','Antwort':'答案','Antworten':'答案','Fragen':'题目','Schüler':'学生',
    'richtig':'答对','falsch':'答错','Richtig':'正确','Falsch':'错误',
    'Einfach':'简单','Mittel':'中等','Schwer':'困难',
    'Easy':'简单','Medium':'中等','Hard':'困难',
    'Übungsquiz Ergebnisse':'自主练习成绩','Ergebnisse':'成绩','Versuche':'作答次数',
    'Versuch':'第次作答','Durchschnitt':'平均分','Beste Punktzahl':'最高分',
    'Verbleiben':'剩余时间','Nach Schülern gruppiert':'按学生分组',
    'Detailansicht':'作答详情','Versuch auswählen:':'选择作答记录：',
    'Übersicht':'统计概览','Nach Genauigkeit':'按正确率','Nach Richtigen':'按答对题数',
    'Frage Titel':'题目内容','Schwierigkeitsverteilung':'题目难度分布',
    'Bitte warten':'请稍候','Bitte warten...':'请稍候…',
    'Schüler-Rangliste':'学生排行榜','Ranking':'排行榜','Scoreboard':'积分榜',
    'Spieler':'学生','Spielername':'学生姓名','Name eingeben':'输入姓名',
    'Antwortmöglichkeiten':'答案选项','Übungsmodus':'自主练习模式',
    'Quiz bearbeiten':'编辑测验','Quiz erstellen':'创建测验','Quiz speichern':'保存测验',
    'Fragen erstellen':'创建题目','Frage hinzufügen':'添加题目',
    'Abbrechen':'取消','Bestätigen':'确认','Schließen':'关闭',
    'Speichern':'保存','Erneut versuchen':'重试','Jetzt starten':'现在开始',
    'Raum existiert nicht oder Spiel hat bereits begonnen':'房间不存在，或者测验已经开始',
    'Keine Daten verfügbar':'暂无数据','Keine Daten zum Exportieren verfügbar':'没有可导出的数据',
    'Analytics exportiert':'已导出分析数据','Exportieren':'导出',
    'Als Excel herunterladen':'导出 Excel','Herunterladen':'下载',
    'Fragen werden geladen...':'正在加载题目…','Zurück zur Startseite':'返回首页',
    'Fragen-Übersicht':'题目概览','Student Analytics':'学生成绩分析',
    'Verbindung unterbrochen':'连接已中断','Keine Ergebnisse gefunden':'暂无成绩记录',
    'Ergebnisse werden geladen...':'成绩加载中…',
    'Aufgabe':'题目','Aufgaben':'题目','Fertig':'完成','Fertig!':'完成！',
    'Fortfahren':'继续','Zurück':'返回','Weiter':'下一步',
    'Spiel hat bereits begonnen':'测验已经开始',
    'Übungsquiz':'自主练习','Live-Quiz':'实时竞答',
    'Korrekt':'正确','Falsche Antwort':'答案错误',
    'Richtige Antwort':'正确答案','Deine Antwort':'你的答案'
  };
  const rules=[
    [/^(\d+)\s+Tage?$/i,(_,n)=>`${n}天`],
    [/^Frage\s+(\d+):?$/i,(_,n)=>`第${n}题`],
    [/^FRAGE\s+(\d+):?$/i,(_,n)=>`第${n}题`],
    [/^(\d+)\s+richtig$/i,(_,n)=>`${n}人答对`],
    [/^(\d+)\s+falsch$/i,(_,n)=>`${n}人答错`],
    [/^Platz\s+(\d+)\s+von\s+(\d+)$/i,(_,a,b)=>`第${a}名／共${b}名`],
    [/^Versuch\s+(\d+)$/i,(_,n)=>`第${n}次作答`],
    [/^Detailansicht:\s*(.*)$/i,(_,x)=>`答题详情：${x}`],
    [/^Code:\s*$/i,()=>`房间码：`],
    [/^Raumcode:\s*$/i,()=>`房间码：`],
    [/^(\d+)\s+Punkte?$/i,(_,n)=>`${n}分`]
  ];
  const excluded='script,style,textarea,pre,code,[contenteditable="true"],[data-zh-no-translate]';
  function translate(val){
    const trimmed=String(val||'').trim();if(!trimmed)return val;
    let output=Object.hasOwn(map,trimmed)?map[trimmed]:null;
    if(output===null)for(const [rx,fn] of rules)if(rx.test(trimmed)){output=trimmed.replace(rx,fn);break;}
    if(output===null||output===trimmed)return val;
    const prefix=val.slice(0,val.length-val.trimStart().length),suffix=val.slice(val.trimEnd().length);
    return prefix+output+suffix;
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={translate};return;}
  if(window.__quizzleCnUiExtra)return;
  window.__quizzleCnUiExtra=true;
  function fix(root){
    if(!root || (!root.isConnected && root!==document.body))return;
    const it=document.createTreeWalker(root,NodeFilter.SHOW_TEXT), nodes=[];
    if(root.nodeType===Node.TEXT_NODE)nodes.push(root);
    while(it.nextNode())nodes.push(it.currentNode);
    for(const n of nodes){if(n.parentElement && !n.parentElement.closest(excluded)){
      const t=translate(n.nodeValue);if(t!==n.nodeValue)n.nodeValue=t;
    }}
    if(root.nodeType===Node.ELEMENT_NODE && !root.closest(excluded)){
      const els=[root,...root.querySelectorAll('[placeholder],[title],[aria-label]')];
      for(const el of els)if(!el.closest(excluded))for(const attr of ['placeholder','title','aria-label'])if(el.hasAttribute(attr)){
        const v=el.getAttribute(attr),t=translate(v);if(v!==t)el.setAttribute(attr,t);
      }
    }
  }
  const pending=new Set();let scheduled=false;
  function flush(){scheduled=false;const a=[...pending];pending.clear();for(const item of a)fix(item);}
  function enqueue(node){if(!node)return;pending.add(node);if(!scheduled){scheduled=true;queueMicrotask(flush);}}
  function init(){
    enqueue(document.body);
    const obs=new MutationObserver(ms=>{for(const m of ms){
      if(m.type==='characterData')enqueue(m.target);
      else if(m.type==='attributes')enqueue(m.target);
      else for(const n of m.addedNodes)enqueue(n);
    }});
    obs.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label']});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
