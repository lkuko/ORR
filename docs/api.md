# API 概览

所有业务 API 使用 /api/v1 前缀；除健康检查和登录外，必须携带 Authorization: Bearer <token>。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | /auth/wechat-login | 使用 wx.login code 建立用户会话 |
| PATCH | /auth/profile | 修改昵称 |
| GET / POST | /tasks | 浏览开放任务 / 发布任务 |
| GET | /tasks/mine?role=owner or helper | 浏览自己发布或接单的任务 |
| POST | /tasks/:id/accept | 原子接单 |
| POST | /tasks/:id/complete、/confirm | 接单者提交完成、发布者确认 |
| POST | /tasks/:id/cancel-request、/cancel-confirm | 申请取消、另一方同意或拒绝 |
| GET / POST | /tasks/:id/messages | 订单双方查看或发送文字留言 |
| GET / POST | /posts | 浏览或发布文字帖 |
| GET / POST | /posts/:id/comments | 查看或发布评论 |
| POST | /reports | 举报任务、帖子、评论或用户 |
| POST | /auth/admin-login | 管理员登录 |
| GET / POST / PATCH | /admin/* | 举报、取消争议、下架、封禁、审计与运营摘要 |

响应错误统一为 { error: { code, message } }。客户端不传入用户 ID 来决定身份；服务端从已验证令牌识别用户。
