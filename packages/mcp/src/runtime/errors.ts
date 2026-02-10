export class RuntimeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
  }
}

export function isRuntimeError(error: unknown): error is RuntimeError {
  return error instanceof RuntimeError;
}

export function asRuntimeError(error: unknown, fallbackCode: string, fallbackMessage: string): RuntimeError {
  if (isRuntimeError(error)) {
    return error;
  }
  if (error instanceof Error) {
    return new RuntimeError(fallbackCode, error.message);
  }
  return new RuntimeError(fallbackCode, fallbackMessage);
}
