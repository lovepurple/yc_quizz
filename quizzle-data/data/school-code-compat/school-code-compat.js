'use strict';
/**
 * Bridge saved Quizzle quiz IDs (variable length) into persistent four-letter
 * self-paced quiz codes, so both 'exam' and 'practice' account assignments work.
 * The original scoped assignment route still handles existing practice codes.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = process.env.QUIZZLE_ROOT || '/quizzle';
const DATA = path.join(ROOT,'data');
const PRACTICE = path.join(DATA,'practice-quizzes');
const SAVED = path.join(DATA,'quizzes');
const SCHOOL = path.join(DATA,'school-accounts');
const {extractToken} = require(path.join(ROOT,'server','middleware','auth'));
const {validateToken} = require(path.join(ROOT,'server','utils','auth'));
const {decompressQuiz} = require(path.join(ROOT,'server','utils','quiz'));

const read = (p, d) => {try {return JSON.parse(fs.readFileSync(p,'utf8'));} catch(e) {if(e.code==='ENOENT')return d;throw e;}};
const fail = (res,status,message) => res.status(status).json({message});
const atomicJSON = (file,data) => {
  const tmp=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
  fs.mkdirSync(path.dirname(file),{recursive:true});
  try {fs.writeFileSync(tmp,JSON.stringify(data,null,2));fs.renameSync(tmp,file);}
  catch(e){try{fs.rmSync(tmp,{force:true});}catch{}throw e;}
};
const safeCode = (code) => typeof code==='string' && /^[A-Z0-9]{4,16}$/.test(code);
const genCode = () => Array.from({length:4},()=>String.fromCharCode(65+crypto.randomInt(26))).join('');
const isOwned = (u,assign) => u.role==='admin' || (assign.ownerId===u.id && assign.className && (read(path.join(SCHOOL,'teacher-classes.json'),{grants:{}}).grants[u.id]||[]).includes(assign.className));

module.exports = function(express) {
  const router = express.Router();
  router.post('/admin/assignments',(req,res,next)=>{
    try {
      const origin=req.get('origin');
      if(origin){let valid=false;try{valid=new URL(origin).host===req.get('host');}catch{}if(!valid)return fail(res,403,'请求来源不符合要求');}
      if(!req.is('application/json'))return fail(res,415,'请求必须使用JSON格式');
      const user = validateToken(extractToken(req));
      if(!user || !['teacher','admin'].includes(user.role))return fail(res,403,'请先登录教师或管理员账号');
      const code=String(req.body?.code||'').trim().toUpperCase();
      const title=String(req.body?.title||'').trim();
      const mode=String(req.body?.mode||'');
      const className=String(req.body?.className||'').trim();
      if(!safeCode(code))return fail(res,400,'请输入4至16位字母或数字的有效试卷编号');
      if(!title || title.length>100 || !['exam','practice'].includes(mode) || className.length>60)
        return fail(res,400,'请检查任务名称、考试模式和班级');
      const assignmentFile=path.join(SCHOOL,'assignments.json');
      const all=read(assignmentFile,{assignments:[]});
      if(!Array.isArray(all.assignments))return fail(res,500,'任务数据格式异常，已停止发布');
      if(user.role==='teacher'){
        const classes=read(path.join(SCHOOL,'teacher-classes.json'),{grants:{}}).grants[user.id]||[];
        if(!className || !classes.includes(className))return fail(res,403,'只能向已授权的任教班级发布测验');
      }
      // Existing published practice code — preserve all original checks and ownership rules.
      if(/^[A-Z]{4}$/.test(code) && fs.existsSync(path.join(PRACTICE,code,'quiz.quizzle')))
        return next();
      // Room codes are transient Socket.IO sessions, not stored quizzes.
      // Four digits without a saved quiz are not convertible into an account exam.
      if(/^\d{4}$/.test(code) && !fs.existsSync(path.join(SAVED,code+'.quizzle')))
        return fail(res,400,'这是实时主持房间码，不能直接发布账号考试。请在创建测验中保存试卷，使用保存后获得的试卷ID，或用4位字母自主测验码。');
      const source=path.join(SAVED,code+'.quizzle');
      if(!fs.existsSync(source))
        return fail(res,404,'未找到编号为 '+code+' 的已保存试卷。请使用创建测验后保存获得的“试卷ID”，不是实时房间码或任意输入的名称。');
      const stat=fs.statSync(source);
      if(!stat.isFile() || stat.size<5 || stat.size>15*1024*1024)return fail(res,400,'原始试卷文件不符合要求或过大');
      const content=fs.readFileSync(source);
      let quiz;
      try{quiz=decompressQuiz(content);}catch{return fail(res,400,'试卷文件无法解析，请重新保存试卷');}
      if(!quiz || !Array.isArray(quiz.questions) || quiz.questions.length<1 || quiz.questions.length>50 ||
        quiz.questions.some(q=>!q||typeof q.title!=='string'||!Array.isArray(q.answers)||!['multiple-choice','true-false','text','sequence','slider'].includes(q.type)))
        return fail(res,400,'试卷结构不符合现有系统的自主答题规则，请在创建测验中检查题目后重新保存');
      // New four-letter published copy: no existing student results or live-room state touched.
      let newCode,dir;
      fs.mkdirSync(PRACTICE,{recursive:true});
      for(let i=0;i<1000;i++){
        const candidate=genCode();const dest=path.join(PRACTICE,candidate);
        if(all.assignments.some(a=>a.code===candidate))continue;
        try {fs.mkdirSync(dest);newCode=candidate;dir=dest;break;}
        catch(e){if(e.code!=='EEXIST')throw e;}
      }
      if(!newCode)return fail(res,503,'创建测验码失败，请重新发布');
      try {
        fs.mkdirSync(path.join(dir,'results'));
        fs.writeFileSync(path.join(dir,'quiz.quizzle'),content);
        const now=new Date();
        atomicJSON(path.join(dir,'meta.json'),{
          created:now.toISOString(),expiry:new Date(now.getTime()+14*86400*1000).toISOString(),
          source:'saved-quiz-id',sourceQuizId:code
        });
        const entry={code:newCode,title,mode,className,enabled:true,ownerId:user.role==='teacher'?user.id:null,
          sourceQuizId:code,updatedAt:now.toISOString()};
        all.assignments.push(entry);
        atomicJSON(assignmentFile,all);
        return res.json({assignment:entry,convertedFrom:code,generatedCode:newCode,
          message:'已将保存的试卷转换为账号'+(mode==='exam'?'考试':'自主练习')+'；正式测验码：'+newCode});
      } catch(e) {
        fs.rmSync(dir,{recursive:true,force:true});
        throw e;
      }
    } catch(error){console.error('[school-code-compat]',error);return fail(res,500,'发布未完成，服务器日志可查看详细原因');}
  });
  return router;
};
module.exports._test={safeCode};
