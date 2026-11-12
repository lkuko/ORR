# 架构

~~~text
微信小程序（pages / components / services） ----HTTPS REST----┐
                                                            ├-- Node.js / Express API -- MySQL
浏览器管理台（Vue 3 / Vite） ---------------HTTPS REST----┘
                                                               ├-- 微信 code2session
                                                               └-- 微信文本内容安全检查
~~~

~~~text
小程序：app.js、app.json、pages、components、services、utils
服务端：src/app.js -> modules/*/router.js -> service.js -> repository.js -> MySQL
管理台：src/App.vue -> src/api.js -> /api/v1/admin/*
~~~

任务表是 v1 的订单聚合根。接单通过事务锁定任务行，更新接单人和状态。状态变化写入 task_events；取消被另一方拒绝后进入 CANCEL_DISPUTED，由管理员裁定。访问任务时，API 只向发布者和接单者返回精确地点；订单留言查询和写入均验证这两个参与者。

公开文本只在微信内容安全检查返回明确通过后写入。管理员下架、封禁、举报处理与取消裁定均记录到操作日志。没有用户上传文件，因此 v1 不需要对象存储。
