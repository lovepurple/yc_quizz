'use strict';
const path=require('path');module.exports=function(express){const r=express.Router(),dir=__dirname;
r.get('/classes',(_req,res)=>res.sendFile(path.join(dir,'classes.html')));
r.get('/classes.js',(_req,res)=>res.type('text/javascript; charset=utf-8').sendFile(path.join(dir,'classes.js')));
/* SCHOOL_TEACHER_UX_V2 */
r.get('/admin-dashboard-plus.js',(_req,res)=>res.type('text/javascript; charset=utf-8').sendFile(path.join('/quizzle/data/school-teacher-ui-v2','dashboard-plus.js')));
r.get('/classes.css',(_req,res)=>res.type('text/css; charset=utf-8').sendFile(path.join(dir,'classes.css')));
/* SCHOOL_SAFE_DELETE_V1 */
r.get('/delete-ui.js',(_req,res)=>res.type('text/javascript; charset=utf-8').sendFile(path.join(dir,'../school-delete-package/delete-ui.js')));
return r;};
