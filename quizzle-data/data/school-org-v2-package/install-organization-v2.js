'use strict';
/* Reversible Quizzle school organization + teacher account upgrade v2. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.env.QUIZZLE_ROOT||'/quizzle',DATA=path.join(ROOT,'data'),PKG=__dirname;
const BACK=path.join(DATA,'.school_org_v2_backup'),MANIFEST=path.join(BACK,'manifest.json');
const MARK='/* SCHOOL_ORGANIZATION_V2 */';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=f=>fs.readFileSync(f);
function atomic(file,bytes){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.orgv2-'+crypto.randomBytes(6).toString('hex')+'.tmp';fs.writeFileSync(tmp,bytes);fs.renameSync(tmp,file);}
function one(s,needle,replacement,label){const parts=s.split(needle);if(parts.length!==2)throw Error(label+'定位失败（必须唯一匹配），没有修改系统文件。');return s.replace(needle,replacement);}
function patchAuth(src){
 let s=src.toString('utf8');if(s.includes('SCHOOL_ORG_V2_AUTH'))return s;
 s=one(s,`    const user = {\n        id: crypto.randomUUID(),\n        username,\n        password: hashPassword(password),\n        role,\n        createdAt: new Date().toISOString()\n    };`,
`    const user = {\n        id: crypto.randomUUID(),\n        username,\n        password: hashPassword(password),\n        role,\n        active: true,\n        mustChangePassword: role === 'teacher',\n        sessionVersion: 1,\n        createdAt: new Date().toISOString()\n    };`,'教师账号首次登录标记');
 s=one(s,`    if (!user) return {error: 'Ungültige Anmeldedaten.'};`,`    if (!user || user.active === false) return {error: 'Ungültige Anmeldedaten.'};`,'停用教师登录拦截');
 s=one(s,`    sessions.set(token, {userId: user.id, expiresAt});`,`    sessions.set(token, {userId: user.id, expiresAt, sessionVersion: user.sessionVersion || 1});`,'登录会话版本');
 s=one(s,`        user: {id: user.id, username: user.username, role: user.role}`,`        user: {id: user.id, username: user.username, role: user.role, mustChangePassword: !!user.mustChangePassword}`,'登录返回首次修改标记');
 s=one(s,`    const user = data.users.find(u => u.id === session.userId);\n    if (!user) return null;\n\n    return {id: user.id, username: user.username, role: user.role};`,
`    const user = data.users.find(u => u.id === session.userId);\n    if (!user || user.active === false) return null;\n    if ((session.sessionVersion || 1) !== (user.sessionVersion || 1)) return null;\n\n    return {id: user.id, username: user.username, role: user.role, active: user.active !== false, mustChangePassword: !!user.mustChangePassword};`,'登录会话与首次修改校验');
 s=one(s,`const getUsers = () => {\n    const data = readUsers();\n    return data.users.map(u => ({\n        id: u.id,\n        username: u.username,\n        role: u.role,\n        createdAt: u.createdAt\n    }));\n};`,
`const getUsers = () => {\n    const data = readUsers();\n    return data.users.map(u => ({\n        id: u.id,\n        username: u.username,\n        role: u.role,\n        active: u.active !== false,\n        mustChangePassword: !!u.mustChangePassword,\n        createdAt: u.createdAt\n    }));\n};`,'管理员教师账号状态字段');
 s=one(s,`const updateUserRole = (userId, role) => {\n    const data = readUsers();\n    const user = data.users.find(u => u.id === userId);\n    if (!user) return {error: 'Benutzer nicht gefunden.'};\n\n    user.role = role;\n    writeUsers(data);\n\n    return {user: {id: user.id, username: user.username, role: user.role}};\n};`,
`const updateUserRole = (userId, role) => {\n    const data = readUsers();\n    const user = data.users.find(u => u.id === userId);\n    if (!user) return {error: 'Benutzer nicht gefunden.'};\n\n    user.role = role;\n    if (role === 'teacher') user.mustChangePassword = true;\n    writeUsers(data);\n\n    return {user: {id: user.id, username: user.username, role: user.role}};\n};`,'教师角色安全默认');
 s=one(s,`const changePassword = (userId, newPassword) => {\n    const data = readUsers();\n    const user = data.users.find(u => u.id === userId);\n    if (!user) return {error: 'Benutzer nicht gefunden.'};\n\n    user.password = hashPassword(newPassword);\n    writeUsers(data);\n\n    return {success: true};\n};`,
`const changePassword = (userId, newPassword, mustChange = true, keepToken = null) => {\n    const data = readUsers();\n    const user = data.users.find(u => u.id === userId);\n    if (!user) return {error: 'Benutzer nicht gefunden.'};\n\n    user.password = hashPassword(newPassword);\n    user.mustChangePassword = !!mustChange;\n    user.passwordChangedAt = new Date().toISOString();\n    user.sessionVersion = (user.sessionVersion || 1) + 1;\n    for (const [token, session] of sessions) {\n        if (session.userId !== userId) continue;\n        if (keepToken && token === keepToken) session.sessionVersion = user.sessionVersion;\n        else sessions.delete(token);\n    }\n    writeUsers(data);\n\n    return {success: true};\n};\n\nconst setUserActive = (userId, active) => {\n    const data = readUsers();\n    const user = data.users.find(u => u.id === userId);\n    if (!user) return false;\n    user.active = !!active;\n    user.updatedAt = new Date().toISOString();\n    if (!user.active) {\n        user.sessionVersion = (user.sessionVersion || 1) + 1;\n        for (const [token, session] of sessions) if (session.userId === userId) sessions.delete(token);\n    }\n    writeUsers(data);\n    return true;\n};`,'安全密码重置与账号启停');
 s=one(s,`    changePassword\n};`,`    changePassword,\n    setUserActive\n};`,'导出教师账号状态操作');
 return s+'\n/* SCHOOL_ORG_V2_AUTH */\n';
}
function patchIndex(src){let s=src.toString('utf8');if(s.includes(MARK))return s;
 const anchor='app.use("/api/auth", require("./routes/auth"));';
 const block=`${anchor}\n${MARK}\napp.use(require('../data/school-org-v2-package/teacher-first-login-guard'));\napp.use('/api/teacher-account', require('../data/school-org-v2-package/teacher-account-api')(express));\napp.use('/api/school', require('../data/school-org-v2-package/organization-api')(express));`;
 return one(s,anchor,block,'服务器认证与组织架构路由');
}
function patchSchoolPages(src){let s=src.toString('utf8');if(s.includes('SCHOOL_ORG_V2_FIRST_LOGIN_PAGE'))return s;
 const anchor=`r.get('/admin.js',(_req,res)=>res.sendFile(path.join(base,'admin.js')));`;
 const extra=`${anchor}\nr.get('/teacher-first-login',(_req,res)=>res.set('Cache-Control','no-store').sendFile(path.join(process.env.QUIZZLE_ROOT||'/quizzle','data','school-org-v2-package','teacher-first-login.html')));\n/* SCHOOL_ORG_V2_FIRST_LOGIN_PAGE */`;
 return one(s,anchor,extra,'首次登录修改密码页面路由');
}
function patchDist(src){let s=src.toString('utf8');if(s.includes('SCHOOL_ORG_V2_LOGIN_REDIRECT'))return s;
 const m=s.match(/<script type="module" crossorigin src="[^"]+">/);if(!m)throw Error('无法定位Quizzle前端入口脚本');
 const script=`<script id="school-org-v2-login-redirect">(function(){var original=window.fetch;window.fetch=function(){var args=arguments;return original.apply(this,args).then(function(response){try{var input=args[0],url=typeof input==='string'?input:(input&&input.url)||'';var pathname=new URL(url,location.href).pathname;if(pathname==='/api/auth/login'&&response.ok){response.clone().json().then(function(data){if(data&&data.user&&data.user.role==='teacher'&&data.user.mustChangePassword){location.replace('/school/teacher-first-login');}}).catch(function(){});}}catch(e){}return response;});};})();</script><!-- SCHOOL_ORG_V2_LOGIN_REDIRECT -->\n`;
 return one(s,m[0],script+m[0],'登录成功后强制跳转');
}
function plan(){
 const required=['school-class-package/classes.html','school-class-package/classes.js','school-class-package/classes.css','school-roles-package/scope-api.js','school-roles-package/teacher-roles.js','school-teacher-ui-v2/dashboard-plus.js','organization-api.js','teacher-account-api.js','teacher-first-login-guard.js','teacher-first-login.html'];
 for(const n of required)if(!fs.existsSync(path.join(PKG,n)))throw Error('升级包缺少文件：'+n);
 const targets=[
  ['data/school-class-package/classes.html',path.join(PKG,'school-class-package/classes.html'),'copy'],
  ['data/school-class-package/classes.js',path.join(PKG,'school-class-package/classes.js'),'copy'],
  ['data/school-class-package/classes.css',path.join(PKG,'school-class-package/classes.css'),'copy'],
  ['data/school-roles-package/scope-api.js',path.join(PKG,'school-roles-package/scope-api.js'),'copy'],
  ['data/school-roles-package/teacher-roles.js',path.join(PKG,'school-roles-package/teacher-roles.js'),'copy'],
  ['data/school-teacher-ui-v2/dashboard-plus.js',path.join(PKG,'school-teacher-ui-v2/dashboard-plus.js'),'copy'],
  ['server/utils/auth.js',path.join(ROOT,'server','utils','auth.js'),'auth'],
  ['server/index.js',path.join(ROOT,'server','index.js'),'index'],
  ['data/school-package/school-pages.js',path.join(ROOT,'data','school-package','school-pages.js'),'pages'],
  ['dist/index.html',path.join(ROOT,'dist','index.html'),'dist']
 ];
 for(const [rel,source,kind] of targets){const target=path.join(ROOT,rel);if(!fs.existsSync(target))throw Error('找不到现有系统文件：'+rel);if(kind==='copy'&&!fs.existsSync(source))throw Error('升级文件不存在：'+source);}
 const server=read(path.join(ROOT,'server','index.js')).toString('utf8');
 if(server.includes(MARK))throw Error('学校组织架构 v2 已安装或存在部分安装；没有有效安装清单时拒绝重复覆盖。');
 if(!server.includes('QUIZZLE_SCHOOL_ACCOUNTS_V1')||!server.includes('SCHOOL_CLASS_SCOPE_V1')||!server.includes('SCHOOL_CLASS_CATALOG_V1')||!server.includes('QUIZZLE_QUESTION_BANK_V1'))throw Error('未检测到已安装的学校账号、教师权限、三级班级目录或题库模块。为保护当前系统，停止升级。');
 const schoolApi=read(path.join(ROOT,'data','school-roles-package','scope-api.js')).toString('utf8');
 if(!schoolApi.includes("r.get('/admin/teachers'")||!schoolApi.includes("r.post('/admin/teachers/:id/classes'"))throw Error('教师班级权限 API 版本不匹配。');
 const out=[];
 for(const [rel,source,kind] of targets){const target=path.join(ROOT,rel),before=read(target);let after;if(kind==='copy')after=read(source);else if(kind==='auth')after=Buffer.from(patchAuth(before));else if(kind==='index')after=Buffer.from(patchIndex(before));else if(kind==='pages')after=Buffer.from(patchSchoolPages(before));else if(kind==='dist')after=Buffer.from(patchDist(before));if(!after.equals(before))out.push({target,relative:rel,before,after});}
 return out;
}
function validate(){const m=JSON.parse(read(MANIFEST).toString('utf8'));for(const x of m.files){const f=path.join(ROOT,x.relative);if(!fs.existsSync(f)||hash(read(f))!==x.afterHash)throw Error('检测到升级后文件被修改，拒绝自动覆盖：'+x.relative);}console.log('PASS：学校组织架构 v2 已安装，当前文件校验一致。');}
function check(){if(fs.existsSync(MANIFEST)){validate();return;}if(fs.existsSync(BACK)&&fs.readdirSync(BACK).length)throw Error('发现未完成的组织架构备份目录，请先检查。');const items=plan();console.log('PASS：确认当前 Quizzle 2.6.3、题库模块、教师权限和班级目录兼容。');console.log('PASS：将升级 '+items.length+' 个现有文件；先备份原文件，再原子替换。');console.log('PASS：学生账号、密码、成绩、测验、教师授权和数据卷记录不会被重置。');}
function apply(){if(fs.existsSync(MANIFEST)){validate();console.log('无需重复安装。');return;}if(fs.existsSync(BACK)&&fs.readdirSync(BACK).length)throw Error('发现旧备份目录，请检查后再升级。');const items=plan();fs.mkdirSync(BACK,{recursive:true});const files=[];items.forEach((x,i)=>{const save='original-'+String(i).padStart(2,'0');fs.writeFileSync(path.join(BACK,save),x.before,{flag:'wx'});files.push({relative:x.relative,save,beforeHash:hash(x.before),afterHash:hash(x.after)});});fs.writeFileSync(MANIFEST,JSON.stringify({kind:'school-organization-teacher-v2',version:'2.0.0',createdAt:new Date().toISOString(),files},null,2),{flag:'wx'});const done=[];try{for(const x of items){atomic(x.target,x.after);done.push(x);}console.log('PASS：三级自定义组织架构、教师分级授权、教师首次登录改密和账号管理代码已安装。');console.log('PASS：回滚备份位于 '+BACK);console.log('PASS：没有修改学生账号、成绩、测验或现有教师授权数据。');}catch(e){for(const x of done.reverse()){const meta=files.find(f=>f.relative===x.relative);atomic(x.target,read(path.join(BACK,meta.save)));}fs.renameSync(MANIFEST,MANIFEST+'.failed');throw e;}}
function restore(){if(!fs.existsSync(MANIFEST))throw Error('没有找到组织架构 v2 安装清单。');validate();const m=JSON.parse(read(MANIFEST).toString('utf8'));for(const x of m.files)atomic(path.join(ROOT,x.relative),read(path.join(BACK,x.save)));fs.renameSync(MANIFEST,path.join(BACK,'manifest.restored.json'));console.log('RESTORE COMPLETE：已恢复升级前代码；organization.json 等新建组织数据不会自动删除，原学生账号、测验和成绩保留。');}
try{const task=process.argv[2]||'check';if(task==='check')check();else if(task==='apply')apply();else if(task==='restore')restore();else throw Error('参数必须是 check / apply / restore');}catch(e){console.error('ERROR：'+e.message);process.exitCode=1;}
