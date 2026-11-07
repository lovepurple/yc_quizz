'use strict';
// Quizzle DOCX/XLSX importer installer.
// v1.5.2 fixes formula rendering on the dynamically generated student question page and keeps
// later school patches intact when the original importer manifest has drifted.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.env.QUIZZLE_ROOT||'/quizzle';
const PKG=path.join(ROOT,'data','question-import-package');
const BACK=path.join(ROOT,'data','.question_import_v1_backup');
const MANIFEST=path.join(BACK,'manifest.json');
const ENH_BACK=path.join(ROOT,'data','.question_import_media_v1_backup');
const ENH_MANIFEST=path.join(ENH_BACK,'manifest.json');
const server=path.join(ROOT,'server','index.js');
const schoolApi=path.join(ROOT,'data','school-package','school-api.js');
const studentJs=path.join(ROOT,'data','school-package','student.js');
const teacherResults=path.join(ROOT,'data','school-roles-package','teacher-results.js');
const scopeApi=path.join(ROOT,'data','school-roles-package','scope-api.js');
const home=path.join(ROOT,'dist','index.html');
const admin=path.join(ROOT,'data','school-package','admin.html');
const marker='/* SCHOOL_DOCUMENT_QUESTION_IMPORT_V1 */';
const pageMarker='<!-- SCHOOL_DOCUMENT_QUESTION_IMPORT_V1 -->';
const templatePageMarker='<!-- SCHOOL_IMPORT_TEMPLATE_DOWNLOAD_V1 -->';
const templateServerMarker='/* SCHOOL_IMPORT_TEMPLATE_SERVER_V1 */';
const mathClientMarker='/* SCHOOL_IMPORT_MATH_FORMAT_V2 */';
const mediaClientMarker='/* SCHOOL_IMPORT_MEDIA_RENDER_V1 */';
const mathRenderClientMarker='/* SCHOOL_IMPORT_MATH_RENDER_V1 */';
const mediaServerMarker='/* SCHOOL_IMPORT_MEDIA_SERVER_V1 */';

function sha(d){return crypto.createHash('sha256').update(d).digest('hex');}
function read(f){return fs.readFileSync(f,'utf8');}
function exists(f){return fs.existsSync(f);}
function atomic(f,b){const tmp=f+'.import-'+crypto.randomBytes(4).toString('hex');fs.writeFileSync(tmp,b);fs.renameSync(tmp,f);}
function replaceOnce(s,before,after,label){const xs=s.split(before);if(xs.length!==2)throw Error(label+': expected exactly one anchor; refusing to patch');return s.replace(before,after);}
function packageFiles(){return ['doc-parser.js','quiz-parser.js','math-format.js','import-api.js','import.html','import.css','import-ui.js','entry-button.js','template-api.js','download.css','download-ui.js','math-render.js','media-render.js','install-import.js','templates/word-questions.docx','templates/excel-questions.xlsx'];}
function ensurePackageFiles(){for(const f of packageFiles())if(!exists(path.join(PKG,f)))throw Error('Package file missing: '+f);}
function hasTemplateAssets(s){return /['"]download\.css['"]/.test(s)&&/['"]download-ui\.js['"]/.test(s);}
function hasTemplateRoute(s){return hasTemplateAssets(s)&&s.includes('/school/import/:asset');}
function hasMediaRoute(s){return s.includes(mediaServerMarker)||s.includes('/school/import/media/:code/:file');}
function hasMathClient(s){return s.includes(mathClientMarker);}
function hasMediaClient(s){return s.includes(mediaClientMarker);}
function fileDrift(m){return m.files.filter(o=>!exists(o.file)||sha(fs.readFileSync(o.file))!==o.modified);}
function mediaClientSource(){return read(path.join(PKG,'media-render.js'));}
function mathClientSource(){return read(path.join(PKG,'math-format.js'));}
function mathRenderClientSource(){return read(path.join(PKG,'math-render.js'));}
function hasMathRenderClient(s){return s.includes(mathRenderClientMarker);}
function mediaServerCode(){return `${mediaServerMarker}
app.get('/school/import/media/:code/:file',(req,res)=>{const path=require('path'),code=String(req.params.code||'').toUpperCase(),file=String(req.params.file||'');if(!/^[A-Z0-9]{4}$/.test(code)||!/^[A-Za-z0-9._-]{1,80}$/.test(file))return res.sendStatus(404);const root=path.join(process.cwd(),'data','practice-quizzes',code,'media'),target=path.join(root,file);if(!target.startsWith(root+path.sep))return res.sendStatus(404);res.set('Cache-Control','no-store');res.sendFile(target,err=>{if(err&&!res.headersSent)res.sendStatus(404);});});`;}
function appendDisplayClient(stu){
  let out=stu;
  if(!hasMathClient(out))out+='\n'+mathClientSource()+'\n';
  if(!hasMediaClient(out))out+='\n'+mediaClientSource()+'\n';
  // Older media patches already changed this file. Keep those blocks intact
  // and append an idempotent math-only scanner for dynamically rendered text.
  if(!hasMathRenderClient(out))out+='\n'+mathRenderClientSource()+'\n';
  return out;
}

function build(){
  for(const f of [server,schoolApi,studentJs,teacherResults,scopeApi,home,admin])if(!exists(f))throw Error('Required installed Quizzle file not found: '+f);
  let s=read(server),a=read(schoolApi),stu=read(studentJs),tr=read(teacherResults),scope=read(scopeApi),h=read(home),ad=read(admin);
  if(!s.includes('SCHOOL_CLASS_SCOPE_V1')||!s.includes('QUIZZLE_SCHOOL_ACCOUNTS_V1'))throw Error('Existing student account / teacher class permission addon required');
  if(s.includes(marker)||a.includes(marker)||h.includes(pageMarker))throw Error('Document importer already or partially installed');
  s=replaceOnce(s,'app.use("/api/media", require("./routes/media"));',`app.use('/api/school-import', require('../data/question-import-package/import-api')(express));
${marker}
${templateServerMarker}
${mediaServerCode()}
app.get('/school/import',(req,res)=>{const {extractToken}=require('./middleware/auth'),{validateToken}=require('./utils/auth');const u=validateToken(extractToken(req));if(!u||!['admin','teacher'].includes(u.role))return res.redirect(302,'/?teacher=1');res.set('Cache-Control','no-store');res.sendFile(require('path').join(process.cwd(),'data','question-import-package','import.html'));});
app.get('/school/import/:asset',(req,res)=>{if(!['import.css','import-ui.js','entry-button.js','download.css','download-ui.js','math-format.js'].includes(req.params.asset))return res.sendStatus(404);res.type(req.params.asset.endsWith('.css')?'css':'js');res.sendFile(require('path').join(process.cwd(),'data','question-import-package',req.params.asset));});
app.use("/api/media", require("./routes/media"));`,'index media routes');
  a=replaceOnce(a,'p.answers.push(one);p.score=',`${marker}
if(Number(q.points)>0&&Number(q.points)<=100){one.score=Math.round(one.score*Number(q.points)*100)/100;one.points=Number(q.points);}
p.answers.push(one);p.score=`,'school scoring');
  a=replaceOnce(a,'character:\'wizard\',shuffle,completed:false','character:\'wizard\',shuffle,maxScore:Math.round(info.quiz.questions.reduce((v,q)=>v+(Number(q.points)>0?Number(q.points):1),0)*100)/100,completed:false','new attempt points');
  a=replaceOnce(a,'score:p.completed?p.score:null};}','score:p.completed?p.score:null,maxScore:p.maxScore??p.total};}','student progress point max');
  a=replaceOnce(a,'score:p.score,total:p.total,timestamp:p.timestamp,mode:p.mode};','score:p.score,total:p.total,maxScore:p.maxScore??p.total,timestamp:p.timestamp,mode:p.mode};','grade output max');
  stu=replaceOnce(stu,"(progress.score??'-')+' / '+progress.total", "(progress.score??'-')+' / '+(progress.maxScore??progress.total)",'student results points');
  stu=appendDisplayClient(stu);
  tr=replaceOnce(tr,"s.total,s.score,s.timestamp]", "s.total,s.score+' / '+(s.maxScore??s.total),s.timestamp]",'teacher csv points');
  tr=replaceOnce(tr,"s.score,s.timestamp].forEach", "s.score+' / '+(s.maxScore??s.total),s.timestamp].forEach",'teacher results score');
  scope=replaceOnce(scope,"score:Number(item.score)||0,total:item.total||quiz.questions.length,timestamp", "score:Number(item.score)||0,total:item.total||quiz.questions.length,maxScore:item.maxScore??(item.total||quiz.questions.length),timestamp",'scope results point max');
  h=replaceOnce(h,'</body>',`${pageMarker}\n<script defer src="/school/import/entry-button.js"></script>\n</body>`,'creator button');
  const card=`${pageMarker}\n<div class="card adminCard" style="margin:14px 0"><div class="section-head"><h2>📄 Word / Excel 智能导入题库</h2><a class="primary" href="/school/import" style="text-decoration:none">打开智能导题工作台 →</a></div><p class="subtitle">上传DOCX/XLSX，保留可读文字、图片和公式信息。逐题核对后直接发布账号考试或自主练习。</p></div>`;
  ad=replaceOnce(ad,'<div class="card adminCard"><div class="section-head"><h2>③ 发布账号测验任务',card+'\n<div class="card adminCard"><div class="section-head"><h2>③ 发布账号测验任务','teacher admin entry');
  return [[server,s],[schoolApi,a],[studentJs,stu],[teacherResults,tr],[scopeApi,scope],[home,h],[admin,ad]].map(([f,v])=>[f,Buffer.from(v,'utf8')]);
}

function addMediaRoute(s){
  if(hasMediaRoute(s))return s;
  if(!s.includes(marker))throw Error('Existing Word/Excel importer route was not found; refusing a partial media patch');
  const anchors=['app.use("/api/media", require("./routes/media"));',"app.use('/api/media', require('./routes/media'));"].filter(x=>s.includes(x));
  if(anchors.length!==1)throw Error('Media route anchor was not found uniquely; current Quizzle code was left unchanged');
  const anchor=anchors[0];return s.replace(anchor,mediaServerCode()+'\n'+anchor);
}
function addTemplateAssets(s){
  if(!hasTemplateRoute(s)){
    if(!s.includes(marker))throw Error('Existing Word/Excel importer route was not found; refusing a partial template patch');
    const re=/\[\s*(['"])import\.css\1\s*,\s*(['"])import-ui\.js\2\s*,\s*(['"])entry-button\.js\3\s*\]/g;
    const matches=[...s.matchAll(re)];if(matches.length!==1)throw Error('Template asset route anchor was not found uniquely; current Quizzle code was left unchanged');
    const old=matches[0][0],next="['import.css','import-ui.js','entry-button.js','download.css','download-ui.js','math-format.js']";
    s=s.slice(0,matches[0].index)+next+s.slice(matches[0].index+old.length);if(!s.includes(templateServerMarker))s=s.replace(marker,marker+'\n'+templateServerMarker);
  }
  if(!s.includes("'math-format.js'")&&!s.includes('\"math-format.js\"')){
    const candidates=[...s.matchAll(/\[[^\]]*['"]download-ui\.js['"][^\]]*\]/g)].filter(m=>m[0].includes('import.css'));
    if(candidates.length!==1)throw Error('Math format asset route was not found uniquely; current Quizzle code was left unchanged');
    const old=candidates[0][0],next=old.replace(/\s*\]$/,",'math-format.js']");s=s.slice(0,candidates[0].index)+next+s.slice(candidates[0].index+old.length);
  }
  return s;
}

function buildEnhancementUpgrade(){
  if(!exists(server)||!exists(studentJs))throw Error('Required installed Quizzle server or student file not found');
  let s=read(server),stu=read(studentJs),changed=[];
  const nextServer=addMediaRoute(addTemplateAssets(s));if(nextServer!==s)changed.push([server,Buffer.from(nextServer,'utf8')]);
  const nextStudent=appendDisplayClient(stu);if(nextStudent!==stu)changed.push([studentJs,Buffer.from(nextStudent,'utf8')]);
  return changed;
}
function enhancementsReady(){
  const packageApi=path.join(PKG,'import-api.js'),packageHtml=path.join(PKG,'import.html');
  if(!exists(server)||!exists(studentJs)||!exists(packageApi)||!exists(packageHtml))return false;
  const currentServer=read(server);
  return hasTemplateRoute(currentServer)&&hasMediaRoute(currentServer)&&hasMathClient(read(studentJs))&&hasMediaClient(read(studentJs))&&hasMathRenderClient(read(studentJs))&&read(packageApi).includes('attachTemplateDownloads(r);')&&read(packageHtml).includes(templatePageMarker)&&['template-api.js','download.css','download-ui.js','math-format.js','math-render.js','media-render.js','templates/word-questions.docx','templates/excel-questions.xlsx'].every(f=>exists(path.join(PKG,f)));
}
function saveEnhancementBackup(builds){
  fs.mkdirSync(ENH_BACK,{recursive:true});
  if(exists(ENH_MANIFEST)){
    let old=null;
    try{old=JSON.parse(read(ENH_MANIFEST));}catch(_){old=null;}
    if(old&&Array.isArray(old.files)&&!fileDrift(old))return old;
    fs.renameSync(ENH_MANIFEST,ENH_MANIFEST+'.stale-'+Date.now()+'-'+crypto.randomBytes(3).toString('hex'));
  }
  // A failed or interrupted previous run may leave backup files behind. Use a
  // unique run tag so a retry never collides with those files (EEXIST).
  const tag=Date.now()+'-'+crypto.randomBytes(3).toString('hex');
  const info=builds.map(([file,content],i)=>({file,original:sha(fs.readFileSync(file)),modified:sha(content),save:'backup-'+tag+'-'+i}));
  for(const item of info)fs.writeFileSync(path.join(ENH_BACK,item.save),fs.readFileSync(item.file),{flag:'wx'});
  fs.writeFileSync(ENH_MANIFEST,JSON.stringify({files:info,version:1,created:new Date().toISOString()},null,2),{flag:'wx'});return {files:info};
}
function applyEnhancementOnly(builds){
  if(!builds.length){console.log('PASS media and template display support already present');return;}
  const saved=saveEnhancementBackup(builds),changed=[];try{for(const [file,content] of builds){atomic(file,content);changed.push(file);}console.log('PASS Word media preservation and student display support upgraded; later school patches were preserved');}catch(e){for(const file of changed){const item=saved.files.find(x=>x.file===file);if(item)atomic(file,fs.readFileSync(path.join(ENH_BACK,item.save)));}throw e;}
}
function check(){
  ensurePackageFiles();
  const orig=exists(MANIFEST);
  if(orig){const m=JSON.parse(read(MANIFEST));if(enhancementsReady()){console.log('PASS media and template display support already installed');return true;}const drift=fileDrift(m);if(drift.length&&!read(server).includes(marker))throw Error('Existing importer manifest drifted and importer route was not found; no files were modified');buildEnhancementUpgrade();console.log(drift.length?'PASS existing importer found; later school patches detected; media/template-only upgrade prepared':'PASS previous importer found; media/template display upgrade prepared');return false;}
  build();console.log('PASS compatible with current account, score, class permissions, media display, and template download files');return false;
}
function apply(){if(check())return;if(exists(MANIFEST)){applyEnhancementOnly(buildEnhancementUpgrade());return;}const builds=build(),info=builds.map(([file,content],i)=>({file,original:sha(fs.readFileSync(file)),modified:sha(content),save:'backup-'+i}));fs.mkdirSync(BACK,{recursive:true});if(exists(MANIFEST))throw Error('Existing backup manifest detected');for(const item of info)fs.writeFileSync(path.join(BACK,item.save),fs.readFileSync(item.file),{flag:'wx'});fs.writeFileSync(MANIFEST,JSON.stringify({files:info,version:1,created:new Date().toISOString()},null,2),{flag:'wx'});const changed=[];try{for(const [file,content] of builds){atomic(file,content);changed.push(file);}}catch(e){for(const file of changed){const x=info.find(x=>x.file===file);atomic(file,fs.readFileSync(path.join(BACK,x.save)));}fs.renameSync(MANIFEST,path.join(BACK,'manifest.failed.json'));throw e;}console.log('PASS Word/Excel importer installed; original data, accounts, and later school patches unchanged');}
function restore(){if(!exists(MANIFEST))throw Error('No importer backup');const m=JSON.parse(read(MANIFEST));if(fileDrift(m).length)throw Error('Files changed after installer; refuse destructive restore');for(const o of m.files)atomic(o.file,fs.readFileSync(path.join(BACK,o.save)));fs.renameSync(MANIFEST,path.join(BACK,'manifest.restored.json'));console.log('RESTORE COMPLETE: original code restored; imported question results retained');}
if(require.main===module)try{const op=process.argv[2];if(op==='check')check();else if(op==='apply')apply();else if(op==='restore')restore();else throw Error('Usage check|apply|restore');}catch(e){console.error('ERROR:',e.message);process.exitCode=1;}
module.exports={build,check,buildEnhancementUpgrade,enhancementsReady};
