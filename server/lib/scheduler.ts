import { Service } from '../models/service';
import { updateService } from './publish';

const TICK_MS = 30_000;

/** 启动全局定时更新调度器（每 30 秒扫描一次） */
export function startScheduler(): void {
  setInterval(async () => {
    const services = Service.listScheduledEligible();
    const now = Date.now();

    for (const service of services) {
      const intervalMs = service.auto_update_interval * 60 * 1000;
      const lastRun = service.last_scheduled_at
        ? new Date(service.last_scheduled_at).getTime()
        : 0;

      if (now - lastRun < intervalMs) continue;

      // 先标记检查时间，避免长任务阻塞下次 tick 重复触发
      Service.updateLastScheduledAt(service.id);

      try {
        await updateService(service, 'scheduled');
      } catch {
        // 错误已在 updateService 中记日志
      }
    }
  }, TICK_MS);

  console.log('Scheduled update scheduler started (30s tick)');
}
