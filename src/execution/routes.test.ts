import { describe, it, expect } from "vitest";
import { emptySystem } from "./domain";
import {
  pages,
  parseRoute,
  formatRoute,
  missingTarget,
  type Edit,
  type Page,
} from "./routes";
const day = "2026-10-20";
describe("可分享的页面与弹窗地址", () => {
  it("七个页面可从地址恢复，旧的空地址与品牌#仍进入总览", () => {
    for (const page of Object.keys(pages)) {
      expect(parseRoute("#" + page, day).page).toBe(page);
    }
    expect(parseRoute("", day).page).toBe("overview");
    expect(parseRoute("#", day).page).toBe("overview");
  });
  it("全部填写窗口地址可刷新还原，包括已有记录与复查调整来源", () => {
    const edits: Edit[] = [
      { type: "profile" },
      { type: "assessment" },
      { type: "problem" },
      { type: "problem", id: "issue-P3" },
      { type: "plan" },
      { type: "plan", id: "plan-a" },
      { type: "plan", id: "plan-a", adjust: true, reviewId: "review-a" },
      { type: "session", id: "plan-a-v2-2026-10-20" },
      { type: "daily" },
      { type: "daily", id: "entry-a" },
      { type: "review" },
      { type: "review", id: "r1" },
      { type: "measurement" },
      { type: "measurement", id: "m1" },
      { type: "history", id: "12" },
      { type: "archive", kind: "daily", id: "d1" },
      { type: "archive", kind: "restore", id: "trash1" },
      { type: "template", id: "save_p1" },
    ];
    for (const edit of edits) {
      const route = {
        page: "assessment" as Page,
        calendar: { month: "2026-10", date: day },
        edit,
      };
      expect(parseRoute(formatRoute(route), day)).toEqual(route);
    }
  });
  it("月历月份、选中日期及课次弹窗同时保留", () => {
    const r = parseRoute(
      "#calendar/session/session-a?month=2026-11&date=2026-11-05",
      day,
    );
    expect(r).toMatchObject({
      page: "calendar",
      calendar: { month: "2026-11", date: "2026-11-05" },
      edit: { type: "session", id: "session-a" },
    });
    expect(parseRoute(formatRoute(r), day)).toEqual(r);
  });
  it("无效日期、路由和编辑路径安全回到页面，不误建新记录", () => {
    expect(
      parseRoute("#calendar?month=2026-99&date=2026-02-30", day).calendar,
    ).toEqual({ month: "2026-10", date: day });
    for (const h of [
      "#unknown/problem/new",
      "#plans/plan/a/anything",
      "#plans/plan/new/adjust",
      "#daily/entry/a/extra",
      "#assessment/problem/%ZZ",
      "#settings/%E0%A4%A",
    ])
      expect(parseRoute(h, day).edit).toBeUndefined();
    expect(formatRoute(parseRoute("#__proto__", day))).toBe("#overview");
    for (const month of ["0000-01", "9999-12"])
      expect(parseRoute("#calendar?month=" + month, day).calendar.month).toBe(
        "2026-10",
      );
  });
  it("本地不存在的编号会提示，而不是把编辑链接变成新建表单", () => {
    const s = emptySystem();
    for (const edit of [
      { type: "problem", id: "missing" },
      { type: "plan", id: "missing" },
      { type: "session", id: "missing" },
      { type: "daily", id: "missing" },
    ] as Edit[])
      expect(missingTarget(s, edit)).toContain("此浏览器没有");
    expect(missingTarget(s, { type: "problem" })).toBeUndefined();
  });
});
