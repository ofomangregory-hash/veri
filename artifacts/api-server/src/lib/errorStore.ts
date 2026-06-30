import crypto from "crypto";

export interface StoredError {
  id: string;
  timestamp: string;
  source: string;
  message: string;
  stack?: string;
  data?: string;
}

const MAX_ERRORS = 500;
const errors: StoredError[] = [];

export function captureError(source: string, ...args: unknown[]): void {
  const parts: string[] = [];
  let stack: string | undefined;
  let data: string | undefined;

  for (const arg of args) {
    if (arg instanceof Error) {
      parts.push(arg.message);
      stack = arg.stack;
    } else if (typeof arg === "string") {
      parts.push(arg);
    } else if (arg !== null && arg !== undefined) {
      try {
        const json = JSON.stringify(arg, null, 2);
        if (json.length < 4000) {
          data = json;
        } else {
          data = json.slice(0, 4000) + "\n… (truncated)";
        }
      } catch {
        data = String(arg);
      }
    }
  }

  const entry: StoredError = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    source,
    message: parts.join(" ") || "(no message)",
    stack,
    data,
  };

  errors.unshift(entry);
  if (errors.length > MAX_ERRORS) errors.splice(MAX_ERRORS);
}

export function getErrors(): StoredError[] {
  return [...errors];
}

export function clearErrors(): void {
  errors.length = 0;
}

export function deleteError(id: string): boolean {
  const idx = errors.findIndex(e => e.id === id);
  if (idx === -1) return false;
  errors.splice(idx, 1);
  return true;
}
