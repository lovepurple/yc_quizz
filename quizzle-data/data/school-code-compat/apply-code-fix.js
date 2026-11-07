'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.env.QUIZZLE_ROOT||'/quizzle';
const INSTALL=path.join(ROOT,'data','school-code-compat');
const SAVE=path.join(ROOT,'data','.school_code_compat_backup');
const MANIFEST=path.join(SAVE,'manifest.json');
const server=path.join(ROOT,'server','index.js');
const admin=path.join(ROOT,'data','school-package','admin.html');
const script=path.join(ROOT,'data','school-package','admin.js');
const marker='/* SCHOOL_CODE_COMPAT_V1 */';
function digest(b){return crypto.createHash('sha256').update(b).digest('hex')}
function read(p){return fs.readFileSync(p,'utf8')}
function one(src,find,replacement,label){const parts=src.split(find);if(parts.length!==2)throw Error(label+': 无法找到唯一的兼容位置，未修改系统');return src.replace(find,replacement)}
function build(){for(const p of [server,admin,script,path.join(INSTALL,'school-code-compat.js')])if(!fs.existsSync(p))throw Error('找不到必要文件：'+p);
 let s=read(server),a=read(admin),j=read(script);
 if(s.includes(marker))throw Error('已安装或部分安装本补丁，请先执行检查');
 if(!s.includes('SCHOOL_CLASS_SCOPE_V1')||!s.includes('QUIZZLE_SCHOOL_ACCOUNTS_V1'))throw Error('未找到现有学生账号和任教班级权限模块');
 s=one(s,"app.use('/api/school',require('../data/school-roles-package/scope-api')(express));",`${marker}\napp.use('/api/school',require('../data/school-code-compat/school-code-compat')(express));\napp.use('/api/school',require('../data/school-roles-package/scope-api')(express));`,'权限模块挂载');
 a=one(a,'先在原 Quizzle 教师端创建测验，点击紫色学士帽发布，取得4位字母码，然后在这里绑定为“考试”或“自主练习”。',
 '可输入4位字母的自主测验码，或从“保存试卷”获得的较长试卷ID。考试与自主练习都能发布；输入保存试卷ID时系统将自动生成4位正式测验码。实时主持房间码不能用于账号考试。','教师页面说明');
 a=one(a,'<label>自主测验码（4位字母）</label><input id="quizCode" placeholder="例如 JNEH" pattern="[A-Za-z]{4}" required/>',
 '<label>自主测验码 / 已保存试卷 ID</label><input id="quizCode" placeholder="例如 JNEH 或 JWTIOI" pattern="[A-Za-z0-9]{4,16}" maxlength="16" title="填写4位字母自主测验码，或4至16位已保存试卷ID（非主持房间码）" required/><div class="muted" style="font-size:12px;margin-top:5px">支持4位字母码及较长保存试卷ID；系统自动生成账号考试码。</div>','编码输入框');
 j=one(j,"try{await api('/admin/assignments','POST',{code:$('quizCode').value.trim().toUpperCase()", "try{const response=await api('/admin/assignments','POST',{code:$('quizCode').value.trim().toUpperCase()",'发布响应变量');
 j=one(j,"$('assignmentMsg').textContent='发布成功，学生登录后即可看到任务';loadAssignments();",
 "$('assignmentMsg').textContent=response.convertedFrom?'发布成功！已将保存试卷ID '+response.convertedFrom+' 转换为账号测验码：'+response.assignment.code+'，学生登录后可看到任务。':'发布成功，学生登录后即可看到任务';if(response.convertedFrom)$('quizCode').value=response.assignment.code;loadAssignments();",'发布后编号显示');
 return [[server,Buffer.from(s,'utf8')],[admin,Buffer.from(a,'utf8')],[script,Buffer.from(j,'utf8')]];}
function atomic(p,buf){const tmp=p+'.codefix-'+crypto.randomBytes(4).toString('hex');fs.writeFileSync(tmp,buf);fs.renameSync(tmp,p)}
function status(){if(fs.existsSync(MANIFEST)){const m=JSON.parse(read(MANIFEST));for(const item of m.files)if(!fs.existsSync(item.name)||digest(fs.readFileSync(item.name))!==item.after)throw Error('安装后又发生其他修改，不能盲目覆盖');console.log('PASS: code compatibility patch already installed');return true;}
 build();console.log('PASS: school accounts, teacher scope and original admin form compatible');return false;}
function apply(){if(status())return;const changes=build();const files=changes.map(([name,contents],i)=>({name,before:digest(fs.readFileSync(name)),after:digest(contents),original:'original-'+i}));fs.mkdirSync(SAVE,{recursive:true});for(const f of files)fs.writeFileSync(path.join(SAVE,f.original),fs.readFileSync(f.name),{flag:'wx'});fs.writeFileSync(MANIFEST,JSON.stringify({version:1,files},null,2),{flag:'wx'});
 const modified=[];try{for(const [name,content] of changes){atomic(name,content);modified.push(name)}}catch(e){for(const n of modified){const item=files.find(f=>f.name===n);atomic(n,fs.readFileSync(path.join(SAVE,item.original)))}fs.renameSync(MANIFEST,MANIFEST+'.failed');throw e}
 console.log('PASS: teacher task UI and ID-to-persistent-quiz bridge updated');}
function restore(){if(!fs.existsSync(MANIFEST))throw Error('未找到回退数据');const m=JSON.parse(read(MANIFEST));if(m.files.some(f=>digest(fs.readFileSync(f.name))!==f.after))throw Error('文件已被其他补丁修改，不允许覆盖回退');for(const f of m.files)atomic(f.name,fs.readFileSync(path.join(SAVE,f.original)));fs.renameSync(MANIFEST,MANIFEST+'.restored');console.log('RESTORE COMPLETE: reverted code only, saved quizzes and results untouched');}
if(require.main===module)try{const t=process.argv[2];if(t==='check')status();else if(t==='apply')apply();else if(t==='restore')restore();else throw Error('Usage: check|apply|restore');}catch(e){console.error('ERROR:',e.message);process.exitCode=1;}
module.exports={build,status};
