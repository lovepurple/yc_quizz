'use strict';
const path = require('path');
const ROOT = process.env.QUIZZLE_ROOT || '/quizzle';
const { validateToken } = require(path.join(ROOT, 'server', 'utils', 'auth'));
const { extractToken } = require(path.join(ROOT, 'server', 'middleware', 'auth'));
module.exports = function createQuestionBankPages(express) {
  const router = express.Router();
  function pageAuth(req, res, next) {
    const user = validateToken(extractToken(req));
    if (!user || !['admin', 'teacher'].includes(user.role)) return res.redirect(302, '/?teacher=1');
    req.qbPageUser = user;
    next();
  }
  router.use(pageAuth);
  router.get('/', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'question-bank.html'));
  });
  router.get('/:asset', (req, res) => {
    const allowed = new Set(['question-bank.css', 'question-bank.js']);
    if (!allowed.has(req.params.asset)) return res.sendStatus(404);
    res.set('Cache-Control', 'no-store');
    res.type(req.params.asset.endsWith('.css') ? 'css' : 'js');
    res.sendFile(path.join(__dirname, req.params.asset));
  });
  return router;
};
