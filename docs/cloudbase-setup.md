# 微信云开发部署

文中的 `YOUR_CLOUDBASE_ENV_ID`、`YOUR_WECHAT_APPID`、`YOUR_CLOUDBASE_HOST` 均为占位符，执行前替换为自己的配置；仓库不包含实际环境标识或管理员凭据。

## 本机工具接入

2026-11-12 已按 <https://docs.cloudbase.net/skill.md> 安装官方 CloudBase 插件 `0.2.5`，包含 32 个技能，并更新 Codex 配置。插件的 MCP 需要重启 Codex 后加载；本轮没有把“安装成功”记作“MCP 登录成功”。

验收时使用的微信开发者工具技能版本为 `0.3.11`，客户端名称为 `Codex`。`.agents/` 现为本地可选工具目录，不随仓库分发，产品运行与构建不依赖它。工具曾完成环境读取、云函数部署、数据库索引写入与回读；新电脑需按官方文档安装工具并自行授权。写入返回确认任务时，应在开发者工具中确认后查询原任务结果，不能重复发起部署。

## 小程序

用微信开发者工具打开项目根目录。`project.config.json` 指定 `miniprogram/` 为小程序目录，`cloudfunctions/` 为云函数源码目录。

按 README 的首次配置步骤复制模板，并在 Git 忽略的 `project.private.config.json` 填写 AppID，在 `miniprogram/utils/environments.local.js` 填写开发版与体验版的环境 ID。私有 AppID 覆盖共享项目配置中的占位符。正式环境尚未绑定；发布前必须在本地环境映射中配置独立 `release` 环境，并运行 `node scripts/check-project.cjs --release`。

## 业务云函数

```powershell
npm ci
npm --prefix admin ci
npm --prefix cloudfunctions/campus-api ci
npm --prefix cloudfunctions/media-callback ci
npm run verify
node scripts/build-cloud.cjs

& 'E:\微信web开发者工具\wechatide.cmd' -c Codex cloud_fn_deploy `
  --appid YOUR_WECHAT_APPID `
  --env YOUR_CLOUDBASE_ENV_ID `
  --path 'E:\wechat\ORR2.0\.local\deploy\campus-api' `
  --remote-npm-install
```

上面的命令部署 campus-api；随后以相同 AppID 和 env ID，将 path 改为 `.local/deploy/media-callback`，再完整部署回调函数。默认打包脚本生成两个自包含目录，SDK 在云端安装。不能直接部署源码目录；media-callback 源码引用了兄弟目录的数据库适配，未经打包会缺少依赖。

打包脚本从 `WECHAT_APP_ID` 环境变量或 `project.private.config.json` 的 `appid` 读取绑定值，并仅注入被 Git 忽略的部署产物；缺失或仍为占位符时停止构建。直接运行未打包的云函数源码则需要在云函数环境变量中设置 `WECHAT_APP_ID`，不能使用客户端传入的 AppID 代替服务端绑定配置。

2026-11-12 实测运行时为 `Nodejs16.13`，函数状态 `Active`，超时 20 秒。运行时变更要回读实际配置并执行健康检查，不能仅凭更新请求成功判断。事务本身遵守平台 10 秒限制。

`campus-api/config.json` 声明 `security.msgSecCheck` 和 `security.mediaCheckAsync`。本项目实测可在微信开发者工具的云函数增量上传界面选择源码 `config.json` 执行“更新文件”，使 `mediaCheckAsync` 权限同步生效；完整部署也可以同步配置。单独更新 JS 代码不代表接口权限已更新。`-604101` 表示函数无接口权限；官方说明权限可能缓存约 10 分钟，应核对配置上传结果并等待权限生效，不要循环重部署或关闭审核。参考：[微信云调用](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/guide/openapi/openapi.html)。没有明确 `pass` 时拒绝发布内容。

### 图片审核消息推送

1. 云存储设为 PRIVATE；六个新集合及其索引/规则创建后，再进行真实图片测试。
2. 在微信开发者工具「云开发控制台 → 设置 → 其他设置 → 消息推送」新增或核对规则：云函数模式，`MsgType=event`、`Event=wxa_media_check`，指向 `media-callback` 并启用。
3. 从真实微信身份调用 `media.upload` 上传无害测试图；必须获得真实 trace，不手工写 media_checks 或伪造回调。
4. 回读 media_assets 与 media_checks，再调用 media.status 确认状态。平台审核消息的 SDK 上下文 `SOURCE` 必须为 `wx_callback`；调用参数自称该来源不能替代运行时身份。回调为空、来源错误或 AppID 不符时应被拒绝；函数显示 Active 只证明就绪，不证明回调已收到。
5. 用户侧待审核期间显示状态，异常保留重试入口；全部图片通过前禁止发布。原始图片、临时链接、openid、完整事件及平台凭据不得记录到普通日志。

2026-11-13 实际回读发现平台审核事件来源为 `wx_callback`，处理器原先错误接受 `wx_trigger`，导致真实 `pass` 未落正式审核记录。修复后重新打包部署 `media-callback`，回读为 Active；通过已有未绑定商品的测试资产执行真实审核重试，`media_checks` 生成 `PASSED`，`media.status` 返回 `PASSED`。小程序调用伪造审核事件返回 `accepted: false`。测试探针没有创建公开商品；详细范围见验收记录。两个函数回读为 Active、Nodejs16.13、20 秒超时。

## 云数据库

按 `database/collections.json` 建立 16 个集合和声明索引。全部集合配置客户端读写禁止（控制台 `ADMINONLY`）。云函数在高权限数据库访问之外另行核对身份和业务权限。

集合声明中的 `environment` 是占位符，实际部署环境由工具参数指定，不要把真实标识写回该文件。

原 10 个集合曾逐个回读规则，并验证小程序 SDK 直读拒绝、直写 users 拒绝。2026-11-13 新增六个集合和索引已创建回读，全部为 ADMINONLY，存储为 PRIVATE；新增资源的运行时权限验收另行记录。重建环境后必须重新核验，不能只检查本地声明文件。

本轮已新增并通过 `listIndexes` 回读确认 `reports.reporter_history`：`reporterId ASC, createdAt DESC`。客户端通过 `reports.mine` 读取本人举报；云函数从可信微信身份确定举报人，不接受客户端指定查询其他人。

## 管理网页

`admin/` 使用 Vue 和 CloudBase 用户名密码认证。可信 uid 对应的 `admin_users` 文档 ID 为 SHA-256(`admin`、空字节分隔符、uid)，角色要求 `role=ADMIN` 且 `status=ACTIVE`。业务接口不提供角色授予动作。

首次从 `admin/.env.example` 复制出 `admin/.env.local` 并填写 `VITE_CLOUDBASE_ENV`。启动和构建都会拒绝空值及示例占位符，不再回退到固定测试环境。

```powershell
npm --prefix admin run dev
npm --prefix admin run build
```

本地入口：`http://127.0.0.1:5173`。静态产物：`admin/dist/`，部署到云开发静态托管的 `orr-admin/` 路径，保留平台的 `__auth/` 等其他文件。构建使用相对资源路径。

### 管理台发布流程

本地开发服务直接读取源码；线上只读取静态托管文件。GitHub 的提交或合并不会自动更新网站。管理台代码变更后，使用以下流程单独发布（当前已验证 CloudBase CLI `3.9.2`）：

```powershell
# 首次或登录过期时，在浏览器完成授权；不在命令中填写永久密钥
npx --yes --package @cloudbase/cli@3.9.2 tcb login --intl false

npm run verify

# 限定到已有测试环境与 orr-admin 路径；先备份，入口文件最后上传
npx --yes --package @cloudbase/cli@3.9.2 tcb hosting deploy ./admin/dist orr-admin `
  --env-id YOUR_CLOUDBASE_ENV_ID --safe --verify --entry index.html --json

# 从实际访问地址读取 HTML、JS、CSS，逐个比较 SHA-256
node scripts/check-admin-hosting.cjs 'https://YOUR_CLOUDBASE_HOST/orr-admin/index.html'
```

发布时不使用 `--prune`，保留旧资源及其他站点文件。CLI 返回的 `backupPrefix` 用于定位本次备份；本机保留发布回执。`check-admin-hosting.cjs` 检测到入口或资源缺失、不一致时返回非零退出码；必须通过第一个参数或 `ORR_ADMIN_URL` 环境变量提供实际 URL，脚本不内置站点地址。

版本一致后，还需在浏览器检查登录、举报筛选、用户与审计数据读取。若 CDN 节点尚未刷新，先核对线上资源版本，再刷新浏览器，不把所有差异归因于缓存。

2026-11-12 已将新版管理台发布到现有 `orr-admin/`：3 个文件上传成功，CLI 远端校验通过，实际访问地址的 `index.html`、`assets/index-CbEITrSu.js` 和 `assets/index-W1dkNyu8.css` 与本地构建逐字节一致。此次没有更新业务云函数或小程序体验版。

入口格式：`https://YOUR_CLOUDBASE_HOST/orr-admin/index.html`。实际地址请在静态托管控制台查看。测试域名首次浏览会显示腾讯云访问提示；通过页面的“确定访问”后可进入管理台。

管理员账号已通过短时受限初始化创建，凭据保存在本机 `.local/admin-credentials.json`，不进入 Git。真实网页登录、云端管理员角色和举报队列读取已经验证。上线前应由账号持有人设置自己的密码。

环境初始化使用过的 `orr-setup` 临时云函数已删除。原版本只有 campus-api；二手版本增加 media-callback。不要把 `.local/` 中的一次性初始化程序部署为长期入口。

## 验证与上传

微信开发者工具开启自动化后，可执行 `node scripts/cloud-smoke.cjs`。它使用工具当前真实账号，在测试环境新建并取消明确标注的验收任务，检查内容安全、幂等、公开地点裁剪、非管理员拒绝和数据库直接访问拒绝。

原重构版本 `2.0.0-cloudbase.1` 已上传。2026-11-12 本轮生成了新版预览二维码，但未上传新的体验版。项目 URL 检查开启，`app.debug=false`。两个真实账号关闭调试、跨网络的验收结果记录在 `docs/acceptance.md`；配置检查不替代真机验收。
