import cron, { type ScheduledTask } from 'node-cron';
import type { Logger } from 'pino';

/** Wraps node-cron with validation and structured logging for the daily scan job. */
export class CronScheduler {
  private task: ScheduledTask | undefined;

  constructor(
    private readonly cronExpression: string,
    private readonly timezone: string,
    private readonly logger: Logger,
  ) {}

  start(job: () => Promise<void>): void {
    if (!cron.validate(this.cronExpression)) {
      throw new Error(`Invalid cron expression: "${this.cronExpression}"`);
    }

    this.task = cron.schedule(
      this.cronExpression,
      () => {
        this.logger.info('scheduled scan starting');
        job().catch((err: unknown) => this.logger.error({ err }, 'scheduled scan failed'));
      },
      { timezone: this.timezone },
    );

    this.logger.info(
      { cron: this.cronExpression, timezone: this.timezone },
      'scheduler started; waiting for next run',
    );
  }

  stop(): void {
    this.task?.stop();
  }
}
