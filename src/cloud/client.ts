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
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const result = await response
    .json()
    .catch(() => ({ error: "服务响应异常，请稍后重试" }));
  if (!response.ok) {
    const message =
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
