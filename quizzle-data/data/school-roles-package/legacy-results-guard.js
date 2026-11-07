'use strict';
// Prevent school teacher accounts bypassing class restrictions via Quizzle original raw results API.
const path=require('path');
const ROOT=process.env.QUIZZLE_ROOT||'/quizzle';
const {validateToken}=require(path.join(ROOT,'server','utils','auth'));
const {extractToken}=require(path.join(ROOT,'server','middleware','auth'));
module.exports=function(express){const r=express.Router();r.post('/:code/results',(req,res,next)=>{const t=validateToken(extractToken(req));if(!t)return res.status(401).json({message:'请登录教师账号'});if(t.role==='teacher')return res.status(403).json({message:'教师请通过校园后台查看本班成绩；原始成绩接口不向教师开放'});if(t.role!=='admin')return res.status(403).json({message:'权限不足'});next();});return r;};
