'use strict';
const head=/^\s*(?:第\s*)?(\d{1,3})\s*(?:题|[.．、)）])\s*[:：]?\s*(.*)$/;
const opts=/^\s*([A-FＡ-Ｆ])\s*[.．、:：)）]\s*(.+)$/i;
const answerMark=/(?:参考)?(?:正确)?答案\s*[:：]?\s*[【\[（(]?\s*([^】\]）)；;\s]+)/i;
const typeFrom=t=>{t=String(t||'').trim().toLowerCase();if(/多选|多项选择|multiple|复选/.test(t))return'multiple';if(/单选|选择|choice/.test(t))return'choice';if(/判断|是非|对错|true.?false/.test(t))return'judge';if(/填空|简答|text|短答/.test(t))return'fill';return''};
const trimLabel=s=>String(s||'').trim().replace(/^\s*[（(]?\d+[.．、)）]\s*/,'');
function scoreOf(text){const m=String(text||'').match(/(?:本题|每题|分值|得分)?\s*[（(【\[]\s*(\d+(?:\.\d+)?)\s*分\s*[）)】\]]|(?:本题|每题|分值)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*分|\b(\d+(?:\.\d+)?)\s*分\b/);return m?Number(m[1]||m[2]||m[3]):null}
const cleanTitle=t=>String(t||'').replace(/[（(【\[]\s*\d+(?:\.\d+)?\s*分\s*[）)】\]]/g,'').replace(/(?:本题|每题)\s*\d+(?:\.\d+)?\s*分/g,'').trim();
const normalizeAnswer=a=>String(a??'').trim().replace(/^(?:正确答案|参考答案|答案)\s*[:：]\s*/,'').replace(/^[【\[（(]\s*|\s*[】\]）)]$/g,'');
const normalizeJudge=a=>{a=normalizeAnswer(a).toLowerCase();if(/^(?:正确|对|是|true|t|√|✓|1)$/.test(a))return '正确';if(/^(?:错误|错|否|false|f|×|✗|0)$/.test(a))return '错误';return''};
const upperOption=x=>String(x).normalize('NFKC').toUpperCase();
function convertItem(raw,defaultScore=1){const problems=[];const options=(raw.options||[]).filter(x=>String(x.content||'').trim()).map(x=>({key:upperOption(x.key),content:String(x.content).trim()}));let type=typeFrom(raw.type),answer=normalizeAnswer(raw.answer),score=Number(raw.points??defaultScore),title=cleanTitle(raw.title);const warnings=[];
 const onlyMarks=/^[\s\u3000,，。．、；;：:（）()【】\[\]{}<>《》]+$/.test(title);
 if(!title||onlyMarks){title=raw.origin?`${raw.origin}（题干含图片、公式或视频，未提取到文字，请在系统中核对）`:'待补充题目（题干含图片、公式或视频，未提取到文字）';problems.push('题干中包含无法读取的媒体或公式，已保留题号并生成占位题目，请核对后再发布');}
 if(raw._mediaDetected)problems.push('Word中检测到图片或视频对象，媒体会随题目保存；公式会转换为可读结构，请核对题号、题目、选项、答案和分值');
 if(Array.isArray(raw.formatWarnings))for(const warning of raw.formatWarnings)if(warning&&!problems.includes(warning))problems.push(warning);
 if(!type){if(options.length>=2)type='choice';else if(normalizeJudge(answer))type='judge';else type='fill';problems.push('源文件未明确标记题型，已推断，请核对');}if(raw._assumedPoints)problems.push('源文件没有找到分值，暂按1分处理，请确认');
 if(title.length>200)warnings.push('题干超过200字（Quizzle限制）');if(!Number.isFinite(score)||score<=0||score>100||Math.round(score*100)!==score*100)warnings.push('分值无效（应为0.01至100分）');
 let answers=[];
 if(type==='choice'||type==='multiple'){
  let a=upperOption(answer).replace(/\s/g,'').replace(/[、，,;+；|\/]/g,'');
  if(!a||!/^[A-F]+$/.test(a))warnings.push('正确答案必须是选项字母，例如A或AC');
  if(options.length<2||options.length>6)warnings.push('选择题应有2至6个选项');
  if(new Set(options.map(x=>x.key)).size!==options.length)warnings.push('选项字母有重复');
  if([...a].some(ch=>!options.some(x=>x.key===ch)))warnings.push('答案中包含不存在的选项');
  if(type==='choice'&&a.length>1)type='multiple';if(type==='multiple'&&a.length===1)warnings.push('标记为多选，但正确选项只有一个');
  answers=options.map(x=>({type:'text',content:x.content,is_correct:a.includes(x.key)}));if(answers.some(x=>x.content.length>150))warnings.push('单个选项超过150字');
 }else if(type==='judge'){
  const a=normalizeJudge(answer);if(!a)warnings.push('判断题正确答案必须是正确/错误或√/×');
  answers=[{type:'text',content:'正确',is_correct:a==='正确'},{type:'text',content:'错误',is_correct:a==='错误'}];
 }else{
  if(!answer)warnings.push('填空题缺少参考答案');
  const arr=answer.split(/\s*\|\s*|\s*；\s*|\s*;\s*/).map(x=>x.trim()).filter(Boolean);
  if(arr.length>10)warnings.push('填空题可接受答案不能超过10个');
  if(arr.some(x=>x.length>150))warnings.push('填空答案超过150字');
  answers=arr.map(content=>({content}));
  const blankCount=(title.match(/_{2,}|（\s*）|\(\s*\)/g)||[]).length; if(blankCount>1)warnings.push('检测到多个空位，当前仅支持单空填空题，请拆成多题');
 }
 return {title,type:type==='choice'||type==='multiple'?'multiple-choice':type==='judge'?'true-false':'text',answers,points:score,warning:warnings,notes:problems,media:Array.isArray(raw.media)?raw.media:[],rawType:type,origin:raw.origin||''};
}
function rowsOfDocx(items){const result=[];for(const v of items){if(v.kind==='line')result.push(v.text);else for(const row of v.rows){const values=row.filter(Boolean);if(!values.length)continue;result.push(values.join(' '));}}return result;}
function isSection(s){return /^(?:[一二三四五六七八九十]+)[、.．]\s*(?:单项选择题|多项选择题|选择题|填空题|判断题|是非题|简答题)/.test(s)||/^(?:单选题|多选题|判断题|填空题)\s*[:：]/.test(s)}
function parseText(lines,options={}){let items=[],cur=null,sectionScore=null,sectionType='',implicitNo=0;
 function commit(){if(cur){items.push(convertItem(cur,sectionScore));cur=null;}}
 for(let i=0;i<lines.length;i++){
 const entry=typeof lines[i]==='string'?{text:lines[i],media:[]}:lines[i]||{};let s=String(entry.text||'').trim();const lineMedia=Array.isArray(entry.media)?entry.media:[],lineWarnings=Array.isArray(entry.formatWarnings)?entry.formatWarnings:[];if(!s&&!lineMedia.length&&!lineWarnings.length)continue;
 if(isSection(s)){commit();sectionScore=scoreOf(s);sectionType=typeFrom(s);continue;}
 const h=s.match(head);
 if(h){commit();let title=h[2]||'';let localType=typeFrom(title)||sectionType;const score=scoreOf(title),a=title.match(answerMark);if(a)title=title.replace(a[0],'').trim();title=title.replace(/^(?:【|\[|（|\()(单选题|多选题|判断题|填空题|选择题)(?:】|\]|）|\))/,'').trim();cur={title,options:[],answer:a?a[1]:'',type:localType,points:score??sectionScore??1,_assumedPoints:score===null&&sectionScore===null,origin:'第'+h[1]+'题',media:lineMedia.slice(),formatWarnings:lineWarnings.slice(),_mediaDetected:Boolean(options.mediaDetected)};continue;}
 if(!cur){if(sectionType&&(!s||(!answerMark.test(s)&&!opts.test(s)&&!/^解析|^解答|^说明/.test(s)))){implicitNo++;cur={title:s,options:[],answer:'',type:sectionType,points:sectionScore??1,_assumedPoints:sectionScore===null,origin:'第'+implicitNo+'题（原文未标注题号）',media:lineMedia.slice(),formatWarnings:lineWarnings.slice(),_mediaDetected:Boolean(options.mediaDetected)};continue;}else continue;}
 if(lineMedia.length)for(const media of lineMedia)if(!cur.media.some(x=>x.data===media.data))cur.media.push(media);
 if(lineWarnings.length)for(const warning of lineWarnings)if(!cur.formatWarnings.includes(warning))cur.formatWarnings.push(warning);
 if(!s)continue;
 const ans=s.match(answerMark);if(ans){cur.answer=ans[1];s=s.replace(ans[0],'').trim();if(!s)continue;}
 const inlineOptions=[...s.matchAll(/(?:^|\s)([A-FＡ-Ｆ])\s*[.．、:：)）]\s*([^\n]*?)(?=\s+[A-FＡ-Ｆ]\s*[.．、:：)）]|$)/gi)];
 if(inlineOptions.length>=2){for(const m of inlineOptions)cur.options.push({key:m[1],content:m[2].trim()});continue;}
 const opt=s.match(opts);
 if(opt){cur.options.push({key:opt[1],content:opt[2]});continue;}
 if(/^(?:解析|解答|说明)[:：]/.test(s))continue;
 if(/^(?:单选题|多选题|判断题|填空题|选择题)(?:\s|[:：])/.test(s)){cur.type=typeFrom(s);continue;}
 if(cur.title){if(cur.options.length===0&&cur.title.length+s.length<240)cur.title+=' '+s;else if(!cur.answer)cur._unparsed=(cur._unparsed||[]).concat([s]);}
 }
 commit();return items;
}
const synonyms={type:['题型','类型','题目类型','type'],title:['题干','题目','试题','问题','题目内容','内容','question'],answer:['正确答案','参考答案','答案','标准答案','正确选项','answer'],points:['分值','分数','得分','每题分值','score','points'],options:['选项','选项内容','备选答案']};
function mapHeaders(row){const map={};for(let i=0;i<row.length;i++){const x=String(row[i]||'').replace(/\s+/g,'').toLowerCase();for(const [k,aliases] of Object.entries(synonyms))if(aliases.includes(x))map[k]=i;const m=x.match(/^(?:选项|答案|option)?([a-f])(?:选项)?$/i);if(m)map[upperOption(m[1])]=i;}return map;}
function parseTable(rows,origin){if(!rows||!rows.length)return[];let header=-1,hmap;for(let i=0;i<Math.min(rows.length,12);i++){let map=mapHeaders(rows[i]);if(map.title!==undefined&&(map.answer!==undefined||map.A!==undefined||map.type!==undefined)){header=i;hmap=map;break;}}
 if(header===-1)return parseText(rows.map(r=>r.filter(Boolean).join(' ')));
 let parsed=[];
 for(let r=header+1;r<rows.length;r++){const row=rows[r];if(!row.some(Boolean))continue;const get=k=>hmap[k]===undefined?'':String(row[hmap[k]]||'').trim();const title=get('title');if(!title)continue;let options=[];for(const k of 'ABCDEF')if(get(k))options.push({key:k,content:get(k)});if(!options.length&&get('options')){for(const o of get('options').split(/\n|[;；]\s*(?=[A-F])/)){const m=o.trim().match(/^([A-F])\s*[.．:：、)）]\s*(.+)$/i);if(m)options.push({key:m[1],content:m[2]});}}
 let raw={title,options,type:get('type'),answer:get('answer'),points:get('points')||scoreOf(title)||1,_assumedPoints:!get('points')&&scoreOf(title)===null,origin:origin+' 第'+(r+1)+'行'};
 // If a single cell uses "答案：A", strip the label.
 parsed.push(convertItem(raw,1));}
 return parsed;
}
function parseDocx(items){let output=[],batch=[],mediaDetected=Boolean(items.mediaDetected);function flush(){if(batch.length){output.push(...parseText(batch,{mediaDetected}));batch=[];}}
 for(const item of items){if(item.kind==='line')batch.push({text:item.text,media:item.media||[],formatWarnings:item.formatWarnings||[]});else{flush();const parsed=parseTable(item.rows,'Word表格');if(item.media?.length)for(const q of parsed){q.media=q.media||[];for(const media of item.media)if(!q.media.some(x=>x.data===media.data))q.media.push(media);}if(item.formatWarnings?.length)for(const q of parsed)q.formatWarnings=item.formatWarnings.slice();if(mediaDetected)for(const q of parsed)q.notes.push('Word中检测到图片或视频对象，媒体会随题目保存；公式会转换为可读结构，请核对题号、题目、选项、答案和分值');output.push(...parsed);}}
 flush();
 if(!output.length&&mediaDetected)output.push(convertItem({title:'',type:'',answer:'',options:[],points:1,origin:'第1题（原文仅包含图片、公式或视频）',_mediaDetected:true},1));
 return output;}
function parseXlsx(sheets){const output=[];for(const sh of sheets){const rows=sh.rows||[];output.push(...parseTable(rows,sh.sheet||'Excel工作表'));}return output;}
function check(items){let sum=0,good=0;const issues=[];for(let i=0;i<items.length;i++){const q=items[i];if(q.warning.length)issues.push({no:i+1,origin:q.origin,problems:q.warning});else{good++;sum+=q.points;}}return {count:items.length,valid:good,totalPoints:Math.round(sum*100)/100,issues};}
module.exports={parseDocx,parseXlsx,parseText,parseTable,convertItem,check,scoreOf};
