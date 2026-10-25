/**
 * 1つのバックグラウンドの処理を、間を空けながら繰り返し動かす。前の回と重なることはない。
 * stop()は動いている処理を待つので、サーバーを止めてもDBへの書き込みが途中で切れない。
 */
export class PollingLoop {
  private isStopped = true;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private active: Promise<unknown> | undefined;

  constructor(
    private readonly options: {
      intervalMs: number;
      run: () => Promise<unknown>;
      /** エラーの詳細は保存先の場所を含みうるので、詳細を付けずにログに書く。 */
      failureEvent: string;
    },
  ) {}

  start(): void {
    if (!this.isStopped) return;
    this.isStopped = false;
    this.schedule();
  }

  async stop(): Promise<void> {
    this.isStopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.active?.catch(() => undefined);
  }

  private schedule(): void {
    if (this.isStopped) return;
    this.timer = setTimeout(() => {
      this.active = this.options.run();
      void this.active
        .catch(() => console.error(JSON.stringify({ event: this.options.failureEvent })))
        .finally(() => {
          this.active = undefined;
          this.schedule();
        });
    }, this.options.intervalMs);
    this.timer.unref();
  }
}
