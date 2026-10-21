import { it, expect } from "vitest";
import { notificationGroups, type Note } from "./notification-groups";
const note = (id: string, more: Partial<Note> = {}): Note => ({
  id,
  kind: "change",
  space_id: "student-a",
  title: "资料更新",
  href: "#overview",
  created_at: "2026-10-21T08:00:00Z",
  read_at: null,
  ...more,
});
it("同一空间的重复更新合并展示，保留全部未读编号和最新时间", () => {
  const groups = notificationGroups([
    note("a"),
    note("b", { created_at: "2026-10-21T09:00:00Z" }),
    note("c", { read_at: "2026-10-21T08:10:00Z" }),
  ]);
  expect(groups).toHaveLength(1);
  expect(groups[0]).toMatchObject({
    count: 3,
    unreadIds: ["a", "b"],
    note: { id: "b" },
  });
});
it("不同学员、入口及单次训练提醒不合并", () => {
  expect(
    notificationGroups([
      note("a"),
      note("b", { space_id: "student-b" }),
      note("c", { href: "#assessment" }),
      note("d", { kind: "training" }),
      note("e", { kind: "training" }),
    ]),
  ).toHaveLength(5);
});
