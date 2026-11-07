'use strict';
// School class catalogue. Installed BEFORE school scope and school account routers.
const fs=require('fs'), path=require('path'), crypto=require('crypto');
const ROOT=process.env.QUIZZLE_ROOT||'/quizzle';
const DIR=path.join(ROOT,'data','school-accounts');
const CLASSES=path.join(DIR,'classes.json'), ACCOUNTS=path.join(DIR,'accounts.json');
const ASSIGNMENTS=path.join(DIR,'assignments.json'), GRANTS=path.join(DIR,'teacher-classes.json');
const {validateToken}=require(path.join(ROOT,'server','utils','auth'));
const {extractToken}=require(path.join(ROOT,'server','middleware','auth'));
function read(f,otherwise){try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){if(e.code==='ENOENT')return otherwise;throw e;}}
function save(f,v){fs.mkdirSync(path.dirname(f),{recursive:true});const tmp=f+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';fs.writeFileSync(tmp,JSON.stringify(v,null,2),'utf8');fs.renameSync(tmp,f);}
function fail(res,status,message){return res.status(status).json({message});}
function className(v){if(typeof v!=='string')return null;const n=v.trim();return n&&n.length<=60&&!/[\x00-\x1f<>\\/]/.test(n)?n:null;}
function short(v,max=40){return typeof v==='string'&&v.trim().length<=max?v.trim():null;}
const stages=new Set(['小学','初中','高中','其他']);
function stage(v){return stages.has(v)?v:'其他';}
function inferStage(name){if(/^(?:一|二|三|四|五|六)年级/.test(name))return '小学';if(/^(?:七|八|九)年级/.test(name))return '初中';if(/^高[一二三1-3]/.test(name))return '高中';return '其他';}
function roster(){const db=read(ACCOUNTS,{accounts:[]});return Array.isArray(db.accounts)?db.accounts:[];}
function tasks(){const db=read(ASSIGNMENTS,{assignments:[]});return Array.isArray(db.assignments)?db.assignments:[];}
function teacherGrants(){const db=read(GRANTS,{grants:{}});return db&&db.grants&&typeof db.grants==='object'?db.grants:{};}
function knownLegacy(){const set=new Set();for(const a of roster())if(className(a.className))set.add(a.className.trim());for(const a of tasks())if(className(a.className))set.add(a.className.trim());for(const arr of Object.values(teacherGrants()))if(Array.isArray(arr))for(const n of arr)if(className(n))set.add(n.trim());return set;}
function catalogue(){const db=read(CLASSES,{version:1,classes:[]});if(!Array.isArray(db.classes))throw Error('classes.json schema invalid');const known=new Set(db.classes.map(x=>x.name));let changed=false;for(const name of knownLegacy())if(!known.has(name)){db.classes.push({id:crypto.randomUUID(),name,stage:inferStage(name),grade:'',active:true,source:'既有数据',createdAt:new Date().toISOString()});known.add(name);changed=true;}if(changed)save(CLASSES,db);return db;}
function teacher(req){const u=validateToken(extractToken(req));if(!u||!['admin','teacher'].includes(u.role))return null;return u;}
function requestGuard(req,res,next){const t=teacher(req);if(!t)return fail(res,403,'请使用教师或管理员账号登录');req.schoolClassTeacher=t;if(['POST','PATCH','PUT','DELETE'].includes(req.method)){const o=req.headers.origin;if(o){try{if(new URL(o).host!==req.headers.host)return fail(res,403,'禁止跨站请求');}catch{return fail(res,403,'来源错误');}}if(!req.is('application/json'))return fail(res,415,'请使用JSON请求');}next();}
function admin(req,res,next){if(req.schoolClassTeacher.role!=='admin')return fail(res,403,'只有超级管理员可以管理学校班级');next();}
function guard(fn){return(req,res,next)=>{try{return fn(req,res,next)}catch(e){console.error('[school-class]',e);if(!res.headersSent)return fail(res,500,'班级管理出现错误，请查看Docker日志');}};}
function counts(db){const pupils=new Map(),jobs=new Map(),teachers=new Map();for(const a of roster().filter(x=>!x.deletedAt))pupils.set(a.className,(pupils.get(a.className)||0)+1);for(const a of tasks().filter(x=>!x.deletedAt))jobs.set(a.className,(jobs.get(a.className)||0)+1);for(const [id,cs] of Object.entries(teacherGrants()))if(Array.isArray(cs))for(const c of cs){if(!teachers.has(c))teachers.set(c,[]);teachers.get(c).push(id);}return db.classes.map(c=>({...c,studentCount:pupils.get(c.name)||0,taskCount:jobs.get(c.name)||0,teacherIds:teachers.get(c.name)||[]}));}
function row(body){const name=className(body.name);const grade=short(body.grade||'',30);if(!name||grade===null||!stages.has(body.stage||'其他'))return null;return {name,stage:stage(body.stage||'其他'),grade};}
function duplicate(db,name,exclude){return db.classes.some(c=>c.name.normalize('NFKC')===name.normalize('NFKC')&&c.id!==exclude);}
function inCatalogue(name,active){const entry=catalogue().classes.find(c=>c.name===name);return !!entry&&(!active||entry.active!==false);}
function classroomAccess(req,res,next){const list=req.body?.rows;if(!Array.isArray(list))return next();for(const [i,x] of list.entries()){const n=className(x&&x.className);if(!n||!inCatalogue(n,true))return fail(res,400,'第'+(i+1)+'行班级不存在或已停用，请先到「学校班级管理」创建班级：'+String(x?.className||''));}next();}
module.exports=function(express){const r=express.Router();r.use('/admin',requestGuard);
/* SCHOOL_SAFE_DELETE_V1 */
r.use('/admin',require('../school-delete-package/delete-api')(express));
 r.get('/admin/classes',admin,guard((req,res)=>res.json({classes:counts(catalogue())})));
 r.get('/admin/classes/access',guard((req,res)=>{const all=counts(catalogue());let result=all;if(req.schoolClassTeacher.role==='teacher'){const granted=teacherGrants()[req.schoolClassTeacher.id]||[];result=all.filter(c=>granted.includes(c.name));}res.json({classes:result});}));
 r.post('/admin/classes',admin,guard((req,res)=>{const x=row(req.body||{});if(!x)return fail(res,400,'班级名称、学段或年级不符合要求');const db=catalogue();if(duplicate(db,x.name))return fail(res,409,'班级已经存在，请勿重复创建');const entry={id:crypto.randomUUID(),...x,active:true,source:'管理员新建',createdAt:new Date().toISOString()};db.classes.push(entry);save(CLASSES,db);res.status(201).json({classroom:entry});}));
 r.post('/admin/classes/batch',admin,guard((req,res)=>{const input=req.body.rows;if(!Array.isArray(input)||!input.length||input.length>150)return fail(res,400,'每次批量创建1至150个班级');const db=catalogue(),seen=new Set(db.classes.map(c=>c.name.normalize('NFKC')));const added=[],skipped=[],invalid=[];input.forEach((raw,i)=>{const v=row(raw||{});if(!v){invalid.push({row:i+1,reason:'名称、学段或年级格式不正确'});return;}if(seen.has(v.name.normalize('NFKC'))){skipped.push({row:i+1,name:v.name});return;}seen.add(v.name.normalize('NFKC'));const o={id:crypto.randomUUID(),...v,active:true,source:'批量新建',createdAt:new Date().toISOString()};db.classes.push(o);added.push(o);});if(added.length)save(CLASSES,db);res.json({imported:added.length,skipped:skipped.length,invalid,total:db.classes.length,preview:added.slice(0,10)});}));
 r.patch('/admin/classes/:id',admin,guard((req,res)=>{const db=catalogue(),c=db.classes.find(v=>v.id===req.params.id);if(!c)return fail(res,404,'班级不存在');if(req.body.name!==undefined){const n=className(req.body.name);if(!n)return fail(res,400,'班级名称不合法');if(duplicate(db,n,c.id))return fail(res,409,'新名称已存在');if(n!==c.name){const stat=counts({classes:[c]})[0];if(stat.studentCount||stat.taskCount||stat.teacherIds.length)return fail(res,409,'此班级已有学生、测验任务或任教教师；为保护成绩关联，暂不允许直接改名');c.name=n;}}
 if(req.body.stage!==undefined){if(!stages.has(req.body.stage))return fail(res,400,'学段不合法');c.stage=req.body.stage;}
 if(req.body.grade!==undefined){const grade=short(req.body.grade,30);if(grade===null)return fail(res,400,'年级长度不合法');c.grade=grade;}
 if(req.body.active!==undefined){if(typeof req.body.active!=='boolean')return fail(res,400,'状态值必须为布尔类型');c.active=req.body.active;}
 c.updatedAt=new Date().toISOString();save(CLASSES,db);res.json({classroom:c});}));
 r.delete('/admin/classes/:id',admin,guard((req,res)=>{const db=catalogue(),i=db.classes.findIndex(c=>c.id===req.params.id);if(i<0)return fail(res,404,'班级不存在');const c=db.classes[i],stat=counts({classes:[c]})[0];if(stat.studentCount||stat.taskCount||stat.teacherIds.length)return fail(res,409,'班级仍有关联学生、测验或教师，不能删除；可选择停用');db.classes.splice(i,1);save(CLASSES,db);res.json({ok:true});}));
 // Validate account operations before existing scope router; do not weaken its teacher permissions.
 r.post('/admin/teachers/:id/classes',admin,guard((req,res,next)=>{const names=req.body.classes;if(!Array.isArray(names))return next();const existing=teacherGrants()[req.params.id]||[];for(const name of names){const n=className(name);if(!n||!inCatalogue(n,false))return fail(res,400,'任教班级未创建：'+String(name));if(!inCatalogue(n,true)&&!existing.includes(n))return fail(res,400,'不能新分配已停用的班级：'+n);}next();}));
 r.post('/admin/import',guard(classroomAccess));
 r.patch('/admin/accounts/:id',guard((req,res,next)=>{if(req.body.className!==undefined){const n=className(req.body.className);if(!n||!inCatalogue(n,true))return fail(res,400,'目标班级尚未创建或已停用，请先创建班级');}next();}));
 r.post('/admin/assignments',guard((req,res,next)=>{const n=String(req.body.className||'').trim();if(n&&!inCatalogue(n,true))return fail(res,400,'发布目标班级不存在或已停用');next();}));
 return r;};
module.exports._test={className,row,inferStage,catalogue,counts,duplicate,knownLegacy};
