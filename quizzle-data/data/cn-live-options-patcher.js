/* Quizzle 2.6.3 - Chinese answer labels on live student screens.
 * Offline in-place patch; backups stored in persistent /quizzle/data.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = process.env.QUIZZLE_ROOT || '/quizzle';
const backup = path.join(root, 'data', '.cn_live_options_v1_backup');
const manifestFile = path.join(backup, 'manifest.json');
const mode = process.argv[2] || 'check';
const paths = {
  socket: path.join(root, 'server', 'socket.js'),
  entry: path.join(root, 'server', 'index.js'),
  html: path.join(root, 'dist', 'index.html'),
  script: path.join(root, 'dist', 'cn-live-options.js')
};
const marker = '/* QUIZZLE_CN_LIVE_OPTIONS_V1 */';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function requireFile(p) { if (!fs.existsSync(p)) throw Error('未找到：' + p); return fs.readFileSync(p, 'utf8'); }
const socketAddition = `
${marker}
// Only verified room members may request choice labels; never return is_correct.
module.exports.getCnLiveOptions = (sessionId) => {
    if (typeof sessionId !== 'string' || sessionId.length > 160) return null;
    const session = getSession(sessionId);
    if (!session || !session.roomCode) return null;
    const room = rooms[session.roomCode];
    if (!room || room.state !== 'ingame' || !room.currentQuestion || room.currentQuestion.isCompleted) return null;
    const last = room.questionHistory[room.questionHistory.length - 1];
    if (!last || !['multiple-choice', 'single', 'multiple'].includes(last.type) || !Array.isArray(last.answers)) return null;
    return {
        title: String(last.title || ''),
        choices: last.answers.map(a => ({
            type: a?.type === 'image' ? 'image' : 'text',
            content: typeof a?.content === 'string' ? a.content : ''
        }))
    };
};
`;
const apiAddition = `
${marker}
// Student-only question choices (without correct-answer flags).
app.get('/api/cn-live-options', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = req.get('X-Quizzle-Session');
    if (!id || typeof id !== 'string' || id.length > 160) return res.sendStatus(401);
    try {
        const value = require('./socket').getCnLiveOptions(id);
        return value ? res.json(value) : res.sendStatus(204);
    } catch (err) {
        console.error('CN live options:', err);
        return res.sendStatus(500);
    }
});
`;
const scriptTag = '<script src="/cn-live-options.js" defer></script>';
function getPlan(){
  const socket=requireFile(paths.socket), entry=requireFile(paths.entry), html=requireFile(paths.html);
  const client=requireFile(path.join(__dirname,'cn-live-options.js'));
  if (!socket.includes('const rooms = {};') || !socket.includes('const {') || !socket.includes('getSession,') || !socket.includes('module.exports = (io, socket)')) throw Error('当前 socket.js 结构与 Quizzle 2.6.3 不符');
  if (!entry.includes('app.use("/api/quizzes"') || !entry.includes("if (process.env.NODE_ENV === 'production')")) throw Error('当前 index.js 结构与 Quizzle 2.6.3 不符');
  if (!html.includes('</head>')) throw Error('网页首页结构不符');
  const state = [socket.includes(marker), entry.includes(marker), html.includes(scriptTag)];
  if (state.some(Boolean) && !state.every(Boolean)) throw Error('检测到部分安装状态，停止安装，请先恢复或发送截图');
  if (state.every(Boolean)) return {installed: true};
  return {installed:false, files:[
    {target:paths.socket, updated:socket+socketAddition},
    {target:paths.entry, updated:entry.replace("if (process.env.NODE_ENV === 'production')",apiAddition+"\nif (process.env.NODE_ENV === 'production')")},
    {target:paths.html, updated:html.replace('</head>','    '+scriptTag+'\n  </head>')},
    {target:paths.script, updated:client}
  ]};
}
function apply(){
  if (fs.existsSync(manifestFile)) throw Error('发现此前的备份，请不要重复安装；如需恢复先运行恢复脚本。');
  const plan=getPlan();
  if(plan.installed){ console.log('已安装本补丁，无需重复操作。'); return; }
  fs.mkdirSync(backup,{recursive:true});
  const manifest={kind:'Quizzle-2.6.3-cn-live-options-v1',files:[]};
  for(let i=0;i<plan.files.length;i++){
    const item=plan.files[i], before=fs.existsSync(item.target)?fs.readFileSync(item.target):null;
    const bname='backup_'+i;
    if(before!==null)fs.writeFileSync(path.join(backup,bname),before);
    manifest.files.push({rel:path.relative(root,item.target),backup:bname,existed:before!==null,sha:before&&sha(before)});
  }
  fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2));
  try {
    for(const item of plan.files){ const temp=item.target+'.live-cn-tmp';fs.writeFileSync(temp,item.updated,'utf8');fs.renameSync(temp,item.target); }
    console.log('PASS: 服务器试题接口、学生端答案显示脚本、网页入口已更新。');
  } catch(err){
    restore(); throw err;
  }
}
function restore(){
  if(!fs.existsSync(manifestFile)) throw Error('没有找到本补丁备份，不允许盲目恢复。');
  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  if(manifest.kind!=='Quizzle-2.6.3-cn-live-options-v1') throw Error('备份标识不一致');
  for(const item of manifest.files){
    const target=path.resolve(root,item.rel);
    if(!target.startsWith(path.resolve(root)+path.sep)) throw Error('非法恢复路径');
    if(item.existed){const buf=fs.readFileSync(path.join(backup,item.backup));if(sha(buf)!==item.sha)throw Error('备份校验失败：'+item.rel);fs.writeFileSync(target,buf);}
    else if(fs.existsSync(target))fs.unlinkSync(target);
  }
  fs.rmSync(backup,{recursive:true,force:true});
  console.log('PASS: 本次显示答案文字补丁已恢复，之前的中文姓名补丁和汉化文件未改变。');
}
try {
 if(mode==='check') { const p=getPlan();console.log(p.installed?'已安装':'PASS: 文件结构检查通过，可安装'); }
 else if(mode==='apply') apply();
 else if(mode==='restore') restore();
 else throw Error('参数只能是 check/apply/restore');
}catch(err){console.error('ERROR:',err.message);process.exit(1)}
