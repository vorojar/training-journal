import { describe, it, expect } from "vitest";
import { coachAllowed } from "./worker";
import { emptySystem } from "../src/execution/domain";
function fixture() {
  const s = emptySystem();
  s.sessions = [
    {
      id: "session-a",
      planId: "plan-a",
      planVersion: 1,
      date: "2026-10-21",
      time: "18:00",
      title: "测试课次",
      minutes: 30,
      status: "待完成",
      exercises: [],
      cautions: "测试",
      actual: "",
      effort: null,
      symptoms: "",
      nextDay: "",
      completedAt: "",
    },
  ];
  return s;
}
describe("教练写入边界", () => {
  it("可以维护评估和待完成排期，不能修改本人资料与指标", () => {
    const old = fixture(),
      next = structuredClone(old);
    next.assessment.assessor = "教练";
    next.sessions[0]!.time = "19:00";
    expect(coachAllowed(old, next)).toBe(true);
    next.profile.name = "冒充学员修改";
    expect(coachAllowed(old, next)).toBe(false);
  });
  it("只能取消待完成课次，完成情况由学员填写", () => {
    const old = fixture(),
      next = structuredClone(old);
    next.sessions[0]!.status = "已取消";
    expect(coachAllowed(old, next)).toBe(true);
    next.sessions[0]!.status = "已完成";
    expect(coachAllowed(old, next)).toBe(false);
    next.sessions[0]!.status = "待完成";
    next.sessions[0]!.actual = "代填实际训练";
    expect(coachAllowed(old, next)).toBe(false);
  });
  it("保护已完成课次的动作快照和实际记录，不能通过删除后重建绕过", () => {
    const old = fixture();
    old.sessions[0]!.status = "已完成";
    old.sessions[0]!.actual = "学员实测";
    const next = structuredClone(old);
    next.sessions[0]!.title = "改写历史";
    expect(coachAllowed(old, next)).toBe(false);
    next.sessions = [];
    expect(coachAllowed(old, next)).toBe(false);
    expect(coachAllowed(old, structuredClone(old))).toBe(true);
  });
  it("新增课次必须待完成，学员每日记录不可增删改", () => {
    const old = fixture(),
      next = structuredClone(old);
    next.sessions.push({
      ...next.sessions[0]!,
      id: "session-b",
      status: "已完成",
    });
    expect(coachAllowed(old, next)).toBe(false);
    next.sessions[1]!.status = "待完成";
    expect(coachAllowed(old, next)).toBe(true);
    next.daily = [
      {
        id: "d",
        date: "2026-10-20",
        weight: 60,
        bodyFat: null,
        waist: null,
        sleep: null,
        heartRate: null,
        steps: null,
        energy: null,
        notes: "",
        source: "手动",
      },
    ];
    expect(coachAllowed(old, next)).toBe(false);
  });
});
