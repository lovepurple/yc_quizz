'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT=process.env.QUIZZLE_ROOT||'/quizzle';
const serverFile=path.join(ROOT,'server','index.js');
const homepage=path.join(ROOT,'dist','index.html');
const pkg=path.join(ROOT,'data','one-site-package');
const backup=path.join(ROOT,'data','.one_site_v2_backup');
const manifest=path.join(backup,'manifest.json');
const marker='/* QUIZZLE_TEACHER_SINGLE_SITE_V2 */';
const htmlMarker='<!-- QUIZZLE_TEACHER_SINGLE_SITE_V2 -->';
const anchor="app.use('/school',require('../data/school-roles-package/scope-pages')(express));";
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const files=[serverFile,homepage];
function atomicallyWrite(file,data){const tmp=file+'.one-site-'+crypto.randomBytes(4).toString('hex');try{fs.writeFileSync(tmp,data);fs.renameSync(tmp,file);}catch(e){if(fs.existsSync(tmp))fs.unlinkSync(tmp);throw e;}}
function validatePackage(){for(const f of ['teacher-routes.js','teacher-nav.js'])if(!fs.existsSync(path.join(pkg,f)))throw Error('Patch component missing: '+f);}
function transform(current){
 const server=current[0].toString('utf8'); const html=current[1].toString('utf8');
 if(!server.includes('/* SCHOOL_CLASS_SCOPE_V1 */') || !server.includes('/* QUIZZLE_SCHOOL_ACCOUNTS_V1 */'))throw Error('Existing school account/class permission patches not found');
 if(server.includes('QUIZZLE_SCHOOL_TEACHER_ENTRY_V1'))throw Error('Older teacher quick-entry version detected. Stop and request a migration patch.');
 if(server.split(anchor).length!==2)throw Error('School routes differ from tested layout. Stopping safely.');
 if(html.split('</body>').length!==2)throw Error('Home HTML differs from tested layout. Stopping safely.');
 if(server.includes(marker)||html.includes(htmlMarker))throw Error('Partial patch marker detected. Stop for review.');
 const patchedServer=server.replace(anchor,`${marker}\napp.use('/school',require('../data/one-site-package/teacher-routes')(express));\n${anchor}`);
 const patchedHtml=html.replace('</body>', `${htmlMarker}\n<script defer src="/school/teacher-nav.js"></script>\n</body>`);
 return [Buffer.from(patchedServer,'utf8'),Buffer.from(patchedHtml,'utf8')];
}
function check(){validatePackage();const contents=files.map(f=>fs.readFileSync(f));const hasS=contents[0].toString('utf8').includes(marker),hasH=contents[1].toString('utf8').includes(htmlMarker);
 if(hasS||hasH){
  if(!hasS||!hasH||!fs.existsSync(manifest))throw Error('Partial installation; stop');
  const m=JSON.parse(fs.readFileSync(manifest,'utf8'));
  if(files.some((f,i)=>m.files[i]!==f||hash(contents[i])!==m.patched[i]))throw Error('Installed files changed since installation; manual review required');
  console.log('PASS: One-site navigation already installed and intact');return;
 }
 transform(contents);console.log('PASS: Compatible with existing Quizzle school login and teacher permissions');
}
function apply(){validatePackage(); const orig=files.map(f=>fs.readFileSync(f));const hasS=orig[0].toString().includes(marker),hasH=orig[1].toString().includes(htmlMarker);
 if(hasS||hasH){check();console.log('ALREADY INSTALLED');return;}
 if(fs.existsSync(manifest))throw Error('Old manifest exists. Stopping to protect saved data.');
 const updated=transform(orig);
 fs.mkdirSync(backup,{recursive:true});
 orig.forEach((data,i)=>fs.writeFileSync(path.join(backup,'original-'+i),data,{flag:'wx'}));
 const m={version:2,files,original:orig.map(hash),patched:updated.map(hash),created:new Date().toISOString()};
 fs.writeFileSync(manifest,JSON.stringify(m,null,2),{flag:'wx'});
 let done=0;
 try{for(let i=0;i<files.length;i++){atomicallyWrite(files[i],updated[i]);done++;}}
 catch(e){for(let i=0;i<done;i++)atomicallyWrite(files[i],orig[i]);throw e;}
 check();console.log('PASS: logged-in teacher management button alongside original Create/Host buttons');
 console.log('PASS: /school/admin sends unauthenticated teachers to original single-site login');
 console.log('PASS: school accounts, teacher permissions, cookies, quizzes and scores untouched');
}
function restore(){if(!fs.existsSync(manifest))throw Error('No backup manifest found');const m=JSON.parse(fs.readFileSync(manifest,'utf8'));
 if(files.some((f,i)=>m.files[i]!==f||hash(fs.readFileSync(f))!==m.patched[i]))throw Error('Live files changed since this patch; refusing to overwrite newer changes');
 for(let i=0;i<files.length;i++){const b=fs.readFileSync(path.join(backup,'original-'+i));if(hash(b)!==m.original[i])throw Error('Backup hash mismatch');}
 for(let i=0;i<files.length;i++)atomicallyWrite(files[i],fs.readFileSync(path.join(backup,'original-'+i)));
 fs.renameSync(manifest,path.join(backup,'manifest.restored.json'));console.log('RESTORE COMPLETE: previous home and teacher routes restored');
}
try{const cmd=process.argv[2];if(cmd==='check')check();else if(cmd==='apply')apply();else if(cmd==='restore')restore();else throw Error('Usage: install-one-site.js check|apply|restore');}
catch(e){console.error('ERROR: '+e.message);process.exitCode=1;}
