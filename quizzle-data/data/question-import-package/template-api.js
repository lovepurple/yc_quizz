'use strict';
const path = require('path');
const fs = require('fs');

// Attached to the existing importer router after its teacher authentication.
module.exports = function attachTemplateDownloads(router) {
  const templates = Object.freeze({
    word: {
      source: 'word-questions.docx',
      name: 'Word试题上传模板.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    },
    excel: {
      source: 'excel-questions.xlsx',
      name: 'Excel试题上传模板.xlsx',
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
  });
  router.get('/templates/:kind', (req, res, next) => {
    // Keep the download restricted even if this module is reused elsewhere.
    if (!req.user || !['admin', 'teacher'].includes(req.user.role)) {
      return res.status(401).json({message: '请先登录教师账号，再下载模板'});
    }
    if (!Object.prototype.hasOwnProperty.call(templates, req.params.kind)) {
      return res.status(404).json({message: '没有这个模板，请选择 Word 或 Excel 模板'});
    }
    const item = templates[req.params.kind];
    const file = path.join(__dirname, 'templates', item.source);
    if (!fs.existsSync(file)) {
      return res.status(503).json({message: '模板文件缺失，请联系管理员重新安装模板下载补丁'});
    }
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.type(item.mime);
    res.download(file, item.name, error => {
      if (!error) return;
      if (res.headersSent) return next(error);
      res.status(error.statusCode === 404 ? 503 : 500)
        .json({message: '模板下载失败，请稍后重试'});
    });
  });
};
