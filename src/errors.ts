export interface PaymentChallenge {
  scheme?: string;
  network?: string;
  amount?: string | number;
  pay_to?: string;
}

export interface NormalizedErrorData {
  status?: number;
  code?: string;
  message: string;
  details?: unknown;
  balance?: number;
  required?: number;
  paymentChallenge?: PaymentChallenge;
}

export class DevaError extends Error {
  public readonly status?: number;
  public readonly code?: string;
  public readonly details?: unknown;
  public readonly balance?: number;
  public readonly required?: number;
  public readonly paymentChallenge?: PaymentChallenge;

  constructor(data: NormalizedErrorData) {
    super(data.message);
    this.name = "DevaError";
    this.status = data.status;
    this.code = data.code;
    this.details = data.details;
    this.balance = data.balance;
    this.required = data.required;
    this.paymentChallenge = data.paymentChallenge;
  }
}

export function normalizeError(error: unknown): DevaError {
  if (error instanceof DevaError) {
    return error;
  }

  if (error instanceof Error) {
    return new DevaError({
      message: error.message
    });
  }

  return new DevaError({
    message: "Unknown error"
  });
}

export function formatErrorForTool(error: unknown): string {
  const normalized = normalizeError(error);

  if (normalized.status === 402 || normalized.code === "PAYMENT_REQUIRED") {
    return JSON.stringify(
      {
        error: "PAYMENT_REQUIRED",
        message: normalized.message,
        payment_challenge: normalized.paymentChallenge ?? null
      },
      null,
      2
    );
  }

  if (normalized.code === "INSUFFICIENT_KARMA") {
    const balanceText = normalized.balance !== undefined ? ` Current balance: ${normalized.balance}.` : "";
    const requiredText = normalized.required !== undefined ? ` Required: ${normalized.required}.` : "";
    return `${normalized.message}.${balanceText}${requiredText} Top up karma in your Deva dashboard.`.trim();
  }

  if (normalized.code) {
    return `${normalized.code}: ${normalized.message}`;
  }

  return normalized.message;
}
