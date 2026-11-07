'use strict';
/* Safe, reversible installer for the Quizzle school question-bank addon. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = process.env.QUIZZLE_ROOT || '/quizzle';
const DATA = process.env.QUIZZLE_DATA_ROOT || path.join(ROOT, 'data');
const PKG = __dirname;
const SERVER = path.join(ROOT, 'server', 'index.js');
const ADMIN = path.join(DATA, 'school-package', 'admin.html');
const BACKUP = path.join(DATA, '.question_bank_v1_backup');
const MANIFEST = path.join(BACKUP, 'manifest.json');
const MARKER = '/* QUIZZLE_QUESTION_BANK_V1 */';
const ROUTES = `${MARKER}\napp.use('/api/question-bank', require('../data/question-bank-package/question-bank-api')(express));\napp.use('/school/question-bank', require('../data/question-bank-package/question-bank-pages')(express));`;
const ADMIN_MARKER = '<!-- QUIZZLE_QUESTION_BANK_ENTRY_V1 -->';
const ADMIN_CARD = `${ADMIN_MARKER}\n<div class="card adminCard" id="questionBankEntry" style="border:1px solid #ded8fa;background:linear-gradient(120deg,#fbfaff,#f4f1ff);"><div class="section-head"><div><h2>④ 题库管理与智能组卷</h2><p class="subtitle">按教材原题、学科网、练习册和教师题库分类归档；按难度、知识点和来源比例自动抽题。</p></div><a class="primary" href="/school/question-bank" style="display:inline-block;text-decoration:none;padding:11px 17px;border-radius:10px;white-space:nowrap">打开智能题库 →</a></div></div>`;
const REQUIRED = ['question-bank-api.js', 'question-bank-pages.js', 'question-bank.html', 'question-bank.css', 'question-bank.js'];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const read = file => fs.readFileSync(file);
function writeAtomic(file, value) {
  const temp = file + '.question-bank-' + crypto.randomBytes(4).toString('hex') + '.tmp';
  fs.writeFileSync(temp, value);
  fs.renameSync(temp, file);
}
function replaceExactlyOnce(source, before, after, label) {
  const pieces = source.split(before);
  if (pieces.length !== 2) throw new Error(label + '定位失败（需要且只能找到一次），未修改系统文件。');
  return source.replace(before, after);
}
function plan() {
  for (const file of REQUIRED) if (!fs.existsSync(path.join(PKG, file))) throw new Error('升级包缺少文件：' + file);
  for (const file of [SERVER, ADMIN]) if (!fs.existsSync(file)) throw new Error('找不到当前系统文件：' + file);
  const server = read(SERVER).toString('utf8');
  const admin = read(ADMIN).toString('utf8');
  if (!server.includes("app.use('/api/school-import'")) throw new Error('未检测到当前 Word/Excel 导题模块，停止安装以保护现有系统。');
  if (!server.includes("app.use('/api/school',require('../data/school-roles-package/scope-api')(express));")) throw new Error('未检测到教师班级权限模块，停止安装。');
  if (!admin.includes('<div id="adminError" class="note hidden"></div>')) throw new Error('教师管理页面版本不匹配，未修改任何文件。');
  const serverHas = server.includes(MARKER);
  const adminHas = admin.includes(ADMIN_MARKER);
  if (serverHas || adminHas) {
    if (serverHas && adminHas && server.includes(ROUTES) && admin.includes(ADMIN_CARD)) return { installed: true };
    throw new Error('检测到题库功能曾部分安装或文件被后续修改。为避免覆盖现有改动，请先截图反馈，不要重复安装。');
  }
  const anchor = "io.on('connection', (socket) => require(\"./socket\")(io, socket));";
  const nextServer = replaceExactlyOnce(server, anchor, ROUTES + '\n\n' + anchor, '服务器路由入口');
  const adminAnchor = '<div id="adminError" class="note hidden"></div>';
  const nextAdmin = replaceExactlyOnce(admin, adminAnchor, adminAnchor + '\n' + ADMIN_CARD, '教师管理页面入口');
  return { installed: false, files: [
    { target: SERVER, relative: 'server/index.js', before: Buffer.from(server), after: Buffer.from(nextServer) },
    { target: ADMIN, relative: 'data/school-package/admin.html', before: Buffer.from(admin), after: Buffer.from(nextAdmin) }
  ] };
}
function check() {
  const result = plan();
  if (result.installed) console.log('PASS：题库与自动组卷功能已经安装，无需重复操作。');
  else console.log('PASS：已确认 Quizzle 2.6.3 中文版、Word/Excel 导题和教师班级权限兼容；安装只修改服务器路由和教师管理页，题库数据将单独写入数据卷。');
}
function apply() {
  const result = plan();
  if (result.installed) { console.log('PASS：题库功能已安装。'); return; }
  if (fs.existsSync(MANIFEST)) throw new Error('检测到已有题库升级备份，请先检查当前状态，不重复覆盖。');
  if (fs.existsSync(BACKUP) && fs.readdirSync(BACKUP).length) throw new Error('题库备份目录已存在但没有有效清单，请先截图检查。');
  fs.mkdirSync(BACKUP, { recursive: true });
  const entries = result.files.map((item, index) => {
    const save = index === 0 ? 'server-index.before.js' : 'admin.before.html';
    fs.writeFileSync(path.join(BACKUP, save), item.before, { flag: 'wx' });
    return { relative: item.relative, save, beforeHash: hash(item.before), afterHash: hash(item.after) };
  });
  fs.writeFileSync(MANIFEST, JSON.stringify({ kind: 'quizzle-question-bank-v1', version: '1.0.0', createdAt: new Date().toISOString(), entries }, null, 2), { flag: 'wx' });
  const changed = [];
  try {
    for (const item of result.files) { writeAtomic(item.target, item.after); changed.push(item); }
    console.log('PASS：题库 API、管理页面和教师后台入口已安装。');
    console.log('PASS：原有学生账号、教师权限、测验、成绩、Word/Excel 导题文件均未覆盖。');
    console.log('PASS：回滚备份已保存到 ' + BACKUP);
  } catch (error) {
    for (const item of changed.reverse()) writeAtomic(item.target, item.before);
    throw error;
  }
}
function restore() {
  if (!fs.existsSync(MANIFEST)) throw new Error('没有找到题库升级备份，不能执行恢复。');
  const manifest = JSON.parse(read(MANIFEST).toString('utf8'));
  if (manifest.kind !== 'quizzle-question-bank-v1' || !Array.isArray(manifest.entries)) throw new Error('备份清单版本不匹配。');
  const files = manifest.entries.map(item => {
    const target = path.resolve(ROOT, item.relative);
    if (!target.startsWith(path.resolve(ROOT) + path.sep)) throw new Error('拒绝非法恢复路径：' + item.relative);
    const current = read(target);
    if (hash(current) !== item.afterHash) throw new Error('文件已被后续升级修改，拒绝自动覆盖：' + item.relative);
    const original = read(path.join(BACKUP, item.save));
    if (hash(original) !== item.beforeHash) throw new Error('原始备份校验失败：' + item.relative);
    return { target, original };
  });
  for (const item of files) writeAtomic(item.target, item.original);
  fs.renameSync(MANIFEST, path.join(BACKUP, 'manifest.restored.json'));
  console.log('PASS：已恢复服务器路由和教师管理页。题库 questions.json 与媒体文件保留，不会自动删除。');
}
try {
  const task = process.argv[2] || 'check';
  if (task === 'check') check();
  else if (task === 'apply') apply();
  else if (task === 'restore') restore();
  else throw new Error('参数只能是 check / apply / restore');
} catch (error) {
  console.error('ERROR：' + error.message);
  process.exitCode = 1;
}
