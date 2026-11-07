'use strict';
// Non-destructive Quizzle 2.6.3 school-wide branding patch.
// Uses the application's native /api/branding image files. No rebuilding frontend.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.env.QUIZZLE_ROOT||'/quizzle';
const pack=path.join(ROOT,'data','school-brand-package');
const backup=path.join(ROOT,'data','.school_brand_v1_backup');
const manifest=path.join(backup,'manifest.json');
const mark='<!-- SCHOOL_BRAND_PATCH_V1 -->';
const school='育才实验学校';
const schoolName='育才实验学校 · 校园测评中心';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const rel=(s)=>path.join(ROOT,s);
function exists(f){return fs.existsSync(f)&&fs.statSync(f).isFile()}
function atomicPut(file,buf){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.brandtmp'+crypto.randomBytes(4).toString('hex');try{fs.writeFileSync(tmp,buf);fs.renameSync(tmp,file)}catch(e){if(fs.existsSync(tmp))fs.unlinkSync(tmp);throw e}}
const inputs=[rel('data/branding/logo.png'),rel('data/branding/title.png'),rel('data/branding/branding.json'),rel('dist/index.html'),rel('data/school-package/student.html'),rel('data/school-package/admin.html')];
function inputCheck(){
 for(const file of inputs)if(!exists(file))throw Error('Required installed file missing; no changes made: '+file);
 for(const f of ['school-icon.png','school-title.png'])if(!exists(path.join(pack,f)))throw Error('Missing asset in installation package: '+f);
 const brand=JSON.parse(fs.readFileSync(inputs[2],'utf8'));
 if(typeof brand.name!=='string' || typeof brand.color!=='string')throw Error('Unexpected native branding data format');
 const homepage=fs.readFileSync(inputs[3],'utf8');
 if(!homepage.includes('</head>')||!homepage.includes('</body>'))throw Error('Homepage HTML format not recognized');
 for(const p of inputs.slice(4)){const s=fs.readFileSync(p,'utf8');if(!s.includes('<div class="brand">') || !s.includes('</head>'))throw Error('School page HTML format not recognized: '+p)}
 const title=fs.readFileSync(path.join(pack,'school-title.png'));
 const logo=fs.readFileSync(path.join(pack,'school-icon.png'));
 if(!title.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))||!logo.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))throw Error('School logo images must be PNG');
}
function schoolPage(s,kind){
 if(s.includes(mark))throw Error('Detected partial school branding patch');
 const subtitle=kind==='student'?'学生测评中心':kind==='admin'?'教师管理中心':'本班成绩';
 // Original school HTML has a plain-text .brand div, so replace only that element.
 const r=/<div class="brand">[^<>]*<\/div>/;
 if(!r.test(s))throw Error('Unexpected school page logo markup');
 const brand=`<div class="brand school-ident"><img class="school-ident-image" src="/assets/images/school-title.png" alt="育才实验学校"/><span class="school-ident-sub">${subtitle}</span></div>`;
 s=s.replace(r,brand);
 s=s.replace(/<title>[^<]*<\/title>/,`<title>${schoolName} · ${subtitle}</title>`);
 // Keep CSS small and specific: avoid changing account forms, class filters, and buttons.
 const css=`${mark}\n<style>.school-ident{display:flex;align-items:center;gap:12px;flex-wrap:wrap;letter-spacing:0}.school-ident-image{display:block;width:210px;max-width:46vw;height:auto;object-fit:contain}.school-ident-sub{font-size:17px;font-weight:800;color:#3f3657;white-space:nowrap}@media(max-width:700px){.school-ident-image{width:145px}.school-ident-sub{font-size:13px}.nav{flex-wrap:wrap}}</style>\n<link rel="icon" type="image/png" href="/assets/images/school-icon.png"/>\n`;
 s=s.replace('</head>',css+'</head>');
 // Navigation labels change only; keep their href targets untouched.
 s=s.replaceAll('返回Quizzle','返回测验首页').replaceAll('Quizzle 教师首页','返回测验首页');
 return Buffer.from(s,'utf8');
}
function getTargets(){
 inputCheck();
 const B=f=>fs.readFileSync(f);
 const newLogo=B(path.join(pack,'school-icon.png'));
 const newTitle=B(path.join(pack,'school-title.png'));
 const base=JSON.parse(B(rel('data/branding/branding.json')).toString('utf8'));
 base.name=schoolName;
 const homepagePath=rel('dist/index.html');
 let homepage=B(homepagePath).toString('utf8');
 if(homepage.includes(mark))throw Error('Detected partial homepage branding patch');
 homepage=homepage.replace(/<title>[^<]*<\/title>/,`<title>${schoolName}</title>`);
 homepage=homepage.replace('</head>',`${mark}\n<link rel="icon" type="image/png" href="/assets/images/school-icon.png"/>\n</head>`);
 const changes=new Map([
  [rel('data/branding/logo.png'),newLogo],
  [rel('data/branding/title.png'),newTitle],
  [rel('data/branding/branding.json'),Buffer.from(JSON.stringify(base,null,2)+'\n')],
  [rel('content/logo.png'),newLogo],
  [rel('content/title.png'),newTitle],
  [rel('dist/assets/images/logo.png'),newLogo],
  [rel('dist/assets/images/school-icon.png'),newLogo],
  [rel('dist/assets/images/school-title.png'),newTitle],
  [homepagePath,Buffer.from(homepage)],
  [rel('data/school-package/student.html'),schoolPage(B(rel('data/school-package/student.html')).toString('utf8'),'student')],
  [rel('data/school-package/admin.html'),schoolPage(B(rel('data/school-package/admin.html')).toString('utf8'),'admin')]
 ]);
 const resultsPath=rel('data/school-roles-package/teacher-results.html');
 if(exists(resultsPath))changes.set(resultsPath,schoolPage(B(resultsPath).toString('utf8'),'results'));
 return changes;
}
function verification(){
 if(!exists(manifest))return false;
 const m=JSON.parse(fs.readFileSync(manifest,'utf8'));
 if(!m.items || !Array.isArray(m.items))throw Error('Backup manifest is invalid');
 for(const i of m.items){let f=rel(i.relative);if(!exists(f)||sha(fs.readFileSync(f))!==i.newHash)throw Error('Installed branding file modified after install; stop for review: '+i.relative)}
 console.log('PASS: school logo installed; all patched files intact');
 return true;
}
function check(){if(verification())return;getTargets();console.log('PASS: native branding and installed school pages are compatible');console.log('PASS: no accounts, passwords, permissions, quizzes or scores targeted');}
function apply(){if(verification()){console.log('ALREADY INSTALLED');return;}
 if(exists(manifest))throw Error('Found unexpected prior backup; no changes made');
 const changes=getTargets();const items=[];
 for(const [file,value] of changes){const old=exists(file)?fs.readFileSync(file):null;items.push({relative:path.relative(ROOT,file),existed:old!==null,oldHash:old?sha(old):null,newHash:sha(value)});}
 fs.mkdirSync(backup,{recursive:true});
 for(let n=0;n<items.length;n++)if(items[n].existed)fs.writeFileSync(path.join(backup,'original-'+n+'.bin'),fs.readFileSync(rel(items[n].relative)),{flag:'wx'});
 // Reserve manifest only after all backup copies exist.
 const m={version:1,created:new Date().toISOString(),school,items};
 fs.writeFileSync(manifest,JSON.stringify(m,null,2),{flag:'wx'});
 const written=[];
 try{for(const [file,value] of changes){atomicPut(file,value);written.push(file)}}catch(e){
  for(let j=written.length-1;j>=0;j--){const index=items.findIndex(x=>rel(x.relative)===written[j]);if(items[index].existed)atomicPut(written[j],fs.readFileSync(path.join(backup,'original-'+index+'.bin')));else fs.unlinkSync(written[j]);}
  // Keep the manifest after rollback for audit and manual review.
  fs.renameSync(manifest,path.join(backup,'manifest.failed.json'));
  throw e;
 }
 verification(); console.log('PASS: native frontend banner, favicon, teacher and student header branding updated');
 console.log('PASS: all school accounts, quizzes, teacher permissions and scores preserved');
}
function restore(){if(!exists(manifest))throw Error('No active branding patch to restore');verification();const m=JSON.parse(fs.readFileSync(manifest,'utf8'));
 for(let n=0;n<m.items.length;n++){const i=m.items[n];if(i.existed){const b=fs.readFileSync(path.join(backup,'original-'+n+'.bin'));if(sha(b)!==i.oldHash)throw Error('Stored backup integrity failure: '+i.relative)}}
 for(let n=0;n<m.items.length;n++){const i=m.items[n],f=rel(i.relative);if(i.existed)atomicPut(f,fs.readFileSync(path.join(backup,'original-'+n+'.bin')));else if(exists(f))fs.unlinkSync(f)}
 fs.renameSync(manifest,path.join(backup,'manifest.restored.json'));
 console.log('RESTORE COMPLETE: previous branding assets and HTML restored');
}
try{const action=process.argv[2];if(action==='check')check();else if(action==='apply')apply();else if(action==='restore')restore();else throw Error('Usage: school-brand.js check|apply|restore');}
catch(err){console.error('ERROR: '+err.message);process.exitCode=1;}
