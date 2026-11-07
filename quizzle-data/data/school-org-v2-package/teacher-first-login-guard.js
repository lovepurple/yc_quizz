'use strict';
const ROOT=process.env.QUIZZLE_ROOT||'/quizzle';
const {validateToken}=require(require('path').join(ROOT,'server','utils','auth'));
const {extractToken}=require(require('path').join(ROOT,'server','middleware','auth'));
const allowed=new Set(['/school/teacher-first-login','/api/auth/me','/api/auth/logout','/api/teacher-account/change-password']);
module.exports=function(req,res,next){
 try{
  const token=extractToken(req),user=token?validateToken(token):null;
  if(!user||user.role!=='teacher'||!user.mustChangePassword)return next();
  if(allowed.has(req.path))return next();
  if(req.path.startsWith('/api/'))return res.status(403).json({code:'PASSWORD_CHANGE_REQUIRED',redirect:'/school/teacher-first-login',message:'首次登录必须先修改密码'});
  return res.redirect(302,'/school/teacher-first-login');
 }catch(e){console.error('[teacher-first-login-guard]',e);return next();}
};
