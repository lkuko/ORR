# 已有服务器内部测试

当前目标：复用用户已有的阿里云服务器做受控内部测试，不新增云资源，不开放公网 HTTP，不把本次工作视为体验版或正式版发布。云端安装、数据库备份恢复、新 AppID 登录和双真实账号核心业务流均已验收。20–50 人公开体验版分发及 HTTPS 域名准备仍属于后续阶段。

## 连接关系

```text
同一 Wi-Fi / 热点中的测试手机（开发调试）
  → 开发电脑的指定 LAN IPv4:18080（局域网 HTTP）
    → SSH 加密隧道 → 139.224.111.140:22
      → 云服务器 127.0.0.1:18080
        → Nginx 管理后台 /api/v1 → Node API → MySQL

管理员浏览器 → 开发电脑 127.0.0.1:18080 → 同一隧道与云端数据库
```

电脑到云端由 SSH 加密；手机到电脑这一段仍为 HTTP，仅用于受控测试网络与测试数据。电脑必须保持联网、隧道进程运行；校园 Wi-Fi 的客户端隔离可能阻止手机访问电脑，可改用可互通的热点实测。这不是跨网络分发体验版的替代方案。

微信开发者工具跳过域名校验不等于普通体验版或正式版已具备发布条件。真机开发调试是否能请求该地址必须实测；不可用时退回同机模拟器，或再准备 HTTPS 测试域名，不把微信 AppSecret 放到客户端。

## 当前连接信息与检查

- 服务器：`139.224.111.140`，SSH 用户 `root`，端口 `22`；用户终端检查确认 Ubuntu 24.04.4 LTS、x86_64、2 个逻辑 CPU，Docker 29.7.2、Compose v5.4.0。
- 用户通过阿里云控制台独立核对的 ED25519 指纹：`SHA256:ePb+97PGXWxHTJOyljaLG6irIegPCTcbuRK92uyF5qw`。
- 本机专用指纹文件：`.local/ssh/campus-known_hosts`。原有全局 known_hosts 中是不同的旧记录，没有删除或覆盖；脚本只使用本项目的核验记录，保持严格校验。
- 2026-11-11 检测到电脑 WLAN IPv4 为 `10.100.167.235`。这只是当时的地址，换网络后必须重新确认。

先在用户自己的 PowerShell 终端执行只读检查，密码只输入 SSH 提示：

```powershell
& 'E:\wechat\ORR\scripts\inspect-cloud.ps1'
```

报告保存为 `.local/server-inspection.txt`；包括系统、内存、磁盘、监听端口、Docker 和 `/opt` 顶层目录，不读取私密配置或进程参数。首次检查已返回完整系统信息，但旧版脚本因 Windows 额外 CR 换行报错；该传递问题已修正，原检查不需要为此重跑。

**部署前的实际资源限制：**2026-11-11 检查时总内存 1612 MiB、可用约 500 MiB、无 swap；磁盘可用约 31 GiB。现有 `arl_web`、`arl_worker`、`arl_scheduler`、`arl_mongodb`、`arl_rabbitmq` 正在运行，5003 端口属于已有服务。用户已明确授权在本轮内测期间只停止这 5 个容器并保留数据。部署脚本先记录容器 ID、运行状态和重启策略，再停止；不删除容器、镜像或卷，不调整 swap，不改变原有重启策略。

后台静态资源在开发电脑编译，服务器不运行 Vite 构建。MySQL、API、Nginx 的容器内存上限分别为 768、256、64 MiB；MySQL 缓冲池为 128 MiB、最多 30 个连接，API JS 堆上限为 160 MiB。这些是初始保护设置，不是性能验收结论。停用原服务后不足 1000 MiB 可用内存时，安装脚本拒绝继续并尝试恢复原服务；实际占用仍以云端运行结果为准。

## 代码与服务器目录

```text
ORR/
├── deploy/internal.compose.yaml       # 独立应用 + MySQL，入口仅绑定 loopback
├── deploy/internal.env.example        # 版本标签和服务器密钥目录
├── deploy/server.internal.env.example # 令牌与服务端配置样例
├── deploy/admin.internal.Dockerfile   # 直接打包本机已构建的后台
├── deploy/install-internal.sh         # 首次部署、迁移、健康检查及失败恢复
├── deploy/resume-arl.sh               # 按记录恢复原本运行的 ARL 容器
├── deploy/verify-internal.sh          # 备份、隔离恢复与数据比对；通过 SSH 直接执行
├── scripts/prepare-internal-release.ps1 # 在本机构建并打包允许的代码文件
├── scripts/deploy-internal.ps1        # SSH 上传和安装，密码由用户在终端输入
├── scripts/copy-cloud-backup.ps1      # 将已验证的云端备份复制到电脑并校验
├── scripts/inspect-cloud.ps1          # Windows 发起只读检查
├── scripts/inspect-server.sh          # Linux 只读检查内容
└── scripts/open-internal-tunnel.ps1    # Windows SSH 隧道

/opt/campus-internal/                   # 须先确认尚未被其他项目使用
├── app/                               # 上传的代码，不含本机数据库与 .env
├── state/                             # ARL 原状态与成功安装标记
└── secrets/                           # 目录权限 700，不提交 Git
    ├── compose.env                    # 版本标签与 SECRETS_DIR
    ├── server.env                     # TOKEN_SECRET、管理员账号等服务端配置
    ├── wechat.env                     # 当前 AppID、AppSecret；独立轮换
    ├── db-password                    # API 与 MySQL 共同读取
    ├── mysql-root-password             # 仅 MySQL 容器读取
    └── initial-admin-password          # 初始管理密码，限 root 读取
```

Compose 项目名固定为 `campus-internal`，新建 `campus_internal` 数据库和项目独立持久卷；不会自动搬运或清空本机测试库。若同名项目、目录、卷或 18080 端口已存在，先核对归属，不覆盖或执行 `down -v`。

## 首次部署

校园项目已在目标服务器完成首次安装。以下保留的是首次部署脚本的可重复操作说明；脚本发现已有 `/opt/campus-internal`、同名 Compose 容器/卷或 18080 端口占用时会拒绝覆盖，因此不要再次运行安装命令。失败后先读日志，不盲目重跑。

本机准备（只生成部署包，不连接服务器）：

```powershell
& 'E:\wechat\ORR\scripts\deploy-internal.ps1' -PrepareOnly
```

脚本构建同源 `/api/v1` 后台，只打包白名单代码文件；`source.tar.gz` 不含凭证。私有上传包 `upload.tar.gz` 从 `server/.env` 读取微信配置，并生成独立令牌密钥、数据库密码和后台密码；不会上传本机数据库或沿用本机管理员密码。生成凭证前，Windows 目录 ACL 已限制为当前用户和 SYSTEM。

在用户自己的终端上传并安装已准备的版本：

```powershell
& 'E:\wechat\ORR\scripts\deploy-internal.ps1' -UsePrepared -PauseArl
```

上传与安装使用同一条 SSH 连接，只需一次认证，密码直接输入终端；不能放进聊天或命令参数。脚本通过标准输入传递 Bash 源码，避免 Windows 原生命令参数解析改动引号；需要上传时在脚本的独立 here-document 中传递 base64 包，落盘后验证 SHA-256。日志路径和本机初始后台密码文件路径记录在 `.local/latest-internal-release.json`，日志不打印凭证。`-PauseArl` 只对应本轮已经授权的 5 个容器。

若此前上传已经成功、安装连接尚未启动，可在确认上传版本后复用包，仍然先检查云端状态：

```powershell
& 'E:\wechat\ORR\scripts\deploy-internal.ps1' -UsePrepared -PauseArl -InstallUploaded
```

日志会记录每次 SSH 尝试、已认证标记、实际容器/卷清单及数量、包校验结果、退出码。若检测到已有项目目录或资源，停止安装并输出只读信息，不能删除资源后盲目重试。`CAMPUS_SSH_AUTHENTICATED` 只说明已登录，`CAMPUS_INSTALL_COMPLETE` 才说明安装与云端就绪检查通过。

安装按顺序检查冲突、保存/停止原容器、检查可用内存、顺序构建镜像、启动 MySQL、执行迁移、创建管理员，再启动 API/后台并检查 `/ready`。中途失败会停止本项目容器并尝试恢复原本运行的 ARL 容器；保留校园项目文件、数据库和日志供排查。实际安装已输出 `CAMPUS_INSTALL_COMPLETE`：三个容器均 healthy，云端只监听 `127.0.0.1:18080`，安装后可用内存约 895 MiB。

服务器密钥目录权限为 700，配置和初始管理员密码文件为 600。Compose 文件型 secret 的挂载需让容器用户可读，所以两个数据库密码文件为 444，仍受宿主机父目录 700 限制；API 不挂载数据库 root 密码。程序代码文件单独设为容器可读权限，避免 Windows 打包后权限导致 Node 无法启动。

数据库和 API 均没有宿主机端口映射；Nginx 只映射到服务器 `127.0.0.1:18080`。无需开放公网 18080、3000 或 3306，也无需更改已有应用的防火墙规则。微信登录和内容检查依赖云服务器出站访问微信接口；如微信后台要求来源 IP 白名单，按实际错误和实际出网 IP 配置。

API 保持 `NODE_ENV=production`、真实微信登录及内容检查。只在内部 Compose 中开启 `ALLOW_LOOPBACK_HTTP=true`，并将管理后台来源严格限定为 `http://127.0.0.1:18080`；该开关不会允许公网或 LAN HTTP 管理来源，不影响未来 HTTPS 部署的默认要求。

## 更换微信 AppID / AppSecret

先在本机 `server/.env` 填写新 AppID 和 AppSecret，并在 `project.config.json` 选择同一个 AppID。不要把 AppSecret 发到聊天、写进小程序客户端或提交到 Git。下面的命令检查两处 AppID 一致，生成仅含微信配置、Compose 文件和回滚脚本的私有包；随后通过已核验的 SSH 主机密钥，在一次密码认证后轮换云端配置：

```powershell
& 'E:\wechat\ORR\scripts\rotate-cloud-wechat.ps1'
```

若只需验证本机配置和打包，不连接服务器，添加 `-PrepareOnly`。轮换包和日志位于 `.local/rotations/`，Windows ACL 仅允许当前用户和 SYSTEM。远端先快照旧的 `server.env`、可选的旧 `wechat.env` 和 Compose 文件；配置校验通过后只强制重建 API 容器，保留 MySQL、`TOKEN_SECRET`、管理员和 ARL 数据，并重新加载 Nginx 以解析 API 的新容器地址。脚本检查 `/ready`、容器内的新 AppID，并用微信接口验证新凭证，只记录验证结果和数字错误码，不输出 AppSecret 或 access_token。失败时自动用快照恢复旧配置并再次检查 API；若提示自动回滚失败，立即按日志中的快照目录排查，不重复运行。

成功标记为 `CAMPUS_WECHAT_ROTATION_COMPLETE`。服务器保留 `/opt/campus-internal/state/wechat-rotation-时间戳/` 快照及自带的 `rollback-wechat.sh`；确需人工回滚时，通过已核验的 SSH 连接以 root 执行 `bash <快照绝对路径>/rollback-wechat.sh <同一快照绝对路径>`，脚本只恢复这次轮换前的配置并重建 API，不回滚业务数据。保留快照意味着旧 AppSecret 暂存于服务器私有目录，后续确认不再需要回滚时应在服务器上按保留策略清理该快照。

新 AppID 对同一微信账号会产生新的 OpenID。旧 AppID 下的测试任务、帖子仍在数据库，但不属于新 AppID 登录后的用户；双账号联调请重新发布明确标注为测试的任务。重新编译并生成当前 AppID 的预览码，将第二账号加入当前小程序的体验成员后再扫码，两个手机都需开启“开发调试”。

## 开发电脑和手机连接

首次部署健康检查通过后，在测试用户写入数据前，可按以下命令执行备份恢复验证并建立隧道。该步骤本轮已完成；再次执行前应评估备份与恢复测试对正在运行的试运营数据的影响：

```powershell
& 'E:\wechat\ORR\scripts\open-internal-tunnel.ps1' -VerifyCloud -LanAddress '10.100.167.235'
```

地址必须仍属于电脑当前网卡，否则脚本拒绝连接。一次 SSH 认证后，先检查云端就绪和原容器状态，将数据库备份保存在服务器私有 `backups/` 目录，再恢复到新建的 `campus_internal_restore_时间戳_随机数` 临时库。比对表清单、逐表行数和按主键排序的数据导出后，删除本次临时库和中间文件，保留备份。脚本不会删除或清空业务库；如果校验时已有其他客户端写入，可能出现比对不一致，需先排查，不能据此覆盖业务库。

实际验证已输出 `CAMPUS_CLOUD_VERIFIED` 和 `CAMPUS_TUNNEL_READY`：10 张表恢复后的清单、行数和数据导出一致。终端会继续保持连接，这是隧道运行状态；不要关闭窗口。验证日志在 `.local/cloud-verification.log`，不含数据正文、密码或登录令牌。当前备份先保存在同一台服务器；用下面的命令复制到电脑并校验 SHA-256，密码仍只在 SSH 终端输入：

```powershell
& 'E:\wechat\ORR\scripts\copy-cloud-backup.ps1'
```

电脑上的备份目录为 `.local/cloud-backups/`，ACL 限当前用户和 SYSTEM；不会覆盖已有文件。2026-11-11 完成的异机副本 SHA-256 与云端恢复校验日志相符。这份快照建立在新 AppID 测试数据写入前；继续试运营前应创建新的业务数据备份并定期验证恢复。

后续只需重新开启隧道、无需重复备份验证时，可仅连接本机：

```powershell
& 'E:\wechat\ORR\scripts\open-internal-tunnel.ps1'
```

管理员浏览器访问 `http://127.0.0.1:18080`，使用新建的云端管理员。不要用原本 `localhost:5173` 的本地后台操作云端数据。

需要同 Wi-Fi 手机测试时，关闭上一个隧道，在确认电脑当前 LAN IPv4 后指定地址启动。例如只有地址仍匹配时才使用：

```powershell
& 'E:\wechat\ORR\scripts\open-internal-tunnel.ps1' -LanAddress '10.100.167.235'
```

脚本同时保留管理员 loopback 入口；拒绝 `0.0.0.0`、公网 IP 和不属于本机的地址。不会自动改 Windows 防火墙；如被防火墙拦截，仅为确认的测试手机来源及本机 LAN 地址开放 TCP 18080，测试结束移除临时规则。

当前 `utils/config.js` 的开发环境 endpoint 为 `http://10.100.167.235:18080/api/v1`，`developmentMode='api'`；这是本轮实测的电脑 WLAN 地址，换网络后需重新确认并修改。模拟器单独测试可使用 `http://127.0.0.1:18080/api/v1`。不得将 LAN HTTP endpoint 用于普通体验版或正式版。

本轮已用两部手机在微信开发调试模式验证真实登录、发单、接单、精确地点权限、双方留言、完成确认、取消与争议裁定、举报下架；云端后台记录已核对。后续网络变化或更换 AppID、AppSecret 后需重新确认手机 `/ready` 连通、微信开发调试登录和相应业务流程。

关闭隧道用 `Ctrl+C`，不会删除云端数据；暂停应用可在服务器执行 `dc stop`。云端数据库目前是单机实例，未实现自动故障切换；正式依赖这批数据前需完成备份与恢复验证。未来公开试运营的 HTTPS、域名和高可用方案见 `aliyun-deployment.md`，不属于本轮新增资源采购。

恢复原 ARL 服务时，先停止校园项目，避免两组同时占用内存：

```sh
docker compose --env-file /opt/campus-internal/secrets/compose.env -f /opt/campus-internal/app/deploy/internal.compose.yaml stop --timeout 30
bash /opt/campus-internal/app/deploy/resume-arl.sh
```

恢复脚本核对原容器 ID 与名称，仅启动原先运行的容器，不删除校园数据。原 ARL 重启策略没有改变，服务器重启后的运行情况需重新检查。
