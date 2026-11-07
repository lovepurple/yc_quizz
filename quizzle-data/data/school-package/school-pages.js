'use strict';const path=require('path');
module.exports=function(express){const r=express.Router();const base=__dirname;
r.get('/',(_req,res)=>res.sendFile(path.join(base,'student.html')));
r.get('/admin',(_req,res)=>res.sendFile(path.join(base,'admin.html')));
r.get('/school.css',(_req,res)=>res.sendFile(path.join(base,'school.css')));
r.get('/student.js',(_req,res)=>res.sendFile(path.join(base,'student.js')));
r.get('/admin.js',(_req,res)=>res.sendFile(path.join(base,'admin.js')));
r.get('/teacher-first-login',(_req,res)=>res.set('Cache-Control','no-store').sendFile(path.join(process.env.QUIZZLE_ROOT||'/quizzle','data','school-org-v2-package','teacher-first-login.html')));
/* SCHOOL_ORG_V2_FIRST_LOGIN_PAGE */
return r;};
