# 文档模型

集合和索引声明以 collections.json 为准。所有文档采用字符串 _id，时间为 UTC ISO 字符串，客户端展示本地时间。

| 集合 | 主要字段/用途 |
| --- | --- |
| users | openid、appid（仅服务端），nickname、status、activeTaskIds、activeProductIds、mediaDay、mediaCount、revision |
| admin_users | uid、username、role、status；可信运维初始化 |
| tasks | ownerId、helperId、标题/描述、rewardCents、publicArea、exactLocation、status、visibility、cancelResumeStatus、时间 |
| task_messages | taskId、senderId、senderNickname、content、createdAt |
| task_events | taskId、actorId、actorType、eventType、details、createdAt |
| posts | authorId、authorNickname、content、status、commentCount |
| comments | postId、authorId、authorNickname、content、status |
| reports | reporterId、targetType、targetId、reason、status、resolution、handledBy |
| admin_action_logs | adminId、action、targetType、targetId、details、createdAt |
| idempotency | actorId、action、digest、result、createdAt；与业务原子提交 |
| products | sellerId、title、description、searchText、category、condition、priceCents、publicArea、imageIds、status、visibility、favoriteCount、activeOrderId、rankKey、newestKey、时间 |
| favorites | userId、productId、active、newestKey、createdAt；用户/商品组合固定 ID |
| product_orders | productId、title/priceCents 快照、sellerId、buyerId、status、cancelReason、resolution、newestKey、时间；买卖双方分别使用 `buyerArchived` / `sellerArchived`、`ArchivedAt`、`ArchiveExpiresAt`、`RetentionDays`、`ArchiveKey` 保存个人回收站状态 |
| product_messages | orderId、senderId、senderNickname、content、newestKey、createdAt |
| media_assets | ownerId、contentHash、fileId、traceId、attempts、productId、submittedAt、createdAt；上传后待审资产 |
| media_checks | id=hash(trace)、status、createdAt；只由可信回调写入，不保存原始回调或图片 |

幂等记录可能包含参与者响应，必须保持服务端独占访问，当前不自动过期，以免超时重试在过期后再执行。后续清理策略须同时约束客户端最大重试窗口。

没有迁移旧 MySQL 数据；不得按昵称匹配身份，也不得跨 AppID 复用 OpenID。

共 16 个集合。图片二进制存入私有云存储；数据库不是内存缓存，云函数结束后业务记录继续保存。回调先到时也可独立写 media_checks，资产后续通过 trace 关联。新模块所有排序键都是稳定字符串字段；收藏量变化会更新 rankKey，动态分页不承诺冻结排名。回收站字段只影响当前参与者的列表和详情访问，订单、留言及管理员审计仍保留。
