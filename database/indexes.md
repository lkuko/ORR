# 索引

`collections.json` 是本地索引清单。保留已有 `_id` 索引，只补充缺失项，不删除集合、数据或索引。

- `products`：公开推荐/最新列表、分类列表、个人发布、管理端按状态和可见性筛选。
- `favorites`：个人收藏分页，以及按当前用户和商品 ID 批量查重。
- `product_orders`：买家/卖家订单分页、状态筛选和管理端争议队列；独立的归档标记、到期过滤及回收站排序索引。
- `product_messages`：按订单读取交易留言。
- `media_assets` / `media_checks`：保留未绑定图片及审核记录的维护索引。
- `tasks`、`posts`、`comments`、`reports`：继续使用现有任务、校园圈和举报查询索引。

普通订单使用 `buyer_orders_archived` / `seller_orders_archived` 及角色+状态索引，兼容历史文档未设置归档字段；回收站按本人归档标记、过期时间和唯一归档键分页，不影响另一方查询。商品关键词当前使用转义后的不区分大小写正则，数据量增长后需实测查询耗时并评估专用搜索方案。
