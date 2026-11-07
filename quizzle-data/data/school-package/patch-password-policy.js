/* Quizzle 2.6.3 student accounts: teacher-managed password mode.
 * Applies a targeted and reversible patch to the already-installed school addon.
 * Does not read or modify accounts.json, assignments.json, attempts or scores.
 */
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=process.env.QUIZZLE_ROOT||'/quizzle';
const base=path.join(root,'data','school-package');
const backup=path.join(root,'data','school-password-adminonly-backup-v1');
const files=['school-api.js','student.js','student.html','admin.js','admin.html'];
const marker='/* SCHOOL_PASSWORD_ADMIN_ONLY_V1 */';
function sha(v){return crypto.createHash('sha256').update(v).digest('hex');}
function mustReplace(s,oldValue,newValue,description){
  if(!s.includes(oldValue))throw Error(description+'：无法找到预期的原文；可能不是配套版本，请不要强制安装');
  const parts=s.split(oldValue);
  if(parts.length!==2)throw Error(description+'：找到重复原文，停止以避免误修改');
  return parts.join(newValue);
}
function build(name,s){
  if(name==='school-api.js'){
    s=mustReplace(s,'mustChange:a.mustChange','mustChange:false','禁用首次改密状态');
    s=mustReplace(s,"if(u.mustChange)return res.status(403).json({message:'请先修改初始密码',mustChange:true});",'','解除旧账号登录限制');
    const begin=" r.post('/change-password',studentAny,errRoute(";
    const end=" r.get('/available'";
    const b=s.indexOf(begin),e=s.indexOf(end,b+1);
    if(b<0||e<b)throw Error('学生改密接口：未找到预期的接口边界');
    s=s.slice(0,b)+" r.post('/change-password',(_req,res)=>res.status(403).json({message:'学生密码由学校统一管理，请联系教师重置'}));\n"+s.slice(e);
    s=mustReplace(s,'active:true,mustChange:true','active:true,mustChange:false','新学生导入策略');
    s=mustReplace(s,'u.mustChange=true;','u.mustChange=false;','教师重置密码策略');
    return marker+'\n'+s;
  }
  if(name==='student.js'){
    s=mustReplace(s,"const views=['loginView','changeView','dashboardView','quizView','resultView'];","const views=['loginView','dashboardView','quizView','resultView'];",'学生端视图列表');
    s=mustReplace(s,"else if(u.mustChange)show('changeView');else{","else{",'学生端登录跳转');
    s=mustReplace(s,"$('oldPwd').value=$('password').value;",'', '不保留首次改密密码');
    const start=s.indexOf("$('changeForm').addEventListener('submit'");
    const finish=s.indexOf("$('logoutBtn').onclick=",start);
    if(start<0||finish<start)throw Error('移除学生改密事件：找不到原来的处理器');
    s=s.slice(0,start)+s.slice(finish);
    return marker+'\n'+s;
  }
  if(name==='student.html'){
    const start=s.indexOf('<section id="changeView"');
    const finish=s.indexOf('<section id="dashboardView"',start);
    if(start<0||finish<start)throw Error('首次改密表单：未找到预期页面');
    return s.slice(0,start)+s.slice(finish);
  }
  if(name==='admin.js'){
    s=mustReplace(s,"a.mustChange?'待修改':'已修改'","'教师管理'",'教师端账号状态列');
    s=mustReplace(s,'设置新初始密码（至少8位；重置后学生须再次改密）','教师设置密码（至少8位；学生无权修改）','重置密码提示');
    return marker+'\n'+s;
  }
  if(name==='admin.html'){
    s=mustReplace(s,'允许密码与账号相同，但学生首次登录必须修改密码','允许学校统一设置密码，学生不能自行修改（建议每人使用不同密码）','CSV导入说明');
    s=mustReplace(s,'<th>初始密码</th>','<th>密码管理</th>','管理表头');
    return s;
  }
  throw Error('未知文件 '+name);
}
function writeAtomic(dest,buf){const temp=dest+'.adminonly.tmp';fs.writeFileSync(temp,buf);fs.renameSync(temp,dest);}
function readManifest(){return JSON.parse(fs.readFileSync(path.join(backup,'manifest.json'),'utf8'));}
function apply(){
  const src={};for(const f of files){const p=path.join(base,f);if(!fs.existsSync(p))throw Error('找不到 '+p+'，请先安装学生账号系统');src[f]=fs.readFileSync(p);}
  if(src['school-api.js'].toString('utf8').includes(marker)){
    const m=readManifest();for(const f of files)if(sha(src[f])!==m.modified[f])throw Error('已安装过但文件发生变化；请检查后再执行');
    console.log('PASS: 已安装，所有文件哈希正常，无需重复安装');return;
  }
  if(fs.existsSync(path.join(backup,'manifest.json')))throw Error('检测到既有备份，但当前不在已安装状态，为安全起见停止');
  const out={};for(const f of files)out[f]=Buffer.from(build(f,src[f].toString('utf8')),'utf8');
  const manifest={version:'1',original:Object.fromEntries(files.map(f=>[f,sha(src[f])])),modified:Object.fromEntries(files.map(f=>[f,sha(out[f])]))};
  fs.mkdirSync(backup,{recursive:true});
  for(const f of files)fs.writeFileSync(path.join(backup,f),src[f]);
  fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify(manifest,null,2));
  const done=[];
  try{
    for(const f of files){writeAtomic(path.join(base,f),out[f]);done.push(f);}
    console.log('PASS: 学生端无首次改密页面；学生密码修改接口返回403');
    console.log('PASS: 老账号直接登录；新导入和教师重置的密码均由教师管理');
    console.log('PASS: 原账户哈希、题库、考试和成绩数据均未修改');
  }catch(err){
    for(const f of done)writeAtomic(path.join(base,f),src[f]);
    fs.rmSync(backup,{recursive:true,force:true});
    throw err;
  }
}
function restore(){
  if(!fs.existsSync(path.join(backup,'manifest.json')))throw Error('没有找到此次补丁的备份');
  const m=readManifest();
  for(const f of files){const p=path.join(base,f);if(!fs.existsSync(p)||sha(fs.readFileSync(p))!==m.modified[f])throw Error('文件已被后续升级修改：'+f+'；为防覆盖新改动，停止自动恢复');}
  for(const f of files)writeAtomic(path.join(base,f),fs.readFileSync(path.join(backup,f)));
  fs.renameSync(path.join(backup,'manifest.json'),path.join(backup,'manifest.restored.json'));
  console.log('PASS: 已恢复补丁安装前版本；账号和考试数据不变');
}
try{
 const op=process.argv[2];if(op==='apply')apply();else if(op==='restore')restore();else if(op==='check'){const s=fs.readFileSync(path.join(base,'school-api.js'),'utf8');console.log(s.includes(marker)?'补丁已安装':'等待安装');}else throw Error('用法: bun patch-password-policy.js apply|restore|check');
}catch(err){console.error('ERROR: '+err.message);process.exitCode=1;}
