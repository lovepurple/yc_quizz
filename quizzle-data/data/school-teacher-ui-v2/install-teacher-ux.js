'use strict';
// Non-destructive installation with checksum-backed rollback.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.env.QUIZZLE_ROOT||'/quizzle',PKG=path.join(ROOT,'data','school-teacher-ui-v2');
const BACK=path.join(ROOT,'data','.teacher-ui-v2-rollback'),MANIFEST=path.join(BACK,'manifest.json');
const ROLES=path.join(ROOT,'data','school-roles-package','teacher-roles.js');
const PAGES=path.join(ROOT,'data','school-class-package','class-pages.js');
const ADMIN=path.join(ROOT,'data','school-package','admin.html');
const MARK='/* SCHOOL_TEACHER_UX_V2 */';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=f=>fs.readFileSync(f,'utf8');
function once(s,target,replacement,label){const first=s.indexOf(target);if(first<0||s.indexOf(target,first+1)>=0)throw Error('找不到唯一安装位置：'+label+'；未修改任何现有模块');return s.slice(0,first)+replacement+s.slice(first+target.length);}
function build(){
 for(const f of [ROLES,PAGES,ADMIN,path.join(PKG,'dashboard-plus.js'),path.join(PKG,'teacher-role-render-v2.js')])if(!fs.existsSync(f))throw Error('必需模块不存在：'+f);
 let role=read(ROLES),pages=read(PAGES),html=read(ADMIN);
 if(!html.includes('rbacTeacherBlock')||!pages.includes("r.get('/classes'"))throw Error('缺少现有教师权限或班级目录模块，不能安全升级');
 if([role,pages,html].some(x=>x.includes(MARK)))throw Error('检测到部分重复安装：请勿覆盖，请检查上一轮安装状态');
 const start=role.indexOf('async function reload(){');const end=role.indexOf("document.getElementById('transferAssignmentForm')",start);
 if(start<0||end<start)throw Error('现有教师分班脚本结构不符，请停止并提供脚本截图');
 role=role.slice(0,start)+MARK+'\n'+read(path.join(PKG,'teacher-role-render-v2.js')).trim()+'\n'+role.slice(end);
 pages=once(pages,"r.get('/classes.css',",`${MARK}\nr.get('/admin-dashboard-plus.js',(_req,res)=>res.type('text/javascript; charset=utf-8').sendFile(path.join('${PKG}','dashboard-plus.js')));\nr.get('/classes.css',`,'班级页面路由');
 html=once(html,'</body>',`<script src="/school/admin-dashboard-plus.js?v=2" defer></script><!-- SCHOOL_TEACHER_UX_V2 --></body>`,'教师页面脚本');
 return [[ROLES,role],[PAGES,pages],[ADMIN,html]].map(([file,contents])=>({file,bytes:Buffer.from(contents,'utf8')}));
}
function atomic(f,buf){const tmp=f+'.teacherux-'+crypto.randomBytes(6).toString('hex');fs.writeFileSync(tmp,buf);fs.renameSync(tmp,f);}
function validateInstalled(){const m=JSON.parse(read(MANIFEST));for(const f of m.files)if(!fs.existsSync(f.file)||hash(fs.readFileSync(f.file))!==f.after)throw Error('已有模块被后续补丁更改，请勿直接覆盖：'+f.file);return m;}
function check(){if(fs.existsSync(MANIFEST)){validateInstalled();console.log('PASS: 已安装且校验通过');return;}build();console.log('PASS: 教师后台、班级目录和分班模块兼容');}
function apply(){if(fs.existsSync(MANIFEST)){validateInstalled();console.log('PASS: 此升级包已经安装，无需重复执行');return;}
 const changed=build(),files=changed.map((x,i)=>({file:x.file,before:hash(fs.readFileSync(x.file)),after:hash(x.bytes),backup:'original-'+i}));
 fs.mkdirSync(BACK,{recursive:true});if(fs.readdirSync(BACK).length)throw Error('发现已有同名回退目录，拒绝覆盖');
 for(const item of files)fs.writeFileSync(path.join(BACK,item.backup),fs.readFileSync(item.file),{flag:'wx'});
 fs.writeFileSync(MANIFEST,JSON.stringify({version:2,installedAt:new Date().toISOString(),files},null,2),{flag:'wx'});
 const done=[];try{for(const c of changed){atomic(c.file,c.bytes);done.push(c.file);}}
 catch(err){for(const f of done){const x=files.find(y=>y.file===f);atomic(f,fs.readFileSync(path.join(BACK,x.backup)));}fs.renameSync(MANIFEST,MANIFEST+'.failed');throw err;}
 console.log('PASS: 我的任教班级、手动新增学生、教师多选分班已经启用；数据文件未修改');
}
function restore(){if(!fs.existsSync(MANIFEST))throw Error('本升级包没有可恢复的安装记录');const m=validateInstalled();for(const item of m.files)atomic(item.file,fs.readFileSync(path.join(BACK,item.backup)));fs.renameSync(MANIFEST,MANIFEST+'.restored');console.log('RESTORE COMPLETE: 已恢复升级前代码，保留账号、题库、成绩与新建学生');}
if(require.main===module){try{const cmd=process.argv[2];if(cmd==='check')check();else if(cmd==='apply')apply();else if(cmd==='restore')restore();else throw Error('使用 check / apply / restore');}catch(err){console.error('ERROR:',err.message);process.exitCode=1;}}
module.exports={build,check,apply,restore};
