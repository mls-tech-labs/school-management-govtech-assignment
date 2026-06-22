import { ulid } from "ulid";

// Single import surface so entities don't reach into `ulid` directly.
export function generateUlid(): string {
  return ulid();
}
