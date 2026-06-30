# Git 服务定时更新与 Webhook 并存

Git 服务除 Webhook 推送触发外，增加可选的 **Scheduled Update（定时更新）**：按配置分钟间隔轮询 pull，与 Webhook 独立共存，共用同一套 Update 流程（含 commit hash 比对，无变更则跳过切换）。

调度采用单进程内全局 tick（每 30 秒扫描 DB），而非每服务独立 `setInterval`，以便重启后从 DB 恢复、避免 timer 泄漏。同一服务更新进行中时，后续触发（手动/Webhook/定时）直接跳过。定时更新仅在服务已发布时运行；默认关闭，频率默认 1 分钟、最小 1 分钟。

无变更和无并发冲突均不写操作日志；仅成功部署新版本或 pull 失败时记录。
