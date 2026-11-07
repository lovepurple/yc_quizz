'use strict';
const path = require('path');
const ROOT = process.env.QUIZZLE_ROOT || '/quizzle';
const {validateToken} = require(path.join(ROOT,'server','utils','auth'));
const {extractToken} = require(path.join(ROOT,'server','middleware','auth'));
module.exports = function createTeacherNavigationRouter(express) {
  const router = express.Router();
  const script = path.join(__dirname,'teacher-nav.js');
  router.get('/admin', (req,res,next) => {
    res.set('Cache-Control','no-store');
    let user = null;
    try { const token = extractToken(req); user = token ? validateToken(token) : null; }
    catch(e) { console.error('[teacher-nav] invalid login:',e.message); }
    if (user && (user.role === 'admin' || user.role === 'teacher')) return next();
    // Do not create a second teacher login page; use Quizzle's existing login.
    return res.redirect(302,'/?teacher=1');
  });
  router.get('/teacher-nav.js',(_req,res)=>{
    res.set('Cache-Control','no-store');
    return res.sendFile(script);
  });
  return router;
};
