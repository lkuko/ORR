# 微信云开发部署

测试环境：`orr-d0gvuc3liba01ebf1`。AppID：`wxe8c489bc30b7340f`。

## 本机工具接入

2026-11-12 已按 <https://docs.cloudbase.net/skill.md> 安装官方 CloudBase 插件 `0.2.5`，包含 32 个技能，并更新 Codex 配置。插件的 MCP 需要重启 Codex 后加载；本轮没有把“安装成功”记作“MCP 登录成功”。

项目级 `.agents/skills/wechatide-skill/` 为 `0.3.11`。当前官方入口为 `E:\微信web开发者工具\wechatide.cmd`，客户端名称固定 `Codex`。本机会话已经用户首次授权，登录未过期、技能版本匹配；工具实际列出了目标环境，并完成云函数部署、数据库索引写入与回读。写入返回确认任务时，应在开发者工具中确认后查询原任务结果，不能重复发起部署。

## 小程序

用微信开发者工具打开项目根目录。`project.config.json` 指定 `miniprogram/` 为小程序目录，`cloudfunctions/` 为云函数源码目录。

开发版与体验版使用上述测试环境。正式环境尚未绑定；发布前必须在 `miniprogram/utils/config.js` 配置独立正式环境，并运行 `node scripts/check-project.cjs --release`。

## 业务云函数

```powershell
npm ci
npm --prefix admin ci
npm --prefix cloudfunctions/campus-api ci
npm run verify
node scripts/build-cloud.cjs

& 'E:\微信web开发者工具\wechatide.cmd' -c Codex cloud_fn_deploy `
  --appid wxe8c489bc30b7340f `
  --env orr-d0gvuc3liba01ebf1 `
  --path 'E:\wechat\ORR2.0\.local\deploy\campus-api' `
  --remote-npm-install
```

部署输入必须是 `.local/deploy/campus-api/`，其中业务代码合并成独立入口，SDK 在云端安装。当前微信工具的目录式部署曾导致云端缺失相对依赖，打包步骤用于避免该问题。

2026-11-12 实测运行时为 `Nodejs16.13`，函数状态 `Active`，超时 20 秒。运行时变更要回读实际配置并执行健康检查，不能仅凭更新请求成功判断。事务本身遵守平台 10 秒限制。

`config.json` 声明 `security.msgSecCheck` 权限。没有明确 `pass` 时拒绝发布内容。

## 云数据库

按 `database/collections.json` 建立 10 个集合和声明索引。全部集合配置客户端读写禁止（控制台 `ADMINONLY`）。云函数在高权限数据库访问之外另行核对身份和业务权限。

当前集合已创建，权限已逐个回读；小程序 SDK 直接读取 10 个集合均返回权限拒绝，直接写 `users` 同样拒绝。重建环境后必须重新核验，不能只检查本地声明文件。

本轮已新增并通过 `listIndexes` 回读确认 `reports.reporter_history`：`reporterId ASC, createdAt DESC`。客户端通过 `reports.mine` 读取本人举报；云函数从可信微信身份确定举报人，不接受客户端指定查询其他人。

## 管理网页

`admin/` 使用 Vue 和 CloudBase 用户名密码认证。可信 uid 对应的 `admin_users` 文档 ID 为 SHA-256(`admin`、空字节分隔符、uid)，角色要求 `role=ADMIN` 且 `status=ACTIVE`。业务接口不提供角色授予动作。

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
  --env-id orr-d0gvuc3liba01ebf1 --safe --verify --entry index.html --json

# 从实际访问地址读取 HTML、JS、CSS，逐个比较 SHA-256
node scripts/check-admin-hosting.cjs
```

发布时不使用 `--prune`，保留旧资源及其他站点文件。CLI 返回的 `backupPrefix` 用于定位本次备份；本机保留发布回执。`check-admin-hosting.cjs` 检测到入口或资源缺失、不一致时返回非零退出码；可以用第一个参数指定其他管理台 URL。

版本一致后，还需在浏览器检查登录、举报筛选、用户与审计数据读取。若 CDN 节点尚未刷新，先核对线上资源版本，再刷新浏览器，不把所有差异归因于缓存。

2026-11-12 已将新版管理台发布到现有 `orr-admin/`：3 个文件上传成功，CLI 远端校验通过，实际访问地址的 `index.html`、`assets/index-CbEITrSu.js` 和 `assets/index-W1dkNyu8.css` 与本地构建逐字节一致。此次没有更新业务云函数或小程序体验版。

已部署入口：<https://orr-d0gvuc3liba01ebf1-1530627261.tcloudbaseapp.com/orr-admin/index.html>。测试域名首次浏览会显示腾讯云访问提示；通过页面的“确定访问”后可进入管理台。

管理员账号已通过短时受限初始化创建，凭据保存在本机 `.local/admin-credentials.json`，不进入 Git。真实网页登录、云端管理员角色和举报队列读取已经验证。上线前应由账号持有人设置自己的密码。

环境初始化使用过的 `orr-setup` 临时云函数已删除；云函数列表已回读确认只剩 `campus-api`。不要把 `.local/` 中的一次性初始化程序部署为长期入口。

## 验证与上传

微信开发者工具开启自动化后，可执行 `node scripts/cloud-smoke.cjs`。它使用工具当前真实账号，在测试环境新建并取消明确标注的验收任务，检查内容安全、幂等、公开地点裁剪、非管理员拒绝和数据库直接访问拒绝。

原重构版本 `2.0.0-cloudbase.1` 已上传。2026-11-12 本轮生成了新版预览二维码，但未上传新的体验版。项目 URL 检查开启，`app.debug=false`。两个真实账号关闭调试、跨网络的验收结果记录在 `docs/acceptance.md`；配置检查不替代真机验收。
