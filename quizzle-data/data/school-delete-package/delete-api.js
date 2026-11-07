'use strict';
// Classroom deletion is reversible. Historical submissions and quiz binaries are deliberately retained.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.env.QUIZZLE_ROOT||'/quizzle';
const SCHOOL=path.join(ROOT,'data','school-accounts');
const ACC=path.join(SCHOOL,'accounts.json');
const ASSIGN=path.join(SCHOOL,'assignments.json');
const GRANTS=path.join(SCHOOL,'teacher-classes.json');
const AUDIT=path.join(SCHOOL,'delete-audit.jsonl');
function read(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
function save(file,obj){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';fs.writeFileSync(tmp,JSON.stringify(obj,null,2),'utf8');fs.renameSync(tmp,file);}
function log(actor,action,kind,id,code){const data={at:new Date().toISOString(),by:actor.id,byName:actor.username,action,kind,id,code};fs.appendFileSync(AUDIT,JSON.stringify(data)+'\n',{encoding:'utf8',mode:0o600});}
function err(res,status,message){return res.status(status).json({message});}
function ownsClass(t,klass){return t.role==='admin'||!!klass&&(read(GRANTS,{grants:{}}).grants[t.id]||[]).includes(klass);}
function ownsTask(t,a){return t.role==='admin'||(a.ownerId===t.id&&ownsClass(t,a.className));}
function accountPublic(a){return {id:a.id,username:a.username,name:a.name,className:a.className,active:a.active,mustChange:false,createdAt:a.createdAt,lastLoginAt:a.lastLoginAt||null};}
function handler(fn){return (req,res,next)=>{try{if(!req.schoolClassTeacher)return err(res,403,'请先使用教师账号登录');return fn(req,res,next);}catch(e){console.error('[school-deletion]',e);if(!res.headersSent)return err(res,500,'操作失败，请查看Docker日志');}};}
function stamp(t){return {deletedAt:new Date().toISOString(),deletedBy:t.id,deletedByName:t.username};}
function actorScope(t){return {role:t.role,username:t.username};}
const CODE=/^[A-Z]{4}$/;
module.exports=function(express){const r=express.Router();r.use(express.json({limit:'32kb'}));
// Override old list endpoints so recycled objects vanish from ordinary teacher screens.
r.get('/accounts',handler((req,res)=>{const t=req.schoolClassTeacher,query=String(req.query.q||'').trim().toLowerCase(),page=Math.max(1,Math.min(100000,Number(req.query.page)||1));const db=read(ACC,{accounts:[]});let arr=(db.accounts||[]).filter(a=>!a.deletedAt&&ownsClass(t,a.className));if(query)arr=arr.filter(a=>[a.username,a.name,a.className].some(x=>String(x||'').toLowerCase().includes(query)));arr.sort((a,b)=>a.username.localeCompare(b.username));res.json({total:arr.length,page,accounts:arr.slice((page-1)*60,page*60).map(accountPublic)}); }));
r.get('/assignments',handler((req,res)=>{const t=req.schoolClassTeacher,db=read(ASSIGN,{assignments:[]});res.json({assignments:(db.assignments||[]).filter(a=>!a.deletedAt&&ownsTask(t,a))});}));
r.get('/recycle',handler((req,res)=>{const t=req.schoolClassTeacher;const a=read(ACC,{accounts:[]}),b=read(ASSIGN,{assignments:[]});const accounts=(a.accounts||[]).filter(x=>x.deletedAt&&ownsClass(t,x.className)).map(x=>({id:x.id,username:x.username,name:x.name,className:x.className,deletedAt:x.deletedAt,deletedByName:x.deletedByName||''}));const assignments=(b.assignments||[]).filter(x=>x.deletedAt&&ownsTask(t,x)).map(x=>({code:x.code,title:x.title,className:x.className||'全校',deletedAt:x.deletedAt,deletedByName:x.deletedByName||''}));res.json({accounts,assignments,scope:actorScope(t)}); }));
r.delete('/accounts/:id',handler((req,res)=>{const t=req.schoolClassTeacher,db=read(ACC,{accounts:[]}),a=(db.accounts||[]).find(x=>x.id===req.params.id);if(!a)return err(res,404,'账号不存在');if(!ownsClass(t,a.className))return err(res,403,'无权删除其他班级的学生账号');if(a.deletedAt)return err(res,409,'账号已在回收站');if(req.body?.confirm!==a.username)return err(res,400,'确认信息不匹配，请重新确认学生账号');const snapshot=JSON.parse(JSON.stringify(a));try{Object.assign(a,stamp(t));a.activeBeforeDeletion=!!a.active;a.active=false;a.version=(Number(a.version)||1)+1;a.updatedAt=new Date().toISOString();save(ACC,db);log(t,'recycle','student',a.id,a.username);}catch(e){db.accounts[db.accounts.indexOf(a)]=snapshot;save(ACC,db);throw e;}res.json({ok:true,message:'学生账号已移入回收站，原有成绩没有删除'}); }));
r.post('/accounts/:id/restore',handler((req,res)=>{const t=req.schoolClassTeacher,db=read(ACC,{accounts:[]}),a=(db.accounts||[]).find(x=>x.id===req.params.id);if(!a||!a.deletedAt)return err(res,404,'回收站没有此账号');if(!ownsClass(t,a.className))return err(res,403,'不能恢复非任教班级学生');a.active=a.activeBeforeDeletion!==false;a.version=(Number(a.version)||1)+1;delete a.deletedAt;delete a.deletedBy;delete a.deletedByName;delete a.activeBeforeDeletion;a.updatedAt=new Date().toISOString();save(ACC,db);log(t,'restore','student',a.id,a.username);res.json({ok:true,message:'学生账号已恢复'}); }));
r.delete('/assignments/:code',handler((req,res)=>{const t=req.schoolClassTeacher,c=String(req.params.code||'').toUpperCase();if(!CODE.test(c))return err(res,400,'无效测验码');const db=read(ASSIGN,{assignments:[]}),a=(db.assignments||[]).find(x=>x.code===c);if(!a)return err(res,404,'任务不存在');if(!ownsTask(t,a))return err(res,403,'只能删除自己负责的测验任务');if(a.deletedAt)return err(res,409,'该测验任务已删除');if(req.body?.confirm!==c)return err(res,400,'请确认测验码后再删除');Object.assign(a,stamp(t));a.enabledBeforeDeletion=!!a.enabled;a.enabled=false;a.updatedAt=new Date().toISOString();save(ASSIGN,db);log(t,'recycle','assignment',c,c);res.json({ok:true,message:'测验任务已移入回收站；学生不再看到该任务，原试卷和历史成绩已保留'}); }));
r.post('/assignments/:code/restore',handler((req,res)=>{const t=req.schoolClassTeacher,c=String(req.params.code||'').toUpperCase(),db=read(ASSIGN,{assignments:[]}),a=(db.assignments||[]).find(x=>x.code===c);if(!a||!a.deletedAt)return err(res,404,'回收站没有这项测验');if(!ownsTask(t,a))return err(res,403,'无权恢复其他教师的测验'); // Restore as paused: teacher deliberately reopens after checking expiry.
a.enabled=false;delete a.deletedAt;delete a.deletedBy;delete a.deletedByName;delete a.enabledBeforeDeletion;a.updatedAt=new Date().toISOString();save(ASSIGN,db);log(t,'restore','assignment',c,c);res.json({ok:true,message:'已恢复为暂停状态，确认试卷仍有效后点击「开放」即可再次发布'}); }));
// Reject editing tombstoned records by older, unchanged school endpoints.
r.patch('/accounts/:id',handler((req,res,next)=>{const a=(read(ACC,{accounts:[]}).accounts||[]).find(x=>x.id===req.params.id);return a?.deletedAt?err(res,410,'账号已删除，请先到回收站恢复'):next();}));
r.post('/accounts/:id/reset',handler((req,res,next)=>{const a=(read(ACC,{accounts:[]}).accounts||[]).find(x=>x.id===req.params.id);return a?.deletedAt?err(res,410,'账号已删除，请先到回收站恢复'):next();}));
r.patch('/assignments/:code',handler((req,res,next)=>{const c=String(req.params.code||'').toUpperCase(),a=(read(ASSIGN,{assignments:[]}).assignments||[]).find(x=>x.code===c);return a?.deletedAt?err(res,410,'测验已删除，请先恢复'):next();}));
r.post('/assignments',handler((req,res,next)=>{const c=String(req.body?.code||'').toUpperCase();const a=(read(ASSIGN,{assignments:[]}).assignments||[]).find(x=>x.code===c);return a?.deletedAt?err(res,409,'该测验码在回收站，请先恢复任务或使用其他试卷'):next();}));
return r;};
module.exports._test={ownsClass,ownsTask,accountPublic};
