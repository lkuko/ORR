# 校园互助小程序

微信原生 JS 小程序 + Node.js/Express API + MySQL + Vue 3 管理后台。小程序开发工具打开仓库根目录；服务端和管理后台是独立 npm 工程。

代码框架目录、模块职责和入口见 [docs/project-structure.md](docs/project-structure.md)。

## 本机预览

1. PowerShell 执行 ./scripts/start-local-db.ps1。脚本在忽略目录 .local/ 初始化本项目专用 MySQL，监听 127.0.0.1:13306，不连接或修改本机其他 MySQL 实例。
2. 执行 npm --prefix server run migrate 建表，再执行 npm --prefix server run create-admin -- admin '<自行设置的本地密码>' 创建本地管理账号；不要把实际密码写入仓库。
3. 在一个 PowerShell 窗口运行 npm --prefix server run dev；另一个窗口运行 npm --prefix admin run dev。
4. 管理后台地址为 http://localhost:5173。微信开发者工具打开本仓库，当前开发版已设为 api 模式，使用真实微信身份登录本机后端；任务、帖子、评论和举报保存到项目专用 MySQL。举报可在网页管理后台处理。

接口可用 GET http://127.0.0.1:3000/health 检查。微信开发者工具中启用“不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书”。真实微信登录联调需填写服务端 AppID/Secret，并设置 WECHAT_LOGIN_MODE=wechat 和 CONTENT_CHECK_MODE=wechat；utils/config.js 中 developmentMode 已为 api。手机不能用电脑的 loopback 地址；同网络开发调试的待验收方案见下方内部测试说明，普通体验版和正式版仍需准备符合微信要求的 HTTPS API。

需要测试两个参与者时，可在独立开发环境将 developmentMode 改为 api-demo，并设置后端 WECHAT_LOGIN_MODE=demo；此时“我的”提供两个测试账号切换，数据保存到 MySQL。不具备微信内容检查身份的测试账号还需在该独立开发环境关闭内容检查。不要在真实身份联调或生产环境使用这组设置。

若仅看界面而不启动 API，可临时将 developmentMode 改为 demo；此时数据只在模拟器本机保存，与 API 数据库不互通。体验版、正式版以及无法识别的环境均禁用两种测试登录/数据模式。

本机数据库停止方式：./scripts/stop-local-db.ps1。只会停止由 start-local-db.ps1 创建且 PID 和数据目录匹配的进程。

## 测试

~~~powershell
npm --prefix server test
npm --prefix server run test:integration
npm --prefix admin run build
~~~

管理后台开发服务通过 Vite 将 /api 转发到本机 3000 端口，生产默认请求同源 /api/v1。独立 API 域名可通过构建时的 VITE_API_BASE_URL 指定；容器的同源反向代理使用 API_UPSTREAM 指定后端地址。

集成测试只会连接以 _test 结尾的数据库，并在运行前清空该测试数据库中的表。它覆盖登录权限、任务校验、并发接单、地点与留言隔离、完成确认、取消争议、论坛评论、举报、下架和封禁。

## 当前阶段：已有服务器内部测试

当前复用已有阿里云服务器 `139.224.111.140`，拟通过 SSH 隧道连接开发电脑和同 Wi-Fi/热点测试手机；暂不新增云资源或配置公开发布域名。具体代码目录、只读检查、部署和隧道命令见 [docs/internal-testing.md](docs/internal-testing.md)。

独立部署使用 `deploy/internal.compose.yaml`，包含 API、MySQL 和同源管理后台；云端入口只映射到 `127.0.0.1:18080`。已在现有服务器运行并通过健康检查、备份恢复；已授权暂停的 5 个 ARL 容器保留数据。开发版小程序当前经电脑 `10.100.167.235:18080` 的 SSH 隧道访问云端，后台地址为 `http://127.0.0.1:18080`。手机浏览器连通、微信开发调试登录和发布测试任务已验证；换网络时需更新电脑 LAN 地址和隧道。普通体验版、正式版仍不能依赖此 HTTP 地址。

更换小程序 AppID 时，先更新本机 `server/.env` 与 `project.config.json`，再运行 `./scripts/rotate-cloud-wechat.ps1` 将微信凭证轮换到现有云端 API；步骤和回滚说明见 [docs/internal-testing.md](docs/internal-testing.md)。旧 AppID 下的订单不会自动归属新 AppID 的账号。

## 后续公开试运营配置

- 给服务端复制 server/.env.example 为 server/.env，配置正式 AppID/Secret、至少 32 字节随机 TOKEN_SECRET 和数据库账号。生产环境拒绝演示登录与关闭内容安全检查。
- 数据库迁移使用 npm --prefix server run migrate；首个管理员通过 npm --prefix server run create-admin -- <账号> <至少12位密码> 单独创建。不要把 .env 或真实凭证提交到 Git。
- 在 utils/config.js 中替换体验版、正式版 HTTPS API 域名；体验版和正式版不使用本地演示数据。
- 生产建议部署两份无状态 API、云负载均衡和高可用托管 MySQL；管理后台静态资源可部署到 HTTPS 静态站点。大陆服务器需准备已备案域名，并将 API 域名加入小程序合法请求域名。

具体步骤见 docs/operations.md 和 docs/api.md。

后续公开试运营的阿里云资源方案和 Compose 部署步骤见 [docs/aliyun-deployment.md](docs/aliyun-deployment.md)，不属于本轮新增资源采购。当前验收结果与未完成事项见 [docs/acceptance.md](docs/acceptance.md)。

本地可运行 `./scripts/verify-project.ps1` 一并检查小程序结构、后端单元/集成测试和后台构建；加上 `-WxmlCompiler <wcc.exe路径>` 可验证原生 WXML 编译。上线前另运行 `node scripts/check-miniprogram.cjs --release` 检查真实 HTTPS API 配置。
