# 校园二手交付核对

核对日期：2026-11-13。基于当前工作区、真实测试环境及自动化证据。保留跑腿、校园圈和已有权限修复；用户已明确授权将本次改动提交并推送至 GitHub `master` 分支。

## 七项功能

| 原始要求 | 当前实现与证明范围 | 证据 |
| --- | --- | --- |
| 关键词搜索、分类筛选 | 服务端转义关键词、分类过滤、游标分页、最新/推荐排序；本地多商品用例验证跨页和筛选隔离，真实手机已有搜索分类成功反馈，最新模拟器可读取在售商品 | `modules/products.js`、`lib/market.js`；`tests/integration/market.test.js` 的搜索分页用例；`tests/unit/market-ui.test.js` 的旧响应隔离用例 |
| 图片上传压缩、内容安全检测 | 1–6 张图，压缩至 700KiB 内；文本审核及图片可信回调均成功才允许发布。真实平台回调已落库 PASSED，伪造来源被拒；本地覆盖拒绝、超时、归属、绑定、超限和部分上传失败 | `miniprogram/services/images.js`、`modules/media.js`、`lib/media.js`、`cloudfunctions/media-callback/handler.js`；`market.test.js`、`media-gateway.test.js`、`market-ui.test.js`；`docs/acceptance.md` |
| 一键收藏、收藏夹管理 | 双向切换收藏，事务确保每用户每商品一条记录；隐藏商品只显示不可用摘要且可移除；收藏回执不会被迟到的列表覆盖，后续读取可更新总计数 | `modules/products.js`；并发收藏/隐藏商品测试、3 个页面的异步用例；此前 B 手机收藏及收藏夹成功反馈 |
| 我的发布、我的收藏、订单管理 | 已实现个人页入口、商品上下架、买卖方订单、新预约直接待交付、协商取消、争议管理、留言、7/30 天个人回收站和恢复。真实订单归档恢复及管理裁定已验证，另一方和管理员凭证保持可用 | `pages/products/library`、`pages/product-orders`、`modules/product-orders.js`；相关集成与页面测试；`.local/live-archive-smoke.json`、`.local/market-admin-dispute-after.json` |
| 基于收藏量和发布时间的推荐 | 分数等价于 `72 × log2(1 + 收藏数) - 发布小时数`；写入排序键、收藏增减事务更新，真实收藏数展示。本地验证新商品优先、旧商品因收藏上升、取消收藏后下降；不是个性化模型 | `lib/market.js` 的 `rankKey`、`modules/products.js`；`market.test.js` 的推荐升降测试 |
| 管理端优化 | Vue 商品/订单视图、筛选、图片、长编号、管理下架与争议处置，服务端权限和审计。线上 3 个构建文件与本地一致；真实会话读取 2 件商品、3 张订单，指定争议单裁定取消且保留 2 条留言 | `admin/src/components/MarketPanel.vue`、`modules/market-admin.js`；`.local/market-admin-delivery-review.json`、`.local/market-admin-dispute-resolved.png`；验收记录 |
| ColorUI、流畅界面 | 引入固定版本官方主样式与图标并保留 MIT 许可证；750rpx 流式和安全区、固定操作条；320/390px 各 10 种状态无溢出。订单详情合并请求，评论直接呈现回执，弱网竞态及失败重试有测试 | `miniprogram/vendor/colorui/README.md`、`LICENSE`、`styles/market.wxss`；`.local/market-narrow-320.json`、`.local/market-narrow-390.json`、`.local/market-detail-latency.json`、`.local/comment-receipt-performance.json` |

表中 `modules` / `lib` 均相对于 `cloudfunctions/campus-api/`；`pages` 相对于 `miniprogram/`。本地 `.local` 证据被 Git 忽略，不包含在提交中。

## 跨功能约束

- 76 项单元/集成测试、项目注册与语法检查、管理台构建通过。覆盖原跑腿具体地点裁剪、权限、取消协商、留言去重、论坛和举报回归。
- 数据库客户端拒绝直读直写；业务通过可信云函数身份及管理员角色校验，未增加绕过安全审核或模拟身份的生产入口。
- 数据库存量资源保留，新增 6 个集合及声明索引；订单集合实测共 14 个索引，包含新增 6 个回收站索引。云端只保留业务函数 `campus-api` 和 `media-callback`。
- 本次三轮手机预览对应 `c4bc01e`，包含此前收藏及上传修复；正常图片发布与收藏成功已核对，异常时序、部分上传失败等分支仍以自动化用例为证，不扩大手机覆盖范围。
- 实际 AppID、env ID、托管地址与管理员凭据仅使用忽略配置。源码与文档使用占位符；不重写 Git 历史。

## 三轮手机结果与剩余证据

用户要求提供二维码并在三轮内完成真机测试，本次人工操作已结束。两台关闭调试、A Wi-Fi、B 移动网络；真实身份对应两个不同交易参与者。两件商品的三张图片均审核通过，搜索分类和布局获用户确认；教材完成交易，双方留言各一条，7/30 天归档和双方恢复均有云端回执。水杯先协商取消、再预约进入争议并举报，真实管理台裁定取消和下架结案，原三条留言保留、新增三条审计；管理处置后两台刷新正常的反馈与服务端结果对应。

仍有一项手机证据差异：用户反馈已取消教材收藏，但独立数据库和参与者接口仍显示已收藏、计数 1，没有手机取消回执，因而取消后的推荐排序回落也不能据此确认为手机通过。随后用同一真实账号在开发者工具实际点击详情页取消收藏，页面与云端计数归零，自动补测成功；差异原因尚未定位，不将模拟器结果补记为手机结果。按用户三轮上限不再追加操作，也不宣称完整双真机全部项目无保留通过。

七项功能已有源码、自动化和真实云端证据，剩余缺口是上述手机操作的对应证据。当前测得的详情及评论耗时来自开发者工具，手机弱网和冷实例性能没有据此作保证。最终只读审计的 9 项数据一致性检查通过，详见 `docs/acceptance.md` 及忽略目录中的 `market-phone-final-2203-final-audit.json`。

### 自动验收能力边界复核

此前全自动验证阶段，桌面应用清单中没有手机控制或投屏会话，应用清单查询无错误。微信工具注册表中的 `automation_viewport_action(remote)` 是真机调试；`automation_testaccount` 管理开发者工具测试号及登录票据；`auto_preview` 只推送预览。这些入口均不提供对两部关闭调试手机的完整自动操作能力，当时没有启用远程调试、切换身份或请求人工手机操作。

上述限制仍适用于全自动双真机操作；随后三轮人工配合已完成，不再以缺少设备自动化通道泛指所有手机验收受阻。剩余范围仅为已明确记录的收藏操作证据差异。源码和本地证据保留，未引入模拟身份或绕过审核的入口。
