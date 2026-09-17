export const IDENTITY_ROLE_CODES = Object.freeze([
  "OWNER",
  "ADMIN",
  "REVIEWER",
  "USER",
]);

export function assertIdentityId(value, name = "id") {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new TypeError(`${name} must be a UUID string`);
  }
  return value;
}
