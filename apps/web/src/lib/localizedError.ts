/** Keep the values needed to describe a failure in the current language. */
export class LocalizedError extends Error {
  override name = 'LocalizedError';

  constructor(private readonly describeMessage: () => string) {
    super(describeMessage());
  }

  getLocalizedMessage(): string {
    return this.describeMessage();
  }
}
