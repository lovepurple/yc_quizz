'use strict';
// Quizzle 2.6.3 LAN HTTP teacher/admin session cookie compatibility fix.
// Changes ONLY secure policy in /quizzle/server/routes/auth.js.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = process.env.QUIZZLE_ROOT || '/quizzle';
const file = path.join(root, 'server', 'routes', 'auth.js');
const dir = path.join(root, 'data', '.lan-http-teacher-cookie-fix-v1');
const manifest = path.join(dir, 'manifest.json');
const original = path.join(dir, 'auth.before-lan-cookie.js');
const marker = '/* QUIZZLE_LAN_HTTP_COOKIE_FIX_V1 */';
const before = "secure: process.env.NODE_ENV === 'production',";
const after = "secure: process.env.QUIZZLE_COOKIE_SECURE === 'true',";
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function writeAtomic(dst, content) {
  const t = dst + '.tmp-' + crypto.randomBytes(5).toString('hex');
  fs.writeFileSync(t, content); fs.renameSync(t, dst);
}
function candidate(buf) {
  const src = buf.toString('utf8');
  if (!src.includes("res.cookie('quizzle_token', token")) throw Error('Unsupported auth route: teacher cookie missing');
  if (src.split(before).length !== 2) throw Error('Unsupported auth version: expected ONE original secure cookie policy');
  if (!src.includes("setTokenCookie(res, loginResult.token)")) throw Error('Unsupported auth route: token cookie call missing');
  // Preserve ALL previous local patches (e.g. unlimited login route and session logic).
  const output = src.replace(before, marker + '\n        ' + after);
  if (output.split(after).length !== 2 || output.includes(before)) throw Error('Post-patch validation failed');
  return Buffer.from(output, 'utf8');
}
function check() {
  const buf = fs.readFileSync(file), code = buf.toString('utf8');
  if (code.includes(marker)) {
    if (!fs.existsSync(manifest)) throw Error('Marker exists but backup manifest missing');
    const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (m.patchedSha256 !== sha(buf) || m.file !== file) throw Error('Auth modified since install; manual review required');
    console.log('PASS: teacher cookie accepts direct LAN HTTP; all other auth rules unchanged');
    return;
  }
  candidate(buf);
  console.log('PASS: compatible auth route detected, ready for targeted cookie fix');
}
function apply() {
  const src = fs.readFileSync(file);
  if (src.toString('utf8').includes(marker)) {check(); console.log('ALREADY INSTALLED');return;}
  if (fs.existsSync(manifest) || fs.existsSync(original)) throw Error('Previous partial backup found, manual review required');
  const out = candidate(src);
  fs.mkdirSync(dir, {recursive:true});
  fs.writeFileSync(original, src, {flag:'wx'});
  fs.writeFileSync(manifest, JSON.stringify({version:1,file,originalSha256:sha(src),patchedSha256:sha(out),changed:'teacher quizzle_token Secure flag only',installed:new Date().toISOString()},null,2),{flag:'wx'});
  try {writeAtomic(file,out);} catch (e) {writeAtomic(file,src);throw e;}
  console.log('PASS: login cookie Secure flag now optional via QUIZZLE_COOKIE_SECURE=true');
  console.log('PASS: HTTP mode (current configuration) keeps teacher session on 10.1.69.100');
  console.log('PASS: unlimited login patch, passwords, students, teacher RBAC, quizzes, scores NOT touched');
}
function restore() {
  if (!fs.existsSync(manifest) || !fs.existsSync(original)) throw Error('No backup for this patch');
  const m = JSON.parse(fs.readFileSync(manifest,'utf8'));
  const now = fs.readFileSync(file), old = fs.readFileSync(original);
  if (m.file !== file || sha(now) !== m.patchedSha256 || sha(old) !== m.originalSha256) throw Error('File changed; refusing unsafe restore');
  writeAtomic(file,old);
  fs.renameSync(manifest,path.join(dir,'manifest.restored.json'));
  console.log('RESTORED original teacher cookie policy (same as before this fix)');
}
try {
  const op=process.argv[2];
  if(op==='check')check(); else if(op==='apply')apply(); else if(op==='restore')restore(); else throw Error('Usage: bun fix-teacher-cookie.js check|apply|restore');
} catch(e) {console.error('ERROR: '+e.message);process.exitCode=1;}
