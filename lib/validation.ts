export function validName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 500;
}

export function validAmount(value: unknown): value is number {
  // Prisma Int is a signed 32-bit integer.
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2147483647;
}

export function validBody(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
