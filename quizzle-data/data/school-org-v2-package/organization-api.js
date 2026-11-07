'use strict';
// Three-level school structure: organization/unit -> grade -> class.
// Existing class names and account/score associations remain unchanged.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.env.QUIZZLE_ROOT||'/quizzle';
const DIR=path.join(ROOT,'data','school-accounts');
const CLASSES=path.join(DIR,'classes.json'),ACCOUNTS=path.join(DIR,'accounts.json');
const ASSIGNMENTS=path.join(DIR,'assignments.json'),GRANTS=path.join(DIR,'teacher-classes.json');
const ORG=path.join(DIR,'organization.json');
const {validateToken}=require(path.join(ROOT,'server','utils','auth'));
const {extractToken}=require(path.join(ROOT,'server','middleware','auth'));
function read(f,d){try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){if(e.code==='ENOENT')return d;throw e;}}
function save(f,v){fs.mkdirSync(path.dirname(f),{recursive:true});const tmp=f+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';fs.writeFileSync(tmp,JSON.stringify(v,null,2),'utf8');fs.renameSync(tmp,f);}
function fail(res,status,message){return res.status(status).json({message});}
function clean(v,max=60){if(typeof v!=='string')return null;const s=v.trim();return s&&s.length<=max&&!/[\x00-\x1f<>\\/]/.test(s)?s:null;}
function norm(v){return String(v||'').normalize('NFKC').toLowerCase();}
function inferGrade(name){const m=String(name||'').match(/^(.+?)\s*\d+班$/);return m?m[1]:'未分组';}
function auth(req,res,next){const u=validateToken(extractToken(req));if(!u||!['admin','teacher'].includes(u.role))return fail(res,403,'请先使用教师或管理员账号登录');req.orgUser=u;next();}
function admin(req,res,next){if(req.orgUser?.role!=='admin')return fail(res,403,'只有超级管理员可以管理学校组织架构');next();}
function guard(fn){return(req,res,next)=>{try{const x=fn(req,res,next);if(x&&typeof x.catch==='function')x.catch(e=>{console.error('[school-org-v2]',e);if(!res.headersSent)fail(res,500,'组织架构操作失败，请查看Docker日志');});}catch(e){console.error('[school-org-v2]',e);if(!res.headersSent)fail(res,500,'组织架构操作失败，请查看Docker日志');}};}
function onlyJson(req,res,next){if(['POST','PUT','PATCH','DELETE'].includes(req.method)){const o=req.headers.origin;if(o){try{if(new URL(o).host!==req.headers.host)return fail(res,403,'请求来源不符合要求');}catch{return fail(res,403,'请求来源无效');}}if(!req.is('application/json'))return fail(res,415,'请使用JSON请求');}next();}
function dbClasses(){const d=read(CLASSES,{version:1,classes:[]});if(!Array.isArray(d.classes))throw Error('classes.json结构错误');return d;}
function ensureCatalog(db){
 const names=new Set(db.classes.map(c=>c.name));
 const known=new Set();
 for(const a of (read(ACCOUNTS,{accounts:[]}).accounts||[]))if(a.className)known.add(String(a.className).trim());
 for(const a of (read(ASSIGNMENTS,{assignments:[]}).assignments||[]))if(a.className)known.add(String(a.className).trim());
 for(const arr of Object.values(read(GRANTS,{grants:{}}).grants||{}))if(Array.isArray(arr))for(const n of arr)if(n)known.add(String(n).trim());
 let changed=false;
 for(const name of known){if(!name||names.has(name))continue;let stage='原有班级',grade='未分组';const m=name.match(/^(.+?)(?:\s*)\d+班$/);if(m)grade=m[1];else if(/^[一二三四五六七八九十]+年级/.test(name))grade=name.match(/^[一二三四五六七八九十]+年级/)[0];db.classes.push({id:crypto.randomUUID(),name,stage,grade,active:true,source:'既有数据',createdAt:new Date().toISOString()});names.add(name);changed=true;}
 if(changed)save(CLASSES,db);return db;
}
function ensureOrg(){
 let db=ensureCatalog(dbClasses());let org=read(ORG,null);let changed=false;
 if(!org||!Array.isArray(org.units)){
  org={version:2,units:[]};const unitMap=new Map();
  for(const c of db.classes){const unitName=clean(c.stage)||'原有班级',gradeName=clean(c.grade)||inferGrade(c.name);let u=unitMap.get(norm(unitName));if(!u){u={id:crypto.randomUUID(),name:unitName,grades:[],createdAt:new Date().toISOString()};unitMap.set(norm(unitName),u);org.units.push(u);}let g=u.grades.find(x=>norm(x.name)===norm(gradeName));if(!g){g={id:crypto.randomUUID(),name:gradeName,createdAt:new Date().toISOString()};u.grades.push(g);}c.orgUnitId=u.id;c.gradeId=g.id;c.stage=u.name;c.grade=g.name;changed=true;
  }
 }else{
  for(const u of org.units){if(!Array.isArray(u.grades))u.grades=[];}
  for(const c of db.classes){let u=org.units.find(x=>x.id===c.orgUnitId);if(!u){const unitName=clean(c.stage)||'原有班级';u=org.units.find(x=>norm(x.name)===norm(unitName));if(!u){u={id:crypto.randomUUID(),name:unitName,grades:[],createdAt:new Date().toISOString()};org.units.push(u);}c.orgUnitId=u.id;changed=true;}let g=u.grades.find(x=>x.id===c.gradeId);if(!g){const gradeName=clean(c.grade)||inferGrade(c.name);g=u.grades.find(x=>norm(x.name)===norm(gradeName));if(!g){g={id:crypto.randomUUID(),name:gradeName,createdAt:new Date().toISOString()};u.grades.push(g);}c.gradeId=g.id;changed=true;}if(c.stage!==u.name){c.stage=u.name;changed=true;}if(c.grade!==g.name){c.grade=g.name;changed=true;}}
 }
 if(changed)save(CLASSES,db);if(!fs.existsSync(ORG)||changed)save(ORG,org);return {org,db};
}
function refs(){const pupils=new Map(),tasks=new Map(),teachers=new Map();for(const a of (read(ACCOUNTS,{accounts:[]}).accounts||[]).filter(x=>!x.deletedAt))pupils.set(a.className,(pupils.get(a.className)||0)+1);for(const a of (read(ASSIGNMENTS,{assignments:[]}).assignments||[]).filter(x=>!x.deletedAt))if(a.className)tasks.set(a.className,(tasks.get(a.className)||0)+1);for(const [id,list] of Object.entries(read(GRANTS,{grants:{}}).grants||{}))for(const name of Array.isArray(list)?list:[]){if(!teachers.has(name))teachers.set(name,[]);teachers.get(name).push(id);}return {pupils,tasks,teachers};}
function tree(){const {org,db}=ensureOrg(),r=refs();return {units:org.units.map(u=>({...u,grades:u.grades.map(g=>({...g,classes:db.classes.filter(c=>c.orgUnitId===u.id&&c.gradeId===g.id).map(c=>({...c,studentCount:r.pupils.get(c.name)||0,taskCount:r.tasks.get(c.name)||0,teacherCount:(r.teachers.get(c.name)||[]).length,teacherIds:r.teachers.get(c.name)||[]}))}))}))};}
function unique(list,name,exclude){return list.some(x=>norm(x.name)===norm(name)&&x.id!==exclude);}
function classUsed(name){const r=refs();return (r.pupils.get(name)||0)+(r.tasks.get(name)||0)+(r.teachers.get(name)||[]).length>0;}
module.exports=function(express){const r=express.Router();r.use(onlyJson);r.use('/admin',auth);r.use('/admin/organization',admin);
 r.get('/admin/organization',guard((req,res)=>res.json(tree())));
 r.post('/admin/organization/units',guard((req,res)=>{const name=clean(req.body.name);if(!name)return fail(res,400,'一级组织名称不能为空，最多60字');const {org}=ensureOrg();if(unique(org.units,name))return fail(res,409,'一级组织名称已存在');const unit={id:crypto.randomUUID(),name,grades:[],createdAt:new Date().toISOString()};org.units.push(unit);save(ORG,org);res.status(201).json({unit});}));
 r.patch('/admin/organization/units/:id',guard((req,res)=>{const {org,db}=ensureOrg(),u=org.units.find(x=>x.id===req.params.id);if(!u)return fail(res,404,'一级组织不存在');const name=clean(req.body.name);if(!name)return fail(res,400,'组织名称不合法');if(unique(org.units,name,u.id))return fail(res,409,'组织名称已存在');u.name=name;for(const c of db.classes)if(c.orgUnitId===u.id)c.stage=name;save(CLASSES,db);save(ORG,org);res.json({unit:u});}));
 r.delete('/admin/organization/units/:id',guard((req,res)=>{const {org,db}=ensureOrg(),i=org.units.findIndex(x=>x.id===req.params.id);if(i<0)return fail(res,404,'一级组织不存在');const u=org.units[i];if(db.classes.some(c=>c.orgUnitId===u.id))return fail(res,409,'该组织下仍有班级，不能删除；请先迁移或删除班级');org.units.splice(i,1);save(ORG,org);res.json({ok:true});}));
 r.post('/admin/organization/units/:id/grades',guard((req,res)=>{const {org}=ensureOrg(),u=org.units.find(x=>x.id===req.params.id);if(!u)return fail(res,404,'一级组织不存在');const name=clean(req.body.name);if(!name)return fail(res,400,'二级年级名称不能为空，最多60字');if(unique(u.grades,name))return fail(res,409,'该组织下已存在同名年级');const grade={id:crypto.randomUUID(),name,createdAt:new Date().toISOString()};u.grades.push(grade);save(ORG,org);res.status(201).json({grade});}));
 r.patch('/admin/organization/grades/:id',guard((req,res)=>{const {org,db}=ensureOrg();let found=null;for(const u of org.units){const g=u.grades.find(x=>x.id===req.params.id);if(g){found={u,g};break;}}if(!found)return fail(res,404,'二级年级不存在');const name=clean(req.body.name);if(!name)return fail(res,400,'年级名称不合法');if(unique(found.u.grades,name,found.g.id))return fail(res,409,'该组织下年级名称已存在');found.g.name=name;for(const c of db.classes)if(c.gradeId===found.g.id)c.grade=name;save(CLASSES,db);save(ORG,org);res.json({grade:found.g});}));
 r.delete('/admin/organization/grades/:id',guard((req,res)=>{const {org,db}=ensureOrg();for(const u of org.units){const i=u.grades.findIndex(x=>x.id===req.params.id);if(i>=0){if(db.classes.some(c=>c.gradeId===req.params.id))return fail(res,409,'该年级下仍有班级，不能删除');u.grades.splice(i,1);save(ORG,org);return res.json({ok:true});}}return fail(res,404,'二级年级不存在');}));
 r.post('/admin/organization/grades/:id/classes',guard((req,res)=>{const {org,db}=ensureOrg();let found=null;for(const u of org.units){const g=u.grades.find(x=>x.id===req.params.id);if(g){found={u,g};break;}}if(!found)return fail(res,404,'请先选择已创建的年级');const name=clean(req.body.name);if(!name)return fail(res,400,'班级名称不能为空，最多60字');if(db.classes.some(c=>norm(c.name)===norm(name)))return fail(res,409,'班级名称已存在。为兼容学生账号和成绩，班级名称必须全校唯一');const item={id:crypto.randomUUID(),name,stage:found.u.name,grade:found.g.name,orgUnitId:found.u.id,gradeId:found.g.id,active:true,source:'管理员新建',createdAt:new Date().toISOString()};db.classes.push(item);save(CLASSES,db);res.status(201).json({classroom:item});}));
 r.post('/admin/organization/grades/:id/classes/batch',guard((req,res)=>{const {org,db}=ensureOrg();let found=null;for(const u of org.units){const g=u.grades.find(x=>x.id===req.params.id);if(g){found={u,g};break;}}if(!found)return fail(res,404,'请先选择已创建的年级');const rows=req.body.names;if(!Array.isArray(rows)||!rows.length||rows.length>150)return fail(res,400,'每批需要1至150个班级名称');const seen=new Set(db.classes.map(c=>norm(c.name))),added=[],skipped=[],invalid=[];rows.forEach((raw,i)=>{const name=clean(raw);if(!name){invalid.push({row:i+1,reason:'班级名称为空或格式不合法'});return;}if(seen.has(norm(name))){skipped.push({row:i+1,name});return;}seen.add(norm(name));added.push({id:crypto.randomUUID(),name,stage:found.u.name,grade:found.g.name,orgUnitId:found.u.id,gradeId:found.g.id,active:true,source:'批量新建',createdAt:new Date().toISOString()});});if(added.length){db.classes.push(...added);save(CLASSES,db);}res.json({imported:added.length,skipped:skipped.length,invalid,total:db.classes.length});}));
 r.patch('/admin/organization/classes/:id',guard((req,res)=>{const db=dbClasses(),c=db.classes.find(x=>x.id===req.params.id);if(!c)return fail(res,404,'班级不存在');if(req.body.name!==undefined){const name=clean(req.body.name);if(!name)return fail(res,400,'班级名称不合法');if(db.classes.some(x=>x.id!==c.id&&norm(x.name)===norm(name)))return fail(res,409,'班级名称已存在');if(name!==c.name&&classUsed(c.name))return fail(res,409,'该班级已有学生、测验或教师关联，为保护历史成绩不能直接改名');c.name=name;}if(req.body.active!==undefined){if(typeof req.body.active!=='boolean')return fail(res,400,'状态参数必须为布尔值');c.active=req.body.active;}c.updatedAt=new Date().toISOString();save(CLASSES,db);res.json({classroom:c});}));
 r.delete('/admin/organization/classes/:id',guard((req,res)=>{const db=dbClasses(),i=db.classes.findIndex(x=>x.id===req.params.id);if(i<0)return fail(res,404,'班级不存在');const c=db.classes[i];if(classUsed(c.name))return fail(res,409,'班级仍有关联学生、测验或任教教师，不能删除；可以停用');db.classes.splice(i,1);save(CLASSES,db);res.json({ok:true});}));
 return r;};
module.exports._test={clean,inferGrade,ensureOrg,tree};
