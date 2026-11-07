'use strict';
// Targeted patch for Quizzle 2.6.3 teacher/admin login ONLY.
// Other authentication, student logins, data files and permissions are untouched.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = process.env.QUIZZLE_ROOT || '/quizzle';
const authFile = path.join(root, 'server', 'routes', 'auth.js');
const backup = path.join(root, 'data', '.teacher-unlimited-login-backup-v1');
const marker = '/* QUIZZLE_TEACHER_LOGIN_NO_IP_QUOTA_V1 */';
const formerRoute = "app.post('/login', loginLimiter, (req, res) => {";
const newRoute = "app.post('/login', (req, res) => {";
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const atomic = (file, bytes) => { const tmp = file + '.loginpatch.tmp'; fs.writeFileSync(tmp, bytes); fs.renameSync(tmp, file); };
function candidate(input) {
  const str = input.toString('utf8');
  const start = str.indexOf('const loginLimiter = rateLimit({');
  if (start < 0 || str.indexOf('const loginLimiter = rateLimit({', start + 1) >= 0) throw Error('Unknown version: unique loginLimiter declaration missing');
  const end = str.indexOf('});', start);
  if (end < 0 || end - start > 700) throw Error('Cannot isolate Quizzle 2.6.3 login limiter');
  const limiterBlock = str.slice(start, end + 3);
  if (!limiterBlock.includes('limit: 10') || !limiterBlock.includes('15 * 60 * 1000') || !limiterBlock.includes('Zu viele Anmeldeversuche')) throw Error('Unexpected login limit definition, stopping');
  if (str.split(formerRoute).length !== 2) throw Error('Cannot find unique original login route');
  if (!str.includes("app.post('/setup', setupLimiter")) throw Error('Unexpected setup route, stopping');
  const withoutLimiter = str.slice(0, start) + str.slice(end + 3);
  const out = withoutLimiter.replace(formerRoute, marker + '\n' + newRoute);
  if (out.includes('loginLimiter') || !out.includes("app.post('/setup', setupLimiter") || !out.includes('const result = login(username, password);')) throw Error('Validation of modified route failed');
  return Buffer.from(out, 'utf8');
}
function check() {
  const buf = fs.readFileSync(authFile);
  if (buf.toString('utf8').includes(marker)) {
    const p = path.join(backup, 'manifest.json');
    if (!fs.existsSync(p)) throw Error('Patched route found, but backup manifest missing');
    const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (m.patchedSha256 !== sha(buf)) throw Error('Login file has changed since patch, needs manual review');
    console.log('PASS: login requests are no longer limited by original shared IP quota');
    return;
  }
  candidate(buf);
  console.log('PASS: original 2.6.3 auth route detected, ready to patch');
}
function apply() {
  const src = fs.readFileSync(authFile);
  if (src.toString('utf8').includes(marker)) {check(); console.log('ALREADY INSTALLED'); return;}
  if (fs.existsSync(path.join(backup, 'manifest.json'))) throw Error('Existing backup manifest found, refusing overwrite');
  const out = candidate(src);
  fs.mkdirSync(backup, {recursive: true});
  fs.writeFileSync(path.join(backup, 'auth.original.js'), src);
  fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify({version: 1, originalSha256: sha(src), patchedSha256: sha(out), file: authFile}, null, 2));
  try {atomic(authFile, out);} catch (e) {atomic(authFile, src); throw e;}
  console.log('PASS: original IP-based 10-per-15-minute limiter removed from teacher/admin POST /api/auth/login');
  console.log('PASS: user-password verification, setup limiter, school student login and scores are unchanged');
}
function restore() {
  const mFile = path.join(backup, 'manifest.json');
  if (!fs.existsSync(mFile)) throw Error('Cannot restore: no backup manifest');
  const m = JSON.parse(fs.readFileSync(mFile, 'utf8'));
  if (m.file !== authFile) throw Error('Backup path mismatch');
  const current = fs.readFileSync(authFile);
  const original = fs.readFileSync(path.join(backup, 'auth.original.js'));
  if (sha(current) !== m.patchedSha256 || sha(original) !== m.originalSha256) throw Error('File modified after install or backup corrupted; refusing to overwrite');
  atomic(authFile, original);
  fs.renameSync(mFile, path.join(backup, 'manifest.restored.json'));
  console.log('PASS: original login limiter restored');
}
try {
  const action = process.argv[2];
  if (action === 'check') check();
  else if (action === 'apply') apply();
  else if (action === 'restore') restore();
  else throw Error('Usage: bun patch-login.js check|apply|restore');
} catch (e) {console.error('ERROR: ' + e.message); process.exitCode = 1;}
