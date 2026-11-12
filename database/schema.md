# 文档模型

集合和索引声明以 collections.json 为准。所有文档采用字符串 _id，时间为 UTC ISO 字符串，客户端展示本地时间。

| 集合 | 主要字段/用途 |
| --- | --- |
| users | openid、appid（仅服务端），nickname、status、activeTaskIds、revision |
| admin_users | uid、username、role、status；可信运维初始化 |
| tasks | ownerId、helperId、标题/描述、rewardCents、publicArea、exactLocation、status、visibility、cancelResumeStatus、时间 |
| task_messages | taskId、senderId、senderNickname、content、createdAt |
| task_events | taskId、actorId、actorType、eventType、details、createdAt |
| posts | authorId、authorNickname、content、status、commentCount |
| comments | postId、authorId、authorNickname、content、status |
| reports | reporterId、targetType、targetId、reason、status、resolution、handledBy |
| admin_action_logs | adminId、action、targetType、targetId、details、createdAt |
| idempotency | actorId、action、digest、result、createdAt；与业务原子提交 |

幂等记录可能包含参与者响应，必须保持服务端独占访问，当前不自动过期，以免超时重试在过期后再执行。后续清理策略须同时约束客户端最大重试窗口。

没有迁移旧 MySQL 数据；不得按昵称匹配身份，也不得跨 AppID 复用 OpenID。
