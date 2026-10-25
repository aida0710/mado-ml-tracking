/** 失敗を今の言語で説明するのに要る値を持っておく。 */
export class LocalizedError extends Error {
  override name = 'LocalizedError';

  constructor(private readonly describeMessage: () => string) {
    super(describeMessage());
  }

  getLocalizedMessage(): string {
    return this.describeMessage();
  }
}
