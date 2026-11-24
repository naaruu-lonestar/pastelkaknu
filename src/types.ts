export const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "COMPLETED",
  "CANCELLED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ROLES = ["OWNER", "STAFF"] as const;
export type Role = (typeof ROLES)[number];

export const PURPOSES = [
  "Pribadi",
  "Sekolah / Kampus",
  "Acara / Event",
  "Reseller / Mitra",
  "Lainnya",
] as const;
export type Purpose = (typeof PURPOSES)[number];

export const ORDER_TYPES = ["Reguler", "Partai besar / Event"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export interface Env {
  DB: D1Database;
  BUSINESS_NAME?: string;
  WHATSAPP_NUMBER?: string;
  ADMIN_SESSION_TTL_HOURS?: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface AppEnv {
  Bindings: Env;
  Variables: {
    admin: AdminUser;
    sessionId: string;
  };
}
