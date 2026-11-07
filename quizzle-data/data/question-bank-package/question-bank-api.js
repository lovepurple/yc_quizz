'use strict';
/* QUIZZLE_QUESTION_BANK_V1
 * Offline question bank + weighted source sampling for Quizzle 2.6.3.
 * All persistent data lives in /quizzle/data/question-bank on the existing volume.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.env.QUIZZLE_ROOT || '/quizzle';
const DATA = path.join(ROOT, 'data');
const BANK = path.join(DATA, 'question-bank');
const DB_FILE = path.join(BANK, 'questions.json');
const MEDIA_DIR = path.join(BANK, 'media');
const SCHOOL = path.join(DATA, 'school-accounts');
const GRANTS_FILE = path.join(SCHOOL, 'teacher-classes.json');
const CLASSES_FILE = path.join(SCHOOL, 'classes.json');
const ASSIGNMENTS_FILE = path.join(SCHOOL, 'assignments.json');
const PRACTICE_DIR = path.join(DATA, 'practice-quizzes');
const SOURCES = ['教材原题', '学科网', '练习册', '教师题库'];
const DEFAULT_RATIOS = { '教材原题': 10, '学科网': 20, '练习册': 35, '教师题库': 35 };
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const DIFFICULTY_NAMES = { easy: '简单', medium: '中等', hard: '困难' };
const { extractToken } = require(path.join(ROOT, 'server', 'middleware', 'auth'));
const { validateToken } = require(path.join(ROOT, 'server', 'utils', 'auth'));
const { compressQuiz } = require(path.join(ROOT, 'server', 'utils', 'quiz'));

function mkdir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
function writeJson(file, value) {
  mkdir(path.dirname(file));
  const temp = file + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temp, file);
}
function db() {
  mkdir(BANK); mkdir(MEDIA_DIR);
  const value = readJson(DB_FILE, { version: 1, questions: [] });
  if (!value || !Array.isArray(value.questions)) throw new Error('题库数据文件格式异常，请先备份后检查 questions.json');
  return value;
}
function fail(res, status, message, extra) { return res.status(status).json({ message, ...(extra || {}) }); }
function auth(req, res, next) {
  const token = extractToken(req);
  const user = validateToken(token);
  if (!user || !['admin', 'teacher'].includes(user.role)) return fail(res, 401, '请先在测验首页登录教师或管理员账号');
  req.qbUser = user;
  next();
}
function requestGuard(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin) {
      try { if (new URL(origin).host !== req.headers.host) return fail(res, 403, '请求来源校验失败'); }
      catch (_) { return fail(res, 403, '请求来源无效'); }
    }
    if (req.method !== 'DELETE' && !req.is('application/json')) return fail(res, 415, '请使用JSON请求');
    if (req.method === 'DELETE' && Number(req.headers['content-length'] || 0) > 0 && !req.is('application/json')) return fail(res, 415, '请使用JSON请求');
  }
  next();
}
function handler(fn) {
  return (req, res, next) => {
    try {
      const result = fn(req, res, next);
      if (result && typeof result.catch === 'function') result.catch(error => {
        console.error('[question-bank]', error);
        if (!res.headersSent) fail(res, 500, '题库操作失败，请查看Docker日志');
      });
    } catch (error) {
      console.error('[question-bank]', error);
      if (!res.headersSent) fail(res, error.status || 400, error.status ? error.message : (error.message || '题库操作失败'));
    }
  };
}
function grants() { const value = readJson(GRANTS_FILE, { grants: {} }); return value && value.grants || {}; }
function classCatalogue() { const value = readJson(CLASSES_FILE, { classes: [] }); return Array.isArray(value.classes) ? value.classes : []; }
function allowedClasses(user) {
  if (user.role === 'admin') return classCatalogue().filter(item => item.active !== false).map(item => item.name).sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
  return (grants()[user.id] || []).filter(name => classCatalogue().some(item => item.name === name && item.active !== false));
}
function canUseClass(user, className) {
  if (!className) return user.role === 'admin';
  return user.role === 'admin' || allowedClasses(user).includes(className);
}
function canAccess(user, question) { return user.role === 'admin' || question.ownerId === user.id; }
function visibleQuestions(user) { return db().questions.filter(question => canAccess(user, question)); }
function cleanString(value, max, label, required = true) {
  const result = String(value == null ? '' : value).trim();
  if (required && !result) throw Object.assign(new Error(label + '不能为空'), { status: 400 });
  if (result.length > max) throw Object.assign(new Error(label + '不能超过' + max + '个字符'), { status: 400 });
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(result)) throw Object.assign(new Error(label + '包含非法字符'), { status: 400 });
  return result;
}
function listValue(value, label, maxItems, maxLength) {
  const input = Array.isArray(value) ? value : String(value == null ? '' : value).split(/[，,、;；\n]/);
  const list = [...new Set(input.map(item => String(item == null ? '' : item).trim()).filter(Boolean))];
  if (!list.length) throw Object.assign(new Error(label + '至少填写一项'), { status: 400 });
  if (list.length > maxItems || list.some(item => item.length > maxLength || /[\x00-\x1f]/.test(item))) {
    throw Object.assign(new Error(label + '数量或长度不符合要求'), { status: 400 });
  }
  return list;
}
function mediaExtension(mime) {
  return ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/ogg': 'ogg', 'video/quicktime': 'mov' })[mime] || 'bin';
}
function parseMedia(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length > 8) throw Object.assign(new Error('每道题最多包含8个图片或视频对象'), { status: 400 });
  let total = 0;
  return list.map(item => {
    const data = String(item && item.data || '');
    const match = data.match(/^data:(image\/(?:png|jpeg|jpg|gif|webp|svg\+xml)|video\/(?:mp4|webm|ogg|quicktime));base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) throw Object.assign(new Error('题目媒体编码无效，请重新导入原文件'), { status: 400 });
    const mime = match[1].toLowerCase();
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length || buffer.length > 8 * 1024 * 1024) throw Object.assign(new Error('单个媒体文件为空或超过8MB'), { status: 400 });
    total += buffer.length;
    if (total > 20 * 1024 * 1024) throw Object.assign(new Error('单道题媒体总大小超过20MB'), { status: 400 });
    return { kind: String(item.kind || '').toLowerCase() === 'video' || mime.startsWith('video/') ? 'video' : 'image', mime, buffer };
  });
}
function normalizeQuestion(raw, metadata, user, existing) {
  const source = cleanString(metadata.source, 20, '试题来源');
  if (!SOURCES.includes(source)) throw Object.assign(new Error('试题来源必须从四个固定来源中选择'), { status: 400 });
  const grade = cleanString(metadata.grade, 30, '年级');
  const subject = cleanString(metadata.subject, 40, '学科');
  const difficulty = cleanString(metadata.difficulty, 10, '难度');
  if (!DIFFICULTIES.includes(difficulty)) throw Object.assign(new Error('难度必须选择简单、中等或困难'), { status: 400 });
  const knowledgePoints = listValue(metadata.knowledgePoints, '知识点', 12, 60);
  const tags = listValue(metadata.tags, '分类标签', 12, 40);
  const className = cleanString(metadata.className, 60, '适用班级', false);
  if (className && !canUseClass(user, className)) throw Object.assign(new Error('只能选择自己任教的班级'), { status: 403 });

  const title = cleanString(raw.title, 200, '题目内容');
  const type = cleanString(raw.type, 30, '题型');
  if (!['multiple-choice', 'true-false', 'text'].includes(type)) throw Object.assign(new Error('暂支持单选/多选、判断和填空题'), { status: 400 });
  const points = Number(raw.points);
  if (!Number.isFinite(points) || points <= 0 || points > 100 || Math.round(points * 100) !== points * 100) {
    throw Object.assign(new Error('分值必须为0.01至100，最多两位小数'), { status: 400 });
  }
  let answers;
  if (type === 'text') {
    answers = (Array.isArray(raw.answers) ? raw.answers : []).map(answer => ({ content: cleanString(answer && answer.content, 150, '填空参考答案') }));
    if (answers.length < 1 || answers.length > 10) throw Object.assign(new Error('填空题参考答案需为1至10项'), { status: 400 });
  } else {
    answers = (Array.isArray(raw.answers) ? raw.answers : []).map(answer => ({ type: 'text', content: cleanString(answer && answer.content, 150, '选项内容'), is_correct: answer && answer.is_correct === true }));
    if (type === 'true-false') {
      if (answers.length !== 2 || answers.filter(answer => answer.is_correct).length !== 1) throw Object.assign(new Error('判断题必须包含正确/错误两个选项，且只有一个正确答案'), { status: 400 });
      answers[0].content = '正确'; answers[1].content = '错误';
    } else if (answers.length < 2 || answers.length > 6 || !answers.some(answer => answer.is_correct)) {
      throw Object.assign(new Error('选择题需要2至6个选项，并至少勾选一个正确答案'), { status: 400 });
    }
  }
  let media = existing && Array.isArray(existing.media) ? existing.media.slice() : [];
  let mediaPayload = null;
  if (raw.media !== undefined) {
    mediaPayload = parseMedia(raw.media);
    media = mediaPayload.map((item, index) => ({ name: 'm' + (index + 1) + '.' + mediaExtension(item.mime), kind: item.kind, mime: item.mime, size: item.buffer.length }));
  }
  return {
    title, type, answers, points,
    source, grade, subject, difficulty,
    knowledgePoints, tags, className,
    media, mediaPayload,
    origin: String(raw.origin || '').slice(0, 100)
  };
}
function saveMedia(questionId, mediaPayload) {
  if (!mediaPayload || !mediaPayload.length) return;
  const dir = path.join(MEDIA_DIR, questionId); mkdir(dir);
  for (let index = 0; index < mediaPayload.length; index++) {
    const item = mediaPayload[index];
    const name = 'm' + (index + 1) + '.' + mediaExtension(item.mime);
    fs.writeFileSync(path.join(dir, name), item.buffer, { flag: 'wx' });
  }
}
function publicQuestion(question) {
  return {
    id: question.id, title: question.title, type: question.type, answers: question.answers,
    points: question.points, source: question.source, grade: question.grade, subject: question.subject,
    difficulty: question.difficulty, difficultyName: DIFFICULTY_NAMES[question.difficulty],
    knowledgePoints: question.knowledgePoints, tags: question.tags, className: question.className || '',
    ownerName: question.ownerName || '', media: (question.media || []).map(item => ({ ...item, url: '/api/question-bank/media/' + encodeURIComponent(question.id) + '/' + encodeURIComponent(item.name) })),
    origin: question.origin || '', createdAt: question.createdAt, updatedAt: question.updatedAt
  };
}
function shuffle(items) {
  const list = items.slice();
  for (let i = list.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
function allocateCounts(total, ratios) {
  const rows = SOURCES.map((source, index) => {
    const exact = total * ratios[source] / 100;
    const base = Math.floor(exact);
    return { source, index, count: base, fraction: exact - base };
  });
  let left = total - rows.reduce((sum, row) => sum + row.count, 0);
  rows.slice().sort((a, b) => b.fraction - a.fraction || a.index - b.index).slice(0, left).forEach(row => { rows.find(x => x.source === row.source).count++; });
  return Object.fromEntries(rows.map(row => [row.source, row.count]));
}
function normalizeRatios(input) {
  const ratios = {};
  for (const source of SOURCES) {
    const value = Number(input && input[source] !== undefined ? input[source] : DEFAULT_RATIOS[source]);
    if (!Number.isInteger(value) || value < 0 || value > 100) throw Object.assign(new Error('每个来源比例必须为0至100的整数'), { status: 400 });
    ratios[source] = value;
  }
  if (SOURCES.reduce((sum, source) => sum + ratios[source], 0) !== 100) throw Object.assign(new Error('四类试题来源比例合计必须为100%'), { status: 400 });
  return ratios;
}
function cleanFilters(body, user) {
  const className = cleanString(body.className, 60, '组卷班级', user.role !== 'admin');
  if (className && !canUseClass(user, className)) throw Object.assign(new Error('只能为自己任教的班级组卷'), { status: 403 });
  const grade = cleanString(body.grade, 30, '年级', false);
  const subject = cleanString(body.subject, 40, '学科', false);
  const difficulty = cleanString(body.difficulty, 10, '难度', false);
  if (difficulty && !DIFFICULTIES.includes(difficulty)) throw Object.assign(new Error('难度选项无效'), { status: 400 });
  const knowledgePoints = Array.isArray(body.knowledgePoints) ? body.knowledgePoints.map(String).map(s => s.trim()).filter(Boolean) : [];
  const tags = Array.isArray(body.tags) ? body.tags.map(String).map(s => s.trim()).filter(Boolean) : [];
  if (knowledgePoints.length > 30 || tags.length > 30) throw Object.assign(new Error('筛选知识点或标签过多'), { status: 400 });
  return { className, grade, subject, difficulty, knowledgePoints, tags };
}
function matchesFilters(question, filters) {
  if (filters.grade && filters.grade !== '全部' && question.grade !== filters.grade) return false;
  if (filters.subject && filters.subject !== '全部' && question.subject !== filters.subject) return false;
  if (filters.difficulty && filters.difficulty !== 'all' && question.difficulty !== filters.difficulty) return false;
  if (question.className && question.className !== filters.className) return false;
  if (filters.knowledgePoints.length && !filters.knowledgePoints.some(value => question.knowledgePoints.includes(value))) return false;
  if (filters.tags.length && !filters.tags.some(value => question.tags.includes(value))) return false;
  return true;
}
function makeCode() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) code += alphabet[crypto.randomInt(alphabet.length)];
    if (!fs.existsSync(path.join(PRACTICE_DIR, code))) return code;
  }
  throw Object.assign(new Error('生成测验码失败，请重试'), { status: 503 });
}
function atomicJson(file, value) { writeJson(file, value); }

module.exports = function createQuestionBankRouter(express) {
  const router = express.Router();
  router.use(auth);
  router.use(requestGuard);

  router.get('/meta', handler((req, res) => {
    const questions = visibleQuestions(req.qbUser);
    const unique = key => [...new Set(questions.flatMap(question => Array.isArray(question[key]) ? question[key] : (question[key] ? [question[key]] : [])))].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
    res.json({
      role: req.qbUser.role, username: req.qbUser.username,
      classes: allowedClasses(req.qbUser),
      sources: SOURCES, defaultRatios: DEFAULT_RATIOS,
      grades: unique('grade'), subjects: unique('subject'),
      knowledgePoints: unique('knowledgePoints'), tags: unique('tags'),
      counts: { total: questions.length, bySource: Object.fromEntries(SOURCES.map(source => [source, questions.filter(question => question.source === source).length])) }
    });
  }));

  router.get('/questions', handler((req, res) => {
    const list = visibleQuestions(req.qbUser);
    const q = String(req.query.q || '').trim().toLowerCase();
    const source = String(req.query.source || '');
    const grade = String(req.query.grade || '');
    const subject = String(req.query.subject || '');
    const difficulty = String(req.query.difficulty || '');
    const knowledgePoint = String(req.query.knowledgePoint || '');
    const tag = String(req.query.tag || '');
    const filtered = list.filter(item => {
      if (q && ![item.title, item.origin, ...(item.tags || []), ...(item.knowledgePoints || [])].join(' ').toLowerCase().includes(q)) return false;
      if (source && item.source !== source) return false;
      if (grade && item.grade !== grade) return false;
      if (subject && item.subject !== subject) return false;
      if (difficulty && item.difficulty !== difficulty) return false;
      if (knowledgePoint && !(item.knowledgePoints || []).includes(knowledgePoint)) return false;
      if (tag && !(item.tags || []).includes(tag)) return false;
      return true;
    }).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
    const pageSize = 20;
    res.json({ total: filtered.length, page, pageSize, questions: filtered.slice((page - 1) * pageSize, page * pageSize).map(publicQuestion) });
  }));

  router.get('/media/:id/:file', handler((req, res) => {
    const question = visibleQuestions(req.qbUser).find(item => item.id === req.params.id);
    const file = String(req.params.file || '');
    if (!question || !Array.isArray(question.media) || !question.media.some(item => item.name === file)) return res.sendStatus(404);
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(file)) return res.sendStatus(404);
    const root = path.join(MEDIA_DIR, question.id);
    const target = path.join(root, file);
    if (!target.startsWith(root + path.sep)) return res.sendStatus(404);
    res.set('Cache-Control', 'private, max-age=300');
    res.type(path.extname(file));
    res.sendFile(target, error => { if (error && !res.headersSent) res.sendStatus(404); });
  }));

  router.post('/questions', handler((req, res) => {
    const body = req.body || {};
    const metadata = body.metadata || body;
    const raw = body.question || body;
    const normalized = normalizeQuestion(raw, metadata, req.qbUser, null);
    const id = crypto.randomUUID();
    try { saveMedia(id, normalized.mediaPayload); }
    catch (error) { fs.rmSync(path.join(MEDIA_DIR, id), { recursive: true, force: true }); throw error; }
    delete normalized.mediaPayload;
    const now = new Date().toISOString();
    const record = { id, ownerId: req.qbUser.id, ownerName: req.qbUser.username, ...normalized, createdAt: now, updatedAt: now };
    const data = db(); data.questions.push(record); writeJson(DB_FILE, data);
    res.status(201).json({ question: publicQuestion(record), total: data.questions.length });
  }));

  router.post('/import', handler((req, res) => {
    const input = req.body && req.body.questions;
    const metadata = req.body && req.body.metadata || {};
    if (!Array.isArray(input) || input.length < 1 || input.length > 500) return fail(res, 400, '一次导入必须为1至500道题');
    const data = db();
    const created = [];
    try {
      for (let index = 0; index < input.length; index++) {
        const raw = input[index] || {};
        if (Array.isArray(raw.warning) && raw.warning.length) throw Object.assign(new Error('第' + (index + 1) + '题尚有识别问题：' + raw.warning.join('；')), { status: 400 });
        const itemMetadata = { ...metadata, ...(raw.bankMetadata && typeof raw.bankMetadata === 'object' ? raw.bankMetadata : {}) };
        const normalized = normalizeQuestion(raw, itemMetadata, req.qbUser, null);
        const id = crypto.randomUUID();
        try { saveMedia(id, normalized.mediaPayload); }
        catch (mediaError) { fs.rmSync(path.join(MEDIA_DIR, id), { recursive: true, force: true }); throw mediaError; }
        delete normalized.mediaPayload;
        const now = new Date().toISOString();
        created.push({ id, ownerId: req.qbUser.id, ownerName: req.qbUser.username, ...normalized, createdAt: now, updatedAt: now });
      }
    } catch (error) {
      for (const item of created) fs.rmSync(path.join(MEDIA_DIR, item.id), { recursive: true, force: true });
      throw error;
    }
    data.questions.push(...created);
    writeJson(DB_FILE, data);
    res.status(201).json({ ok: true, imported: created.length, total: data.questions.length, questions: created.slice(0, 5).map(publicQuestion) });
  }));

  router.patch('/questions/:id', handler((req, res) => {
    const data = db();
    const question = data.questions.find(item => item.id === req.params.id);
    if (!question) return fail(res, 404, '题目不存在');
    if (!canAccess(req.qbUser, question)) return fail(res, 403, '不能修改其他教师的题目');
    const body = req.body || {};
    const raw = body.question || body;
    const metadata = body.metadata || body;
    const normalized = normalizeQuestion({ ...question, ...raw, media: undefined }, metadata, req.qbUser, question);
    delete normalized.mediaPayload;
    Object.assign(question, normalized, { updatedAt: new Date().toISOString() });
    writeJson(DB_FILE, data);
    res.json({ question: publicQuestion(question) });
  }));

  router.delete('/questions/:id', handler((req, res) => {
    const data = db();
    const index = data.questions.findIndex(item => item.id === req.params.id);
    if (index < 0) return fail(res, 404, '题目不存在');
    if (!canAccess(req.qbUser, data.questions[index])) return fail(res, 403, '不能删除其他教师的题目');
    const [removed] = data.questions.splice(index, 1);
    writeJson(DB_FILE, data);
    fs.rmSync(path.join(MEDIA_DIR, removed.id), { recursive: true, force: true });
    res.json({ ok: true, total: data.questions.length });
  }));

  router.post('/draw', handler((req, res) => {
    const count = Number(req.body && req.body.count);
    if (!Number.isInteger(count) || count < 1 || count > 50) return fail(res, 400, '每份试卷题量必须为1至50题');
    const ratios = normalizeRatios(req.body && req.body.ratios);
    const filters = cleanFilters(req.body || {}, req.qbUser);
    const allocation = allocateCounts(count, ratios);
    const pool = visibleQuestions(req.qbUser).filter(question => matchesFilters(question, filters));
    const availableBySource = Object.fromEntries(SOURCES.map(source => [source, pool.filter(question => question.source === source).length]));
    const shortages = SOURCES.map(source => ({ source, required: allocation[source], available: availableBySource[source] })).filter(item => item.required > item.available);
    if (shortages.length) return fail(res, 409, '当前筛选条件下，部分来源题量不足，无法满足设定比例。请补充题目或调整筛选条件。', { allocation, availableBySource, shortages });
    let selected = [];
    for (const source of SOURCES) {
      const needed = allocation[source];
      if (needed) selected.push(...shuffle(pool.filter(question => question.source === source)).slice(0, needed));
    }
    selected = shuffle(selected);
    const totalPoints = Math.round(selected.reduce((sum, item) => sum + Number(item.points || 0), 0) * 100) / 100;
    res.json({ questions: selected.map(publicQuestion), allocation, availableBySource, totalPoints, count: selected.length, ratios, filters });
  }));

  router.post('/replace', handler((req, res) => {
    const body = req.body || {};
    const questionId = String(body.questionId || '');
    const selectedIds = Array.isArray(body.selectedIds) ? body.selectedIds.map(String) : [];
    const current = visibleQuestions(req.qbUser).find(question => question.id === questionId);
    if (!current || !selectedIds.includes(questionId)) return fail(res, 404, '要替换的题目不存在');
    const filters = cleanFilters(body.filters || {}, req.qbUser);
    const pool = visibleQuestions(req.qbUser).filter(question => question.source === current.source && matchesFilters(question, filters) && !selectedIds.includes(question.id));
    if (!pool.length) return fail(res, 409, '该来源下没有可替换的新题，请重新抽题或补充题库');
    res.json({ question: publicQuestion(shuffle(pool)[0]) });
  }));

  router.post('/publish', handler((req, res) => {
    const body = req.body || {};
    const ids = Array.isArray(body.questionIds) ? [...new Set(body.questionIds.map(String))] : [];
    if (!ids.length || ids.length > 50) return fail(res, 400, '发布试卷必须包含1至50道不重复题目');
    const title = cleanString(body.title, 100, '试卷名称');
    const mode = String(body.mode || 'practice');
    if (!['exam', 'practice'].includes(mode)) return fail(res, 400, '请选择考试或自主练习');
    const className = cleanString(body.className, 60, '发布班级', req.qbUser.role !== 'admin');
    if (className && !canUseClass(req.qbUser, className)) return fail(res, 403, '教师只能向自己的任教班级发布');
    const data = db();
    const questions = ids.map(id => data.questions.find(question => question.id === id)).filter(Boolean);
    if (questions.length !== ids.length || questions.some(question => !canAccess(req.qbUser, question))) return fail(res, 403, '试卷包含不存在或无权使用的题目，请重新抽题');
    if (questions.some(question => question.className && question.className !== className)) return fail(res, 400, '试卷中包含不适用于所选班级的题目，请重新抽题');
    const code = makeCode();
    const dir = path.join(PRACTICE_DIR, code);
    const quizQuestions = [];
    try {
      mkdir(path.join(dir, 'results'));
      const mediaDir = path.join(dir, 'media');
      for (let qi = 0; qi < questions.length; qi++) {
        const source = questions[qi];
        const question = {
          title: source.title, type: source.type,
          timer: 60, pointMultiplier: 'none', points: Number(source.points),
          answers: source.answers.map(answer => ({ ...answer }))
        };
        const urls = [];
        for (let mi = 0; mi < (source.media || []).length; mi++) {
          const item = source.media[mi];
          const filename = 'q' + (qi + 1) + '-' + (mi + 1) + '.' + mediaExtension(item.mime);
          const from = path.join(MEDIA_DIR, source.id, item.name);
          if (!fs.existsSync(from)) throw new Error('题目媒体文件缺失：' + source.id + '/' + item.name);
          mkdir(mediaDir);
          fs.copyFileSync(from, path.join(mediaDir, filename));
          urls.push('/school/import/media/' + code + '/' + filename);
        }
        if (urls.length) question.title += '\n' + urls.map(url => '[[QUIZZLE_MEDIA:' + url + ']]').join('\n');
        quizQuestions.push(question);
      }
      const totalPoints = Math.round(quizQuestions.reduce((sum, question) => sum + question.points, 0) * 100) / 100;
      fs.writeFileSync(path.join(dir, 'quiz.quizzle'), compressQuiz({ __type: 'QUIZZLE2', title, questions: quizQuestions, settings: { defaultTimer: 60, scoringMode: 'flat' } }));
      atomicJson(path.join(dir, 'meta.json'), { created: new Date().toISOString(), expiry: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), source: 'question-bank-weighted-draw-v1', pointsTotal: totalPoints, questionIds: ids });
      const assignmentDb = readJson(ASSIGNMENTS_FILE, { assignments: [] });
      assignmentDb.assignments = Array.isArray(assignmentDb.assignments) ? assignmentDb.assignments : [];
      assignmentDb.assignments.push({ code, title, mode, className, enabled: true, ownerId: req.qbUser.role === 'teacher' ? req.qbUser.id : null, updatedAt: new Date().toISOString(), source: 'question-bank' });
      atomicJson(ASSIGNMENTS_FILE, assignmentDb);
      res.status(201).json({ ok: true, code, title, mode, className, count: quizQuestions.length, totalPoints, expiresInDays: 14 });
    } catch (error) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw error;
    }
  }));

  return router;
};

module.exports._test = { allocateCounts, normalizeRatios, matchesFilters, normalizeQuestion, SOURCES, DEFAULT_RATIOS };
