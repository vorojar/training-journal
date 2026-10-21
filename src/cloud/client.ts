import type { SavedRecord } from "../lib/model";
import type { System } from "../execution/domain";
export type CloudUser = { id: string; name: string; email: string };
export type Space = {
  id: string;
  name: string;
  owner_id: string;
  owner_name: string;
  role: "owner" | "coach";
};
export type CloudDocument = {
  payload: System;
  version: number;
  updated_at: string;
  actor_id?: string;
  legacy?: SavedRecord[];
};
const authErrors = new Map([
  ["INVALID_EMAIL_OR_PASSWORD", "邮箱或密码错误"],
  ["INVALID_PASSWORD", "密码错误"],
  ["INVALID_EMAIL", "请填写有效邮箱"],
  ["PASSWORD_TOO_SHORT", "密码至少6位"],
  ["PASSWORD_TOO_LONG", "密码最多128位"],
  ["USER_ALREADY_EXISTS", "该邮箱已注册，请登录"],
  ["USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", "该邮箱已注册，请登录"],
]);
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Fitness-Client": "4",
      ...options.headers,
    },
  });
  const result = await response
    .json()
    .catch(() => ({ error: "服务响应异常，请稍后重试" }));
  if (!response.ok) {
    const message =
      (path.startsWith("/api/auth/") && (response.status === 429 ? "操作频繁，请稍后重试" : authErrors.get(result.code || result.error?.code))) ||
      result.error?.message ||
      result.error ||
      result.message ||
      "请求失败，请重试";
    throw new Error(typeof message === "string" ? message : "请求失败，请重试");
  }
  return result as T;
}
export const send = <T>(path: string, body: unknown, method = "POST") =>
  request<T>(path, { method, body: JSON.stringify(body) });
export type CloudConnection = {
  user: CloudUser;
  spaces: Space[];
  space: Space;
  document: CloudDocument;
  status: string;
  refresh: () => Promise<void>;
  select: (id: string) => void;
  logout: () => Promise<void>;
  onSaved: (doc: CloudDocument) => void;
};
