import { describe, it, expect, vi } from "vitest";
import { draftKey, readDraft } from "./drafts";
describe("本设备草稿恢复", () => {
  it("账号、空间和编辑对象分别隔离，重读恢复原内容", () => {
    const memory = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => memory.get(key) ?? null,
    });
    const key = draftKey("user-a:space-a", "session:one");
    memory.set(
      key,
      JSON.stringify({
        version: 3,
        updatedAt: "2026-10-21T00:00:00Z",
        parts: { session: { actual: "未提交训练" } },
      }),
    );
    expect(readDraft(key)?.parts.session).toEqual({ actual: "未提交训练" });
    expect(readDraft(draftKey("user-b:space-a", "session:one"))).toBe(null);
    expect(readDraft(draftKey("user-a:space-b", "session:one"))).toBe(null);
    expect(readDraft(draftKey("user-a:space-a", "session:two"))).toBe(null);
    vi.unstubAllGlobals();
  });
  it("损坏或不可读取的草稿不会阻止页面打开", () => {
    vi.stubGlobal("localStorage", { getItem: () => "{broken" });
    expect(readDraft("bad")).toBe(null);
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("存储不可用");
      },
    });
    expect(readDraft("bad")).toBe(null);
    vi.unstubAllGlobals();
  });
});
