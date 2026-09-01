export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ProviderError extends AppError {}
