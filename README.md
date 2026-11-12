# ORR · 微信云开发版

单校区校园跑腿与文字论坛。原生 JavaScript 小程序，微信云函数和文档数据库，独立 Vue 管理台。报酬由双方线下结算。

## 工程

```text
miniprogram/                    小程序界面、云服务适配
cloudfunctions/campus-api/       身份和权限、业务模块、事务存储适配
admin/                          管理员账号登录的独立网页
database/                       集合、权限和索引声明
scripts/                        校验、打包和真实云端冒烟
tests/unit/                     客户端回归、校验与平台适配测试
tests/integration/              本地业务集成（模拟数据库，不冒充云验收）
docs/                           架构决定、部署和验收证据
```

## 当前边界

- GitHub 源码基线：`lkuko/ORR` 的 `master@0ddb11d3a3bf65f5015575212fc6037d3dba3c5d`。
- 主分支：`master`，云开发重构已合并；工程目录 `E:\wechat\ORR2.0`。
- 开发与体验环境：`orr-d0gvuc3liba01ebf1`；正式环境未绑定，正式构建默认拒绝调用。
- 10 个业务页面保留校园服务站设计、留言发送锁及请求乱序修复，新增“我的举报”记录页。
- 云函数、10 个受保护的集合和原管理网页已部署；当前 36 项本地测试通过。原重构版本已完成真实云端冒烟、两个真实账号关闭调试与跨网络验收；举报记录版本的 B 账号关闭调试复核确认举报记录及处理结果可见、导航图标正常、订单编号无溢出，具体范围见验收记录。
- 最新源码已优化管理台四个模块和任务详情工具栏：“复制编号 / 举报任务”等宽同高对齐；管理台支持举报状态筛选、编号复制与窄屏布局。本轮在本地连接真实云环境验证，管理台托管页面和小程序体验版尚未部署这次界面更新。
- 小程序开发版 `2.0.0-cloudbase.1` 曾上传；举报记录版本曾生成预览码。现有管理台入口：[ORR 管理台](https://orr-d0gvuc3liba01ebf1-1530627261.tcloudbaseapp.com/orr-admin/index.html)。

## 本地验证

使用 Node.js 20+：

```powershell
npm ci
npm --prefix admin ci
npm --prefix cloudfunctions/campus-api ci
npm run verify
node scripts/build-cloud.cjs
```

用微信开发者工具打开工程根目录，工具从 `miniprogram/` 编译客户端。
云函数必须用 `scripts/build-cloud.cjs` 生成的 `.local/deploy/campus-api` 部署；业务代码合并成独立入口，SDK 在云端安装。
项目与私有配置均打开 URL 检查，`app.json` 设置 `debug: false`。这不替代真实体验版关闭调试验收。

产品规则见 [product.md](docs/product.md)，目录和职责见 [project-structure.md](docs/project-structure.md)，架构见 [architecture.md](docs/architecture.md)，当前验证状态见 [acceptance.md](docs/acceptance.md)，部署步骤见 [cloudbase-setup.md](docs/cloudbase-setup.md)。
