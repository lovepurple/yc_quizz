# AGENTS.md — Quizzle 校级答题系统（备份仓库）

本文件面向在本仓库中工作的 AI 编码助手。开始任何操作前请先通读本文件。

---

## 1. 这个仓库是什么

**这不是一个普通的源码仓库。** 它是一所学校的生产系统备份快照，包含：

| 文件/目录 | 性质 | 说明 |
|---|---|---|
| `quizzle-image.tar` | 容器镜像 | OCI 格式，78 MB，15 层。内含完整应用代码与依赖 |
| `quizzle-data/` | 数据卷快照 | 生产数据 + **所有运行时补丁包** |
| `container-inspect` | 容器配置转储 | `docker inspect` 原始输出 |
| `mounts.json` / `volume-inspect` | 挂载与卷配置 | 恢复时需要 |
| `image-inspect.json` | 镜像元数据 | 含 Env、Entrypoint、端口 |
| `SHA256SUMS.txt` | 完整性清单 | 覆盖全部数据文件 |
| `BACKUP-INFO.txt` | 备份说明 | 中文，面向运维 |

**核心事实**：应用代码**不在** `quizzle-data/` 里，在 tarball 里。`quizzle-data/` 里放的是**数据**和一套**补丁注入系统**。

- 上游项目：Quizzle 2.6.3（`github.com/gnmyt/Quizzle`，ISC 许可）
- 本仓库版本：Quizzle 2.6.3 + 深度汉化 + 校级扩展（约 20 个补丁包）

---

## 2. 绝对规则（必须遵守）

> 本节优先级最高，与后文任何内容冲突时以本节为准。

### 2.1 默认只读

对本仓库的**默认操作模式是只读分析**。任何下列操作都必须**先向用户说明并获得明确同意**：

- 写入、修改、删除、移动任何文件
- 执行 `docker` 命令（`run` / `exec` / `cp` / `restart` / `load` / `rm` / `volume` 等）
- 执行 `quizzle-data/data/` 下任意 `install-*.js`、`apply-*.js`、`patch-*.js`、`fix-*.js`
- 解压 `quizzle-image.tar` 到非临时目录
- 改动 `.xxx_backup` / `.xxx_rollback` / `.*-backup-v1` 目录

### 2.2 绝不触碰的路径

这些目录是**回滚基线**。一旦被修改或删除，系统将无法回退到补丁前的状态：

```
quizzle-data/data/.cn_live_options_v1_backup
quizzle-data/data/.cn_name_patch_v2_backup
quizzle-data/data/.cn_progress_v1_backup
quizzle-data/data/.lan-http-teacher-cookie-fix-v1
quizzle-data/data/.one_site_v2_backup
quizzle-data/data/.question_bank_v1_backup
quizzle-data/data/.question_import_media_v1_backup
quizzle-data/data/.question_import_template_v1_backup
quizzle-data/data/.question_import_v1_backup
quizzle-data/data/.school-delete-v1-rollback
quizzle-data/data/.school_accounts_v1_backup
quizzle-data/data/.school_brand_v1_backup
quizzle-data/data/.school_classes_v1_rollback
quizzle-data/data/.school_code_compat_backup
quizzle-data/data/.school_org_v2_backup
quizzle-data/data/.school_roles_v1_backup
quizzle-data/data/.teacher-ui-v2-rollback
quizzle-data/data/.teacher-unlimited-login-backup-v1
quizzle-data/data/school-password-adminonly-backup-v1
quizzle-data/data/teacher-cookie-patch
quizzle-data/data/teacher-login-patch
```

它们同时包含旧版代码快照与哈希清单（`manifest.json` 中的 `shaBefore` / `shaAfter` / `originalSha256` / `patchedSha256`）。

### 2.3 这是生产数据，不是测试数据

`quizzle-data/data/` 下的每个 JSON 都对应真实师生：

- `users.json` — 教师与管理员账号
- `school-accounts/accounts.json` — 学生账号（含 `hash` 凭证字段）
- `school-accounts/attempts/` — 学生答题记录
- `school-accounts/organization.json` — 学部/年级/班级组织树
- `question-bank/questions.json` — 题库

**禁止**在仓库内生成"示例数据"覆盖这些文件。**禁止**为了调试而写入或清空它们。

### 2.4 敏感信息处理

- 本仓库含真实账号、密码哈希、姓名、班级、成绩
- **不得**将任何账号、哈希、`session-secret`、API Key、内网 IP、真实师生姓名复制进提交信息、代码注释、issue、文档、外部服务或模型上下文
- 本文件用占位符：`<ADMIN_USER>`、`<TEACHER_USER>`、`<LAN_HOST>`、`<STUDENT_ID>`、`<QUIZ_CODE>`
- 确需引用时一律使用占位符

### 2.5 不要自行"修复"安全问题

用户已明确要求本文件不包含安全披露章节。若分析中发现疑点：

- **可以**：客观陈述现象、指出位置、给出可选方案
- **不可以**：擅自修改认证、限流、密码策略、权限判断逻辑
- **不可以**：在未获授权时写 PoC、构造越权请求、尝试爆破或猜测凭证

---

## 3. 系统架构

### 3.1 运行时

| 项 | 值 |
|---|---|
| 运行时 | Bun 1.3.13 (alpine)，兼容 Node |
| 框架 | Express 4.19 + Socket.IO 4.7 |
| 入口 | `bun run server/index.js` |
| 工作目录 | `/quizzle` |
| 端口 | `6412`（bridge 网络，映射到宿主同端口） |
| 环境变量 | `TZ=Asia/Shanghai`、`NODE_ENV=production`、`QUIZZLE_COOKIE_SECURE`（默认 false） |
| 数据卷 | `quizzle-data` → `/quizzle/data` |
| 重启策略 | `unless-stopped` |

容器名 `quizzle`，访问地址形如 `http://<LAN_HOST>:6412`。

### 3.2 目录结构（镜像内 `/quizzle`）

```
/quizzle
├── server/
│   ├── index.js        ← 路由装配中心（被多个补丁改写）
│   ├── socket.js       ← 实时答题、计分、断线重连
│   ├── routes/         admin / ai / auth / branding / media / practice / quizzes
│   ├── utils/          auth / scoring / session / analytics / room / quiz / cleanup / file / random
│   ├── middleware/     auth.js（extractToken / requireAuth / requireAdmin）
│   └── validations/    quiz / socket / config / brandingConfig
├── dist/               Vite 构建产物 + 注入的汉化脚本
├── content/            branding.json / config.json / logo.png / title.png
└── data/               ← = 本仓库的 quizzle-data/data
```

### 3.3 请求链路（顺序敏感！）

```
浏览器
 ├─ SPA: dist/index.html + cn-progress.js + cn-ui-extra.js + zh-cn.js
 ├─ /school/*  → 教师后台页面
 └─ /api/*     → REST
```

`server/index.js` 中中间件**挂载顺序**是功能正确性的前提：

```
/api/auth                                   基础教师账号
  ↓
teacher-first-login-guard                   强制首次登录改密
  ↓
/api/teacher-account, /api/school           组织架构 v2（三级）
  ↓
/api/admin, /api/branding, /api/quizzes, /api/media, /api/ai
  ↓
legacy-results-guard  →  /api/practice      旧数据越权拦截（必须在 practice 之前）
  ↓
/api/school-import                          文档导题
  ↓
/school/*   : one-site → class → scope → school
                             ↑
                      scope-api 必须早于 school  ← 否则班级范围校验失效
  ↓
/api/question-bank, /school/question-bank
```

**修改顺序会静默破坏权限**，不会报错。任何时候调整 `app.use(...)` 前，必须先说明影响面。

### 3.4 双身份体系

| | 教师 / 管理员 | 学生 |
|---|---|---|
| Cookie | `quizzle_token` | `school_token` |
| 存储 | **进程内存 `Map`** | 无状态 HMAC-SHA256（`session-secret`） |
| 有效期 | 7 天 | 12 小时 |
| 校验 | `validateToken()`，含 `sessionVersion` 版本失效 | `studentFrom()`，时序安全比较 |
| 数据源 | `data/users.json` | `data/school-accounts/accounts.json` |
| 密码算法 | `scrypt`（16B salt / 64B key） | `scrypt`（N=16384,r=8,p=1） |

**含义**：容器重启会让所有教师登录态失效；页面缓存里仍显示"已登录"但 API 返回 401 是预期现象。

### 3.5 数据持久化

- 全部为文件系统 JSON，**无数据库**
- 写入采用「临时文件 + `rename`」原子写（已实现，请沿用）
- **无文件锁**：并发写存在丢写窗口
- 学生账号上限 3000（`MAX`）
- `session-secret` 以 `mode 0o600`、`flag:'wx'` 创建，不应被覆盖

---

## 4. 补丁注入系统（本仓库最需要小心的部分）

### 4.1 工作方式

校级功能**不是**直接改源码，而是：

```
data/<xxx-package>/install-*.js
   ├─ check   → 校验目标文件哈希，判断能否套用（只读，安全）
   ├─ apply   → 把原文件复制进 .<xxx>_backup/，写入 manifest.json，再精确替换
   └─ restore → 从 manifest 还原
```

注入点有两类：
1. **服务端**：向 `server/index.js` 插入带标记注释的路由行，例如
   `/* QUIZZLE_QUESTION_BANK_V1 */`、`/* SCHOOL_ORGANIZATION_V2 */`、`/* SCHOOL_RESULTS_GUARD_V1 */`
2. **前端**：向 `dist/index.html` 插入 `<script>` 标签，脚本本体放在 `dist/*.js`

所有补丁可用 `grep -rn "MARKER\|/* QUIZZLE_\|/* SCHOOL_"` 定位。

### 4.2 补丁包清单

| 目录 | 安装器 | 职责 |
|---|---|---|
| `one-site-package/` | `install-one-site.js` | 教师单站导航与路由 |
| `school-package/` | `install-school.js`、`patch-password-policy.js` | 学生账号、练习/考试流程 |
| `school-class-package/` | `install-classes.js` | 班级目录 |
| `school-roles-package/` | `apply-roles.js` | 任教班级范围、成绩页 |
| `school-org-v2-package/` | `install-organization-v2.js` | 学部→年级→班级三级组织、教师首登守卫 |
| `school-code-compat/` | `apply-code-fix.js` | 4 位测验码兼容 |
| `school-delete-package/` | `install-delete.js` | 学校删除 |
| `school-brand-package/` | — | 品牌定制 |
| `school-teacher-ui-v2/` | `install-teacher-ux.js` | 教师端 UI v2 |
| `question-bank-package/` | `install-question-bank.js` | 题库与智能组卷 |
| `question-import-package/` | `install-import.js` | Word/Excel 导题 + 媒体归档 |
| `teacher-login-patch/` | `patch-login.js` | 登录路由改写 |
| `teacher-cookie-patch/` | `fix-teacher-cookie.js` | 局域网 HTTP 下 Cookie 可用性 |
| `cn-*.js` | — | 汉化、进度、实时选项 |

### 4.3 操作补丁包的规则

1. **先 `check`，后 `apply`**。`check` 是只读的，永远先跑。
2. 永远不要绕过安装器手工编辑 `server/index.js` 或 `dist/index.html`——`manifest.json` 里的哈希会失配，之后该补丁**永久无法 check/apply**。
3. 若 `check` 报告哈希不匹配：**停下**，报告用户，不要"修正"manifest。
4. 已存在 `manifest.json.stale-*` 残留，说明历史上发生过版本错乱。看到 `stale-*` 时不得删除，先报告。
5. `restore` 只回滚**代码**，不删除业务数据（题库、账号、成绩保留）。
6. 任何 `apply` / `restore` 之后都需要重启容器才生效。
7. 上游 Quizzle 升级会**整体破坏**补丁链。升级前必须先把补丁固化成源码（见 §7）。

---

## 5. 数据模型速查

```
data/
├── users.json                         教师/管理员（users[].role ∈ admin|teacher）
├── branding/config.json               品牌 + AI provider 配置（含 apiKey 字段，脱敏处理）
├── quizzes/*.quizzle                  前端创建的测验（pako 压缩）
├── practice-quizzes/<CODE>/           已发布自主测验：meta.json + quiz.quizzle + results/
├── question-bank/questions.json       题库
├── question-bank/media/               题目媒体
└── school-accounts/
    ├── accounts.json                  学生账号（accounts[].hash）
    ├── classes.json                   班级目录
    ├── organization.json              学部/年级/班级树（version 2）
    ├── assignments.json               测验任务（code / className / ownerId / mode）
    ├── teacher-classes.json           教师 → 班级授权（grants[userId] = [className]）
    ├── session-secret                 学生 token HMAC 密钥（600）
    ├── delete-audit.jsonl             删除审计日志
    ├── media/                         学生端媒体
    └── attempts/<CODE>/               答题记录
```

**权限模型要点**（`school-roles-package/scope-api.js`）：
- `inScope(teacher, className)` — 教师只能操作被授权的班级；`admin` 放行
- `owned(teacher, assignment)` — `ownerId` 匹配且班级在范围内
- 每个 `/api/school/admin/*` 请求都先过 `auth()`；写请求另过 `onlyJson()`（Origin 校验 + 强制 JSON）

---

## 6. 常见任务指引

### 6.1 阅读应用源码

源码在 tarball 内，需要先解包到**临时目录**（不要解到仓库里）：

```bash
# 在临时目录操作，用完即弃
mkdir -p /tmp/qzimg /tmp/rootfs
tar -xf quizzle-image.tar -C /tmp/qzimg
# 按 manifest.json 的 layers 顺序逐个解压到 /tmp/rootfs
```

解包后工作目录为 `/tmp/rootfs/quizzle`。

### 6.2 恢复整套系统

```bash
docker load -i quizzle-image.tar
docker volume create quizzle-data
# 将 quizzle-data/data/ 的内容灌入卷
docker run -d --name quizzle \
  -p 6412:6412 \
  -v quizzle-data:/quizzle/data \
  --restart unless-stopped \
  quizzle-backup:<TAG>
```

> 镜像 tag 与原始容器所用父镜像 `sha256:039a65eb…` 不同。恢复得到的是"备份时刻的父镜像 + 当日叠加层"，**不会**还原原始 tag。

### 6.3 验证备份完整性

```bash
sha256sum -c SHA256SUMS.txt
```

### 6.4 排查"页面旧版本"

PWA Service Worker（`dist/sw.js`）precache 了 `index.html` 与全部 assets。补丁改了 `dist/` 但 `sw.js` 的 revision 未更新时，用户会持续看到旧页面。这是已知行为，不要试图通过删除 `sw.js` 解决。

---

## 7. 已知结构性约束

1. **无法复现构建**。没有 Dockerfile，只有容器快照。任何"重新部署"都依赖 `quizzle-image.tar`。
2. **补丁链脆弱**。约 20 个补丁串行叠加在 `server/index.js` 与 `dist/index.html` 上，哈希校验强绑定。
3. **教师会话在内存**。重启即全员掉线。
4. **无数据库、无文件锁**。并发写有丢写风险。
5. **单机单容器**。无反向代理、无 TLS、无水平扩展。
6. **`users.json` 部分字段可能缺失**（如 `active` / `sessionVersion`），代码通过 `|| 1`、`!== false` 兜底。修改用户数据时必须保持这种容错语义。

若被要求"把系统整理成可构建仓库"，正确方向是**把补丁合并进源码**并用 Dockerfile 构建，而不是继续叠加新补丁——但这是重大变更，需先取得明确授权。

---

## 8. 变更流程（当用户授权改动时）

1. **说明**：要改什么文件、为什么、影响哪些路径、如何回滚
2. **确认**：获得用户明确同意
3. **备份**：变更前复制到带时间戳的备份目录，并写 `manifest.json`（含 `shaBefore`）
4. **最小化**：只做必要改动；不顺手重构、不批量格式化
5. **验证**：优先只读验证（`check` 模式、`node --check`、`grep` 断言），不要直接 `docker restart`
6. **报告**：列出改动、验证结果、遗留风险

**除非用户明确要求，不要：**
- 运行任何会重启容器的命令
- 修改认证 / 限流 / 密码策略 / 权限判断
- 清理 `.xxx_backup` 目录或 `stale-*` 文件
- 重写 `server/index.js` 的中间件顺序

---

## 9. 沟通约定

- 默认使用**中文**回复
- 涉及身份、地址、测验码时使用占位符
- 报告问题时给出「文件路径 + 行号 + 现象」，避免泛化描述
- 不确定时**提问**，不要猜测后直接动手
