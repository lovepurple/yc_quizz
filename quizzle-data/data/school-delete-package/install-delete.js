'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.env.QUIZZLE_ROOT||'/quizzle';
const PKG=path.join(ROOT,'data','school-delete-package');
const BACK=path.join(ROOT,'data','.school-delete-v1-rollback');
const MANIFEST=path.join(BACK,'manifest.json');
const CLASSAPI=path.join(ROOT,'data','school-class-package','class-api.js');
const PAGES=path.join(ROOT,'data','school-class-package','class-pages.js');
const ADMIN=path.join(ROOT,'data','school-package','admin.html');
const MARK='/* SCHOOL_SAFE_DELETE_V1 */';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const txt=p=>fs.readFileSync(p,'utf8');
function replaceOnce(s,needle,replacement,label){const i=s.indexOf(needle);if(i<0||s.indexOf(needle,i+needle.length)!==-1)throw Error('兼容检查失败：'+label+'（没有找到唯一插入位置）');return s.slice(0,i)+replacement+s.slice(i+needle.length);}
function build(){for(const f of [CLASSAPI,PAGES,ADMIN,path.join(PKG,'delete-api.js'),path.join(PKG,'delete-ui.js')])if(!fs.existsSync(f))throw Error('必需文件缺失：'+f);
 let api=txt(CLASSAPI),pages=txt(PAGES),admin=txt(ADMIN);
 if([api,pages,admin].some(s=>s.includes(MARK)))throw Error('检测到已有或部分安全删除补丁，请勿覆盖原代码');
 if(!api.includes('school-accounts')||!admin.includes('accountsBody')||!admin.includes('assignmentBody'))throw Error('现有校园账号、测验管理接口不匹配');
 api=replaceOnce(api,"r.use('/admin',requestGuard);",`r.use('/admin',requestGuard);\n${MARK}\nr.use('/admin',require('../school-delete-package/delete-api')(express));`,'管理员请求鉴权入口');
 api=replaceOnce(api,'for(const a of roster())pupils.set','for(const a of roster().filter(x=>!x.deletedAt))pupils.set','班级学生人数');
 api=replaceOnce(api,'for(const a of tasks())jobs.set','for(const a of tasks().filter(x=>!x.deletedAt))jobs.set','班级测验数量');
 pages=replaceOnce(pages,'return r;};',`${MARK}\nr.get('/delete-ui.js',(_req,res)=>res.type('text/javascript; charset=utf-8').sendFile(path.join(dir,'../school-delete-package/delete-ui.js')));\nreturn r;};`,'页面脚本服务');
 admin=replaceOnce(admin,'</body>',`<script defer src="/school/delete-ui.js?v=1"></script><!-- SCHOOL_SAFE_DELETE_V1 --></body>`,'教师管理页入口');
 return [[CLASSAPI,api],[PAGES,pages],[ADMIN,admin]].map(([file,s])=>({file,bytes:Buffer.from(s,'utf8')}));
}
function atomic(file,data){const tmp=file+'.qds-'+crypto.randomBytes(5).toString('hex');fs.writeFileSync(tmp,data);fs.renameSync(tmp,file);}
function installed(){if(!fs.existsSync(MANIFEST))return false;const m=JSON.parse(txt(MANIFEST));for(const f of m.files){if(!fs.existsSync(f.file)||hash(fs.readFileSync(f.file))!==f.after)throw Error('本补丁安装后有其他代码修改，不能盲目覆盖：'+f.file);}return true;}
function check(){if(installed()){console.log('PASS: 安全删除补丁已安装，校验通过');return;}build();console.log('PASS: 校园班级接口、教师页面和现有成绩系统兼容');}
function apply(){if(installed()){console.log('PASS: 已安装，跳过重复执行');return;}const changed=build();if(fs.existsSync(BACK))throw Error('旧回退目录存在，拒绝覆盖：'+BACK);fs.mkdirSync(BACK,{recursive:true});const manifest={version:1,installedAt:new Date().toISOString(),files:[]};
 for(let i=0;i<changed.length;i++){const x=changed[i],old=fs.readFileSync(x.file);const original='original-'+i;fs.writeFileSync(path.join(BACK,original),old,{flag:'wx'});manifest.files.push({file:x.file,before:hash(old),after:hash(x.bytes),original});}
 fs.writeFileSync(MANIFEST,JSON.stringify(manifest,null,2),{flag:'wx'});const done=[];try{for(const x of changed){atomic(x.file,x.bytes);done.push(x.file);}}catch(e){for(const f of done){const record=manifest.files.find(i=>i.file===f);atomic(f,fs.readFileSync(path.join(BACK,record.original)));}fs.renameSync(MANIFEST,MANIFEST+'.failed');throw e;}
 console.log('PASS: 已增加教师删除、管理员回收站、确认弹窗及权限过滤；账号、题库、成绩数据未更改');}
function restore(){if(!installed())throw Error('未找到可用的已安装补丁记录');const m=JSON.parse(txt(MANIFEST));for(const record of m.files)atomic(record.file,fs.readFileSync(path.join(BACK,record.original)));fs.renameSync(MANIFEST,MANIFEST+'.restored');console.log('RESTORE COMPLETE: 界面与接口已恢复；原有账号、成绩及回收站信息保留，已删除对象不会自动恢复');}
if(require.main===module){try{const mode=process.argv[2];if(mode==='check')check();else if(mode==='apply')apply();else if(mode==='restore')restore();else throw Error('使用 check|apply|restore');}catch(e){console.error('ERROR:',e.message);process.exitCode=1;}}
module.exports={build,check,apply,restore};
