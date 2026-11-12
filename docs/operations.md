# 运维

## 本地开发

Windows 环境可使用 scripts/start-local-db.ps1 启动隔离的本地 MySQL 实例，服务端和管理台按根目录 README 的命令运行。utils/config.js 当前使用 api，真实微信登录后访问本机 API 并保存到 MySQL；api-demo 可用于独立开发环境的两个测试账号联调，demo 模式只用于界面走查。体验版和正式版强制使用真实微信登录；服务端生产模式拒绝测试登录与关闭内容检查。

## 当前内部测试

复用已有云服务器、同 Wi-Fi/热点开发调试的步骤见 [internal-testing.md](internal-testing.md)。使用独立 `campus-internal` Compose 项目和数据库；入口只映射到服务器 loopback，通过 SSH 隧道访问，不另行购买资源。服务器和真机尚需验收。

## 后续公开试运营部署

1. 购买并备案域名，签发 TLS 证书；将 API HTTPS 域名配置进小程序合法请求域名。
2. 创建私网高可用 MySQL，限制网络来源，仅允许 API 安全组访问，启用自动备份和恢复演练。
3. 创建生产 server/.env，设置 NODE_ENV=production、BIND_HOST=0.0.0.0、按实际路径设置 TRUST_PROXY_HOPS（本文 ALB → Nginx → API 为 2）、微信 AppID/Secret、随机令牌密钥及数据库凭证。生产启动会拒绝 demo 登录、关闭内容审核或不安全 WEB_ORIGIN。仅受控 SSH 内测配置显式允许 loopback HTTP 管理来源；公开部署不启用该例外。
4. 执行数据库迁移，创建独立管理员账号；构建管理台并部署至 HTTPS 静态站点或 Nginx。
5. 部署两份 API 容器到私网实例并挂入负载均衡。配置健康检查路径 /ready；外部存活检查使用 /health。先在体验版验证登录、内容检查和请求域名，再向 20–50 名体验者开放。

API 每条请求输出请求 ID、路径、状态和耗时，不记录请求正文、登录凭证或任务地点。应监控 5xx、延迟、数据库连接、待处理举报和取消争议；恢复演练只针对生产备份副本进行。

容器构建上下文分别为 server/ 与 admin/，Dockerfile 位于 deploy/。生产编排、密钥和云资源必须在目标账号中配置，不应提交到仓库。

## 容器构建与入口

```sh
docker build -f deploy/api.Dockerfile -t campus-api:local ./server
docker build -f deploy/admin.Dockerfile -t campus-admin:local ./admin
```

后台容器默认请求同源 `/api/v1`；Nginx 将 `/api/` 转发到环境变量 `API_UPSTREAM`，默认 `http://api:3000`，因此部署时须将其改为所在网络可达的 API 地址，或将 API 服务命名为 `api`。两份 API 实例应由内部负载均衡统一提供该地址。外部 TLS 由云负载均衡或网关终止。API 的 WEB_ORIGIN 应与后台的外部 HTTPS 地址一致，TRUST_PROXY_HOPS 按实际可信代理层数设置。

若后台与 API 使用不同公共域名，构建时传入 `--build-arg VITE_API_BASE_URL=https://实际API域名/api/v1`，并配置对应的后端 WEB_ORIGIN。Vite 的该变量在构建时写入静态文件，运行容器时修改它不会改变已构建页面。

`.dockerignore` 会排除本机 .env、依赖和日志；真实密钥通过运行环境或云密钥管理配置。本仓库不包含云账号、域名和生产凭证；Docker 镜像构建、云上运行和真实微信登录须在目标环境单独验收，不能以本地测试代替。
