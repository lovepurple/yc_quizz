Quizzle 2.6.3 智能题库与比例抽题升级包 v1.0.0

功能
1. 题库管理：教材原题、学科网、练习册、教师题库四类来源。
2. 每道题必填来源、年级、学科、难度、知识点和分类标签；批量导入时可逐题调整来源、难度、知识点和标签。
3. Word（.docx）/ Excel（.xlsx）导入复用现有校内解析模块，支持题目图片、视频和公式媒体归档。
4. 自动组卷：默认教材原题10%、学科网20%、练习册35%、教师题库35%；比例可调整，但总和必须为100%。
5. 按年级、学科、难度、知识点、标签和班级筛选，支持换题、预览、发布为考试或自主练习。
6. 教师仅能查看、编辑、删除和使用自己录入的题目；发布班级仍受现有教师任教班级权限限制。管理员可以管理全校题库。
7. 题库和媒体保存在原 Docker 数据卷 /quizzle/data/question-bank，不覆盖原有账号、测验和成绩。

部署方式（Windows PowerShell）
1. 解压升级包。
2. 进入解压后的文件夹，在 PowerShell 中运行：
   powershell -ExecutionPolicy Bypass -File .\install.ps1
3. 脚本会把文件复制到现有 quizzle 容器、执行兼容性检查和安装，然后重启容器。
4. 打开： http://10.1.69.100:6412/school/question-bank

手动安装（如果不使用 install.ps1）
在升级包目录运行：
  docker exec quizzle mkdir -p /quizzle/data/question-bank-package
  docker cp .\question-bank-package\. quizzle:/quizzle/data/question-bank-package/
  docker exec quizzle bun /quizzle/data/question-bank-package/install-question-bank.js check
  docker exec quizzle bun /quizzle/data/question-bank-package/install-question-bank.js apply
  docker restart quizzle

回滚
  docker exec quizzle bun /quizzle/data/question-bank-package/install-question-bank.js restore
  docker restart quizzle
回滚只恢复服务器路由和教师管理页；已经录入的题库数据不会删除。

重要说明
- 本升级包针对用户提供的 2026-11-05 Quizzle 2.6.3 备份及其现有中文补丁。
- 不要删除或重建现有 quizzle 容器；本次采用容器内可回滚补丁方式，重启容器即可生效。
- 建议在升级前继续保留原有 Quizzle 备份。
