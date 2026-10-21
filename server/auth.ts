import { betterAuth } from "better-auth";
export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_URL: string;
} & Record<"BETTER_AUTH_SECRET", string> &
  Partial<Record<"VAPID_PUBLIC_KEY" | "VAPID_PRIVATE_KEY", string>>;
export function authentication(env: Env) {
  return betterAuth({
    database: env.DB,
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_URL],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 6,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: env.APP_URL.startsWith("https:"),
      defaultCookieAttributes: { sameSite: "lax", httpOnly: true },
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/sign-up/email": { window: 60, max: 5 },
      },
    },
  });
}
