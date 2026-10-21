import { afterEach, expect, it, vi } from "vitest";
import { request } from "./client";
afterEach(() => vi.unstubAllGlobals());
it.each([
  ["INVALID_EMAIL_OR_PASSWORD", "邮箱或密码错误"],
  ["PASSWORD_TOO_SHORT", "密码至少6位"],
  ["USER_ALREADY_EXISTS", "该邮箱已注册，请登录"],
])("认证错误使用中文：%s", async (code, text) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({code, message: "English error"}), {status: 400})));
  await expect(request("/api/auth/sign-in/email")).rejects.toThrow(text);
});
