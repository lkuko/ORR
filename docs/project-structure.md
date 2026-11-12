# 工程结构

本仓库是微信云开发版 ORR。小程序、云函数、管理网页各有清晰的运行边界。

```text
ORR2.0/
├── miniprogram/                     微信原生小程序
│   ├── app.js / app.json / app.wxss  启动、页面注册和全局样式
│   ├── pages/                       10 个业务页面：跑腿、订单、论坛、我的、举报及举报记录
│   ├── components/                  任务卡片、状态标识、空状态
│   ├── services/                    页面调用的云函数适配层
│   ├── utils/                       环境映射、校验、展示格式
│   └── assets/tabbar/               底部导航图标
├── cloudfunctions/campus-api/       唯一业务云函数部署单元
│   ├── index.js                     云端入口，读取可信身份
│   ├── app.js                       action 分发、权限、事务和幂等
│   ├── modules/                     users、tasks、messages、forum、reports、admin
│   ├── lib/                         数据库适配、内容检查、校验、视图裁剪
│   └── package.json / config.json   云端依赖和内容安全权限
├── admin/                           独立 Vue 管理网页
│   └── src/                         CloudBase 登录、操作界面和调用层
│       ├── components/             共用图标、编号展示与复制
│       └── presentation.js         类型、状态、时间和审计说明展示
├── database/                        集合、字段、索引和客户端权限声明
├── scripts/                         项目检查、云函数打包、真实云冒烟
├── tests/                           本地业务、小程序及管理台回归测试
├── docs/                            架构、部署、验收和前端设计
├── project.config.json             微信开发者工具项目配置
└── package.json                    本地验证入口
```

页面只能通过 `miniprogram/services/` 调用 `campus-api`。云函数的 `modules/` 放业务动作，`lib/` 放跨模块的存储、校验、内容安全和响应裁剪。所有数据库集合对客户端直读写关闭；管理网页也调用云函数，管理员角色由云端根据可信 uid 核对。

`scripts/build-cloud.cjs` 将模块化源码打包到被 Git 忽略的 `.local/deploy/campus-api/`，这个目录才是部署输入。`database/collections.json` 是集合和索引的声明，云端实际状态还须按 `docs/cloudbase-setup.md` 核验。`.local/` 保存一次性运维程序和本地验收结果，不进入版本控制。

新功能按运行端放到对应目录；新增业务动作优先进入现有 `modules/` 文件。只有出现独立的部署、权限或扩缩容需求时才拆出新的云函数。
