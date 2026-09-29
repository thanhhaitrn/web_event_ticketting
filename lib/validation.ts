import { Money } from "@/lib/domain";

export function validName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 500;
}

// the rule lives on the Money value object (non-negative 32-bit integer, as stored)
export function validAmount(value: unknown): value is number {
  return Money.isValidAmount(value);
}

export function validBody(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
