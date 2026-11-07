'use strict';
// Safe additive patch; never overwrites school accounts, grants, quiz records, or data volumes.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.env.QUIZZLE_ROOT||'/quizzle';
const PKG=path.join(ROOT,'data','school-class-package');
const BACK=path.join(ROOT,'data','.school_classes_v1_rollback');
const MANIFEST=path.join(BACK,'manifest.json');
const INDEX=path.join(ROOT,'server','index.js');
const SCOPE=path.join(ROOT,'data','school-roles-package','scope-api.js');
const ADMIN=path.join(ROOT,'data','school-package','admin.html');
const MARK='/* SCHOOL_CLASS_CATALOG_V1 */';
function sha(x){return crypto.createHash('sha256').update(x).digest('hex');}
function text(f){return fs.readFileSync(f,'utf8');}
function one(s,target,replacement,label){if(s.split(target).length!==2)throw Error(label+' cannot find exact unique insertion point. No code modified.');return s.replace(target,replacement);}
function build(){for(const f of [INDEX,SCOPE,ADMIN])if(!fs.existsSync(f))throw Error('Missing existing module: '+f);
 for(const n of ['class-api.js','class-pages.js','classes.html','classes.js','classes.css'])if(!fs.existsSync(path.join(PKG,n)))throw Error('Missing package file '+n);
 let server=text(INDEX),scope=text(SCOPE),admin=text(ADMIN);
 if(!server.includes('SCHOOL_CLASS_SCOPE_V1')||!server.includes('QUIZZLE_SCHOOL_ACCOUNTS_V1'))throw Error('Current teacher permissions or student accounts module is missing');
 if(server.includes(MARK))throw Error('School class module already or partially wired; do not overwrite manually');
 const compat="app.use('/api/school',require('../data/school-code-compat/school-code-compat')(express));";
 const scopeAnchor="app.use('/api/school',require('../data/school-roles-package/scope-api')(express));";
 const first=server.includes(compat)?compat:scopeAnchor;
 server=one(server,first,`${MARK}\napp.use('/api/school',require('../data/school-class-package/class-api')(express));\n${first}`,'School API mount before code compatibility and teacher scope');
 // New page router before existing school pages router.
 server=one(server,"app.use('/school',require('../data/school-roles-package/scope-pages')(express));",`app.use('/school',require('../data/school-class-package/class-pages')(express));\napp.use('/school',require('../data/school-roles-package/scope-pages')(express));`,'School page mount');
 // Empty classes appear alongside legacy populated classes in the existing teacher-scope editor.
 const old='classes:[...new Set(accounts().map(a=>a.className).filter(Boolean))].sort()';
 const newer="classes:[...new Set([...accounts().map(a=>a.className).filter(Boolean),...read(path.join(SCHOOL,'classes.json'),{classes:[]}).classes.map(c=>c.name)])].sort()";
 scope=one(scope,old,newer,'Teacher authorized class list');
 // Only the administrator can see this link, because its existing parent section is admin-only.
 admin=one(admin,'<section class="card adminCard" id="rbacTeacherBlock" hidden>',`<section class="card adminCard" id="rbacTeacherBlock" hidden><p style="margin:0 0 16px"><a href="/school/classes" class="primary" style="display:inline-block;text-decoration:none;padding:10px 16px;border-radius:10px">🏫 打开学校班级管理：新建、批量建班、教师分班 →</a></p>`,'Admin-only class management link');
 return [[INDEX,server],[SCOPE,scope],[ADMIN,admin]].map(([f,v])=>({file:f,bytes:Buffer.from(v,'utf8')}));
}
function atomic(f,bytes){const temp=f+'.schoolclasses-'+crypto.randomBytes(5).toString('hex');fs.writeFileSync(temp,bytes);fs.renameSync(temp,f);}
function validateInstalled(){const m=JSON.parse(text(MANIFEST));for(const o of m.files)if(!fs.existsSync(o.file)||sha(fs.readFileSync(o.file))!==o.after)throw Error('Detected new code changes after class-management installation: '+o.file+'. Do not overwrite them.');console.log('PASS installed and original modules intact');}
function check(){if(fs.existsSync(MANIFEST)){validateInstalled();return;}build();console.log('PASS - teacher permission API, admin navigation and school routes compatible');}
function apply(){if(fs.existsSync(MANIFEST)){validateInstalled();return;}const changed=build(),files=changed.map((c,i)=>({file:c.file,before:sha(fs.readFileSync(c.file)),after:sha(c.bytes),orig:'original-'+i}));fs.mkdirSync(BACK,{recursive:true});if(fs.readdirSync(BACK).length)throw Error('Unexpected old restore folder; refuse to overwrite');for(const f of files)fs.writeFileSync(path.join(BACK,f.orig),fs.readFileSync(f.file),{flag:'wx'});fs.writeFileSync(MANIFEST,JSON.stringify({version:1,files,installedAt:new Date().toISOString()},null,2),{flag:'wx'});
 const completed=[];try{for(const c of changed){atomic(c.file,c.bytes);completed.push(c.file);}console.log('PASS class catalogue, teacher permissions and admin-only entry installed');}catch(e){for(const file of completed){const f=files.find(v=>v.file===file);atomic(file,fs.readFileSync(path.join(BACK,f.orig)));}fs.renameSync(MANIFEST,MANIFEST+'.failed');throw e;}}
function restore(){if(!fs.existsSync(MANIFEST))throw Error('No class-management install manifest');validateInstalled();const m=JSON.parse(text(MANIFEST));for(const o of m.files)atomic(o.file,fs.readFileSync(path.join(BACK,o.orig)));fs.renameSync(MANIFEST,MANIFEST+'.restored');console.log('RESTORE COMPLETE: code restored. Class records and accounts retained.');}
if(require.main===module){try{if(process.argv[2]==='check')check();else if(process.argv[2]==='apply')apply();else if(process.argv[2]==='restore')restore();else throw Error('usage: check|apply|restore');}catch(e){console.error('ERROR:',e.message);process.exitCode=1;}}
module.exports={build,check,apply,restore};
