import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const reportRunQueue = new Queue('report-run', { connection });
export const reportScheduleQueue = new Queue('report-schedule', { connection });
