# 代码框架目录

本文对应当前仓库的实际文件。小程序沿用微信 JS 基础模板的根目录；`server/` 是 Express 后端，`admin/` 是 Vue 3 管理后台。三个部分共享仓库，分别运行。

```text
ORR/
├── app.js                         # 小程序入口、全局登录状态
├── app.json                       # 页面注册、底部导航、窗口设置
├── app.wxss                       # 小程序全局样式
├── project.config.json            # 微信开发者工具配置、打包排除项
├── project.private.config.json    # 本机开发工具配置，不提交 Git
├── sitemap.json                   # 小程序页面索引规则
│
├── pages/                         # 小程序页面
│   ├── tasks/
│   │   ├── list/index.*            # 跑腿大厅、分类与标题/区域搜索
│   │   ├── detail/index.*          # 任务详情、接单、完成、取消、订单留言
│   │   └── create/index.*          # 发布任务、报酬、公开区域与精确地点
│   ├── orders/list/index.*         # 我发布的 / 我接取的任务、状态筛选
│   ├── forum/
│   │   ├── list/index.*            # 校园圈列表
│   │   ├── detail/index.*          # 帖子详情、文字评论
│   │   └── create/index.*          # 发布文字帖子
│   ├── profile/index/index.*      # 个人页、昵称、演示账号切换
│   ├── report/create/index.*      # 举报表单
│   ├── index/                     # 保留的原 JS 模板首页，未注册为业务页面
│   └── logs/                      # 保留的原 JS 模板日志页，未注册为业务页面
│
├── components/                    # 小程序公共组件
│   ├── task-card/index.*           # 任务卡片
│   ├── status-tag/index.*          # 状态标签
│   └── empty-state/index.*         # 空列表提示
├── assets/
│   └── tabbar/                     # 原生底部导航 normal/active PNG 图标
├── services/                      # 小程序数据访问层
│   ├── request.js                  # HTTP 请求、令牌附加、错误转换
│   ├── auth.js                     # 登录与昵称修改
│   ├── tasks.js                    # 任务、状态操作、订单留言
│   ├── orders.js                   # 订单列表接口封装
│   ├── forum.js                    # 帖子与评论
│   ├── reports.js                  # 举报提交
│   └── demo-store.js               # 单机演示数据，仅开发版可使用
├── utils/
│   ├── config.js                   # 演示/API 模式、各环境 API 地址
│   ├── format.js                   # 任务状态、类别、时间与金额格式
│   ├── validate.js                 # 前端表单校验
│   ├── task-ui.js                  # 订单提示语与前端状态筛选
│   └── util.js                     # 保留的模板工具
│
├── server/                        # Node.js + Express + MySQL 后端
│   ├── package.json                # 后端依赖、启动与测试命令
│   ├── package-lock.json           # 依赖锁定
│   ├── .env.example                # 配置样例，不包含真实凭证
│   ├── .env                        # 本机私有配置，不提交或上传
│   ├── src/
│   │   ├── server.js               # 进程入口、监听端口
│   │   ├── app.js                  # Express 应用、路由注册、中间件
│   │   ├── config/env.js           # 环境变量读取、生产配置检查
│   │   ├── db/
│   │   │   ├── pool.js             # MySQL 连接池
│   │   │   ├── migrate.js          # 数据库迁移入口
│   │   │   └── migrations/001_initial.sql # 初始业务表
│   │   ├── middleware/
│   │   │   ├── authenticate.js     # 用户与管理员身份、封禁状态检查
│   │   │   ├── error-handler.js    # 统一错误响应
│   │   │   └── request-log.js      # 请求编号、状态与耗时日志
│   │   ├── modules/
│   │   │   ├── auth/router.js      # 微信登录、管理员登录、昵称修改
│   │   │   ├── tasks/
│   │   │   │   ├── router.js       # 任务及订单 API 路由
│   │   │   │   ├── service.js      # 业务规则、权限、任务状态流转
│   │   │   │   └── repository.js   # SQL、事务、行锁、返回字段过滤
│   │   │   ├── forum/router.js     # 帖子与评论 API
│   │   │   ├── reports/router.js   # 举报 API
│   │   │   └── admin/router.js     # 内容下架、封禁、争议处理、审计
│   │   ├── lib/
│   │   │   ├── content-guard.js    # 微信文本内容安全检查
│   │   │   ├── tokens.js           # 会话令牌签发与校验
│   │   │   ├── passwords.js        # 管理员密码哈希
│   │   │   ├── validation.js       # 参数校验
│   │   │   └── errors.js           # HTTP 业务错误、异步路由包装
│   │   └── scripts/
│   │       ├── setup-local.js      # 配置本项目隔离开发数据库
│   │       ├── create-admin.js     # 创建或重置管理员
│   │       └── test-integration.js # 运行测试库迁移与 HTTP 集成测试
│   └── tests/
│       ├── unit/                   # 令牌、密码、内容安全检查测试
│       └── integration/api.test.js # MySQL + HTTP 完整流程与权限测试
│
├── admin/                         # Vue 3 + Vite 独立网页管理后台
│   ├── package.json
│   ├── package-lock.json
│   ├── index.html                  # 管理页面 HTML 入口
│   ├── vite.config.js              # 开发服务与构建配置
│   ├── default.conf.template       # 容器内同源 API 反向代理
│   └── src/
│       ├── main.js                 # Vue 应用入口
│       ├── App.vue                 # 登录、举报、争议、用户和日志界面
│       ├── api.js                  # 管理 API 请求封装
│       └── style.css               # 管理后台样式
│
├── scripts/
│   ├── start-local-db.ps1          # 启动并校验项目专用 MySQL 13306
│   ├── stop-local-db.ps1           # 停止本项目数据库进程
│   ├── check-miniprogram.cjs       # 小程序结构、依赖及发布配置检查
│   ├── inspect-cloud.ps1          # 发起云服务器只读检查，密码在终端输入
│   ├── copy-cloud-backup.ps1       # 复制已验证的云端数据库备份并校验 SHA-256
│   ├── inspect-server.sh          # Linux 系统、资源、端口与 Docker 检查
│   ├── open-internal-tunnel.ps1    # 本机 / 同 Wi-Fi 手机连接云端的 SSH 隧道
│   ├── prepare-internal-release.ps1 # 本机构建后台并准备源码包
│   ├── prepare-internal-release.cjs # 白名单打包与文件校验清单
│   ├── prepare-internal-secrets.cjs # 在受限目录生成私有上传包
│   ├── deploy-internal.ps1          # 终端密码认证后上传、校验并执行安装
│   ├── prepare-wechat-rotation.cjs  # 校验 AppID 并生成私有微信轮换包
│   ├── rotate-cloud-wechat.ps1      # 一次 SSH 认证后轮换云端微信凭证
│   ├── test-wechat-rotation.py      # 隔离测试轮换、失败恢复及手动回滚
│   └── verify-project.ps1          # 运行本地验收命令
├── deploy/
│   ├── api.Dockerfile              # 后端容器构建
│   ├── admin.Dockerfile            # 后台静态站点容器构建
│   ├── internal.compose.yaml       # 当前内测：单服务器 API + MySQL + 后台
│   ├── wechat.internal.env.example  # 可独立轮换的微信凭证样例
│   ├── internal.env.example        # 内测版本与服务器密钥目录样例
│   ├── server.internal.env.example # 内测令牌配置样例
│   ├── admin.internal.Dockerfile    # 内测后台：复用本机 dist，节省云端内存
│   ├── admin.internal.Dockerfile.dockerignore # 内测后台构建白名单
│   ├── install-internal.sh          # 首次云端安装、迁移及健康检查
│   ├── resume-arl.sh                # 恢复记录中原先运行的 ARL 容器
│   ├── verify-internal.sh           # 云端备份与隔离恢复验证，不清空业务库
│   ├── rotate-wechat.sh             # 云端微信凭证轮换与 API 健康检查
│   ├── rollback-wechat.sh           # 从轮换快照恢复原配置
│   ├── aliyun.compose.yaml         # 后续公开部署：单台 ECS 的应用部分
│   ├── aliyun.env.example          # 版本、私网绑定和配置文件路径样例
│   └── server.production.env.example # 生产 API 配置样例
├── docs/
│   ├── project-structure.md        # 本目录说明
│   ├── architecture.md             # 架构与业务边界
│   ├── api.md                      # API 路由说明
│   ├── operations.md               # 本地开发与通用部署说明
│   ├── internal-testing.md          # 当前已有服务器与 SSH 隧道内测步骤
│   ├── aliyun-deployment.md         # 后续公开试运营的阿里云部署步骤
│   └── acceptance.md                # 实际验收记录及未完成事项
├── .local/                        # 本机数据库、私密配置与日志；忽略
├── .agents/                       # 项目工作流技能，非应用代码
├── .gitignore
└── README.md                      # 项目说明与启动步骤
```

`index.*` 代表同名的四个文件：`index.js` 处理页面或组件逻辑，`index.wxml` 描述视图，`index.wxss` 定义样式，`index.json` 配置页面或组件。

## 页面与后端的连接方式

```text
pages/tasks/detail/index.js
  → services/tasks.js
  → services/request.js
  → HTTP /api/v1/tasks/:taskId/...
  → server/src/modules/tasks/router.js
  → service.js（身份与状态规则）
  → repository.js（事务和数据访问）
  → MySQL
```

目前任务模块按路由、业务、数据访问三层组织；论坛、举报等较小模块将处理逻辑放在各自 `router.js`。管理后台的视图集中在 `App.vue`。这些是当前真实结构，后续复杂度上升时再拆出独立 service、repository 或 Vue 页面文件。

任务本身作为 v1 的订单记录，订单列表复用 `tasks` 表；订单留言保存在 `task_messages`，状态变化保存在 `task_events`，目前不单独创建 `orders` 表。其余业务表包括 `users`、`admin_users`、`posts`、`comments`、`reports`、`admin_action_logs`。

## 开发时打开什么

- 微信开发者工具：打开仓库根目录 `E:\wechat\ORR`。
- API：在仓库根目录执行 `npm --prefix server run dev`。
- 管理后台：在仓库根目录执行 `npm --prefix admin run dev`。
- 当前开发版使用 `api`，以真实微信身份访问本机 API；数据持久化到 MySQL，能与管理后台联调。`api-demo` 是可选的双测试账号模式，`demo` 是纯本机演示模式。切换位置为 `utils/config.js`；真实登录需要配置服务端 AppID/Secret。
- `node_modules/`、`admin/dist/` 和 `.local/` 是安装、构建或运行时产生的目录，不属于需要手写的代码框架。
- `project.config.json` 排除了 `server/`、`admin/`、`deploy/`、`docs/`、`scripts/`、`.local/`、`.git/` 和 `.agents/`，避免后端配置及本机数据库进入小程序包。
