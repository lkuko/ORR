# 阿里云公开试运营部署（后续阶段）

当前用户已提供一台现有阿里云服务器，先按 [内部测试方案](internal-testing.md) 验证，不新增本文资源。本文与 `deploy/aliyun.compose.yaml` 保留为后续公开试运营方案；没有购买或创建本文中的双节点、ALB 和 RDS 资源。资源规格是本项目的起配建议，最终可用规格和费用由所选地域的控制台确认。

## 部署拓扑与资源

```text
微信小程序 / 管理员浏览器
              │ HTTPS :443
              ▼
         公网 ALB（证书、域名）
           ┌──┴──┐
       ECS A     ECS B       同地域、不同可用区、同一 VPC
       :8080     :8080       Nginx + API；每台运行同一份 Compose
           └──┬──┘
              ▼
      私网 RDS MySQL 高可用系列
```

| 资源 | 本项目起配建议 | 需要填写的参数 |
| --- | --- | --- |
| 地域与网络 | 选择接近校园的地域；一个 VPC、两个可用区交换机 | 地域、VPC、交换机 ID |
| ECS | 两台，各 2 vCPU / 4 GiB，系统盘 40 GiB 起；Alibaba Cloud Linux 3 | 实例 ID、私网 IP、运维登录方式 |
| RDS MySQL | 8.0 高可用系列、多可用区；2 vCPU / 4 GiB、存储 50 GiB 起，按目标地域可选规格调整 | 私网连接地址、库名、专用账号 |
| ALB | 标准版，两个可用区；HTTPS 443，后端 HTTP 8080 | 实例、服务器组、证书和域名 |
| 域名与证书 | `api.自有域名` 与 `admin.自有域名`，证书覆盖实际域名 | DNS、HTTPS 证书和平台所需资料 |
| 出网 | ECS 需要访问微信接口和软件/镜像源；使用已配置的 NAT 或受控公网出网 | 出网方案、必要的微信后台配置 |

RDS 高可用系列提供主备节点，可跨可用区部署；本方案依赖云产品的故障切换能力，仍须在目标环境验收应用重连。两台应用节点只是本项目配置，不能单凭数量声称已达到某个 SLA。当前本机数据库为隔离的开发实例，云上 MySQL 8.0 仍须执行完整迁移与流程测试。

## 访问范围

- ALB 接收外部 HTTPS 请求；其服务器组指向两台 ECS 的私网 IP、8080 端口。
- ECS 的业务入口仅允许实际 ALB 转发和健康检查来源，不能开放为所有公网来源。按目标 ALB 实例显示的来源地址配置；不要照搬其他类型负载均衡的固定网段。
- Compose 默认只绑定 `127.0.0.1`。部署到 ECS 时，把各自 `HTTP_BIND_ADDRESS` 改为该 ECS 的私网 IP，才可被 ALB 访问。
- API 的 3000 端口只在容器网络中使用，不映射到宿主机。RDS 使用私网地址，仅允许两台应用节点访问。
- 本拓扑是客户端到 ALB 的 HTTPS，ALB 到 ECS 为受限私网 HTTP，不能称为全链路 TLS。需要全链路加密时，应另行配置后端 HTTPS。
- `TRUST_PROXY_HOPS=2` 对应 ALB → Nginx → API；Nginx 保留转发链。必须先落实上述入口隔离，避免绕过可信代理路径。

## 部署文件

| 文件 | 用途 |
| --- | --- |
| `deploy/aliyun.compose.yaml` | 每台 ECS 的 API、网页后台、日志轮转及健康检查 |
| `deploy/aliyun.env.example` | 版本标签、生产配置路径、本机监听地址与端口 |
| `deploy/server.production.env.example` | 生产 API 配置样例；真实密钥只写入服务器私有文件 |
| `admin/default.conf.template` | 同源 `/api/` 转发、数据库就绪检查 `/ready` |

## 首次部署步骤

1. 在用户自己的阿里云账号准备资源与域名。两台 ECS、RDS 和 ALB 选择匹配的地域/VPC；先配置数据库网络范围、数据库 `campus_runner` 和专用账号。应用账号不需要全实例超级权限，迁移需要目标业务库内的建表权限。
2. 按阿里云官方文档在 ECS 安装 Docker 和 Compose。确认 `docker version` 能连接引擎，`docker compose version` 正常。
3. 将同一版本源代码放到两台 ECS，例如 `/opt/campus/ORR`；不要上传本机 `.local/`、`.env`、`node_modules/` 或 `project.private.config.json`。
4. 以有权限的运维账号建立 `/opt/campus/secrets/`，目录权限限制为 700。把两个样例分别复制为该目录中的 `compose.env`、`server.env`，文件权限设为 600。
5. 在 `compose.env` 填写不可变版本标签、该 ECS 的私网 IP、`SERVER_ENV_FILE=/opt/campus/secrets/server.env`。两台机器标签一致，绑定 IP 各不相同。
6. 在 `server.env` 填写真实 AppID/Secret、RDS 私网地址和账号、随机令牌密钥，以及真实管理后台 HTTPS 地址。两台 API 使用同一个令牌密钥和数据库。不要把密钥写入小程序或镜像。

下列命令在 ECS 的仓库根目录执行，且已完成上述配置：

```sh
docker compose --env-file /opt/campus/secrets/compose.env -f deploy/aliyun.compose.yaml config --quiet
docker compose --env-file /opt/campus/secrets/compose.env -f deploy/aliyun.compose.yaml build
```

只在一个节点执行初始迁移：

```sh
docker compose --env-file /opt/campus/secrets/compose.env -f deploy/aliyun.compose.yaml run --rm --no-deps api node src/db/migrate.js
```

创建首个管理员，避免把密码放入命令历史；以下由运维人员在 Bash 中输入：

```sh
read -r -s -p 'Initial administrator password: ' ADMIN_PASSWORD
printf '\n'
export ADMIN_PASSWORD
docker compose --env-file /opt/campus/secrets/compose.env -f deploy/aliyun.compose.yaml run --rm --no-deps -e ADMIN_PASSWORD api node src/scripts/create-admin.js
unset ADMIN_PASSWORD
```

随后在两台节点分别启动：

```sh
docker compose --env-file /opt/campus/secrets/compose.env -f deploy/aliyun.compose.yaml up -d
docker compose --env-file /opt/campus/secrets/compose.env -f deploy/aliyun.compose.yaml ps
```

`/ready` 必须返回 HTTP 200 和 `{"status":"ready"}`；测试时使用该节点配置的私网地址与 8080 端口。它会检查数据库连接，不能用返回静态网页的 `/` 代替。

## ALB 与域名配置

1. 创建 HTTP 服务器组，添加两台 ECS 的 8080 端口。健康检查设为 HTTP GET `/ready`，健康状态只接受 2xx；可先用 5 秒超时、5 秒间隔、成功/失败阈值各 3 次，再按实际启动和网络行为调整。
2. 在证书中心准备覆盖两个实际域名的证书，为 ALB 配置 HTTPS 443 监听并绑定证书。两域名都转发到上述服务器组；Nginx 提供后台静态页和同源 `/api/v1`。
3. 按实际 ALB 提供的地址完成域名解析，分别验证后台登录和 API 的 `/ready`。证书应覆盖实际使用的子域名。
4. 在 `utils/config.js` 填入真实体验版、正式版 API 地址，配置微信后台相应请求域名及发布资料；关闭本地跳过校验的选项后验证体验版和真机。
5. 执行 `node scripts/check-miniprogram.cjs --release`。该检查通过仅代表代码配置基本齐全，不代替微信审核、证书与云端连通性验证。

## 更新、回退与验收

- 保存已验收的镜像标签。更新时先从 ALB 暂时摘除一个节点，更新该节点，等待健康检查成功后加回，再处理第二个节点。
- 数据库迁移只运行一次，并在变更前确认备份。应用回退到旧镜像不等于数据库回退；涉及不兼容迁移时先制定恢复方案。
- 开启 RDS 自动备份，在独立临时库演练恢复；配置实例异常、连接数、存储空间、应用 5xx 和延迟告警。
- 用两个真实微信账号在体验版验收完整订单、取消争议和举报处理，再邀请 20–50 名同学。当前本机验证结果见 `docs/acceptance.md`。

当前未完成：目标地域与可用区选择、资源采购、真实域名、云端构建/启动、备份恢复和真机双账号验收。本文件没有自动执行这些外部操作。

## 核对过的官方资料

核对日期：2026-11-11。以下是官方文档入口，具体规格和控制台选项仍以目标地域为准。

- 安装并使用 Docker 和 Docker Compose：`https://help.aliyun.com/zh/ecs/user-guide/install-and-use-docker`
- 创建 RDS MySQL 实例：`https://help.aliyun.com/zh/rds/apsaradb-rds-for-mysql/create-an-apsaradb-rds-for-mysql-instance-1/`
- RDS 高可用架构：`https://help.aliyun.com/zh/rds/apsaradb-rds-for-mysql/build-a-high-availability-architecture`
- ALB 健康检查：`https://help.aliyun.com/zh/slb/application-load-balancer/alb-health-check`
- ALB 服务器组：`https://help.aliyun.com/zh/slb/application-load-balancer/create-and-manage-a-server-group`
- ALB 证书：`https://help.aliyun.com/zh/slb/application-load-balancer/manage-certificates`
