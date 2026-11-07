/* Quizzle 2.6.3 CN monitor offline patcher - in-place, reversible, no container rebuild. */
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=process.env.QUIZZLE_ROOT || '/quizzle';
const datadir=process.env.QUIZZLE_DATA_ROOT || path.join(root,'data');
const backup=path.join(datadir,'.cn_progress_v1_backup');
const manifestPath=path.join(backup,'manifest.json');
const task=process.argv[2]||'check';
const specs=[
 {src:'cn-progress.js',dest:path.join(root,'dist','cn-progress.js')},
 {src:'cn-ui-extra.js',dest:path.join(root,'dist','cn-ui-extra.js')}
];
const htmlPath=path.join(root,'dist','index.html');
const tags=['<script src="/cn-ui-extra.js" defer></script>','<script src="/cn-progress.js" defer></script>'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=f=>fs.readFileSync(f);
function writeAtomic(f,buf){const tmp=f+'.cn-monitor-temporary';fs.writeFileSync(tmp,buf);fs.renameSync(tmp,f);}
function plan(){
 if(!fs.existsSync(htmlPath))throw Error('缺少网站首页，请确认容器为 Quizzle 2.6.3。');
 const html=read(htmlPath).toString('utf8');
 if(!html.includes('</head>'))throw Error('与当前页面格式不兼容：没有 </head>。');
 if(!html.includes('zh-cn.js'))throw Error('未检测到原有中文界面补丁，本升级需要在中文版上安装。');
 if(!html.includes('cn-live-options.js'))throw Error('未检测到学生端文字选项补丁，请先确认它仍然正常。');
 for(const f of specs)if(!fs.existsSync(path.join(__dirname,f.src)))throw Error('缺少安装文件 '+f.src);
 const presence=tags.map(t=>html.includes(t));
 if(presence.some(Boolean)&&!presence.every(Boolean))throw Error('检测到部分安装，请勿继续覆盖。');
 if(presence.every(Boolean)){
   if(!specs.every(s=>fs.existsSync(s.dest)))throw Error('首页有监控脚本但文件缺失，请截图反馈。');
   return {installed:true};
 }
 const extra=tags.map(t=>'    '+t).join('\n');
 const out=html.replace('</head>',extra+'\n  </head>');
 return {installed:false,files:[
  ...specs.map(s=>({target:s.dest,after:read(path.join(__dirname,s.src))})),
  {target:htmlPath,after:Buffer.from(out,'utf8')}
 ]};
}
function apply(){
 const p=plan();
 if(p.installed){console.log('已安装过本补丁，无需重复安装。');return;}
 if(fs.existsSync(manifestPath))throw Error('存在之前安装的备份，请先检查当前状态，不允许重复覆盖。');
 const entries=[];
 fs.mkdirSync(backup,{recursive:true});
 for(let i=0;i<p.files.length;i++){
  const f=p.files[i], existed=fs.existsSync(f.target), before=existed?read(f.target):null;
  if(existed)fs.writeFileSync(path.join(backup,'original-'+i+'.bin'),before);
  entries.push({rel:path.relative(root,f.target),existed,original:'original-'+i+'.bin',shaBefore:before?hash(before):null,shaAfter:hash(f.after)});
 }
 const manifest={kind:'quizzle-cn-progress-v1',version:'2.6.3',at:new Date().toISOString(),entries};
 fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
 try {
  for(const f of p.files)writeAtomic(f.target,f.after);
  console.log('PASS: 已添加教师成绩自动刷新看板和中文补漏脚本；旧中文姓名、答案文字脚本未修改。');
  console.log('PASS: 全部修改保留原文件备份。');
 }catch(err){try{restore(true);}catch(e){console.error('自动恢复遇到问题：',e.message);}throw err;}
}
function restore(force=false){
 if(!fs.existsSync(manifestPath))throw Error('未找到本补丁备份。');
 const man=JSON.parse(read(manifestPath));
 if(man.kind!=='quizzle-cn-progress-v1')throw Error('补丁备份版本不符。');
 for(const f of man.entries){
  const target=path.resolve(root,f.rel);
  if(!target.startsWith(path.resolve(root)+path.sep))throw Error('拒绝非法恢复路径：'+f.rel);
  if(!force && fs.existsSync(target) && hash(read(target))!==f.shaAfter)throw Error('文件在升级后又被其他程序修改，请勿覆盖：'+f.rel);
  if(f.existed){const original=read(path.join(backup,f.original));if(hash(original)!==f.shaBefore)throw Error('原始备份校验失败：'+f.rel);}
 }
 for(const f of man.entries){
  const target=path.resolve(root,f.rel);
  if(f.existed)writeAtomic(target,read(path.join(backup,f.original)));
  else if(fs.existsSync(target))fs.unlinkSync(target);
 }
 fs.rmSync(backup,{recursive:true,force:true});
 console.log('PASS: 恢复了安装前的首页和文件；其他中文补丁未改变。');
}
try{
 if(task==='check'){const p=plan();console.log(p.installed?'已安装。':'PASS: 兼容 Quizzle 中文版，已确认原中文界面和选项补丁存在；可以安全安装。');}
 else if(task==='apply')apply();
 else if(task==='restore')restore();
 else throw Error('参数只能为 check / apply / restore');
}catch(err){console.error('ERROR:',err.message);process.exit(1);}
