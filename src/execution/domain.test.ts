import { describe, it, expect } from "vitest";
import "fake-indexeddb/auto";
import {
  emptySystem,
  today,
  shiftDate,
  generateSessions,
  publishPlan,
  planErrors,
  applyAdjustment,
  systemSchema,
  migrateLegacy,
  assessmentFields,
  type Plan,
} from "./domain";
import {
  saveRecord,
  readRecords,
  parseBackup,
  importRecords,
} from "../lib/storage";
function fixture() {
  const s = emptySystem();
  s.assessment = {
    fields: Object.fromEntries(
      assessmentFields.map(([k]) => [k, "已核实无相关限制"]),
    ),
    confirmed: true,
    assessor: "测试教练",
    date: today(),
    cautions: "按评估后的范围执行",
    stopRules: "不适暂停并联系教练",
  };
  s.problems = [
    {
      id: "p",
      name: "测试问题",
      severity: "中度",
      priority: "本阶段重点",
      basis: "同条件测试",
      measurement: "5次",
      goal: "8次",
      retest: "每2周同条件复测",
      cautions: "",
    },
  ];
  return s;
}
function plan(): Plan {
  return {
    id: "plan-test",
    name: "测试方案",
    coach: "测试教练",
    version: 1,
    status: "草稿",
    start: today(),
    end: shiftDate(today(), 13),
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    time: "18:00",
    minutes: 30,
    nextReview: shiftDate(today(), 7),
    goal: "改善测试表现",
    progression: "教练复查后调整",
    cautions: "测试注意事项",
    exercises: [
      {
        id: "e",
        name: "测试动作",
        problemId: "p",
        purpose: "测试",
        method: "测试方法",
        sets: "2",
        reps: "8次",
        load: "测试负荷",
        rest: "60秒",
        tempo: "慢速",
        cautions: "按教练指引",
        alternative: "降阶版本",
        video: "",
      },
    ],
  };
}
describe("周期与真实日历联动", () => {
  it("按星期与首尾日期生成，无重复，跨月正确", () => {
    const p = {
      ...plan(),
      start: "2026-10-26",
      end: "2026-11-08",
      weekdays: [1, 3, 5],
    };
    const a = generateSessions(p);
    expect(a.map((x) => x.date)).toEqual([
      "2026-10-26",
      "2026-10-28",
      "2026-10-30",
      "2026-11-02",
      "2026-11-04",
      "2026-11-06",
    ]);
    expect(new Set(a.map((x) => x.id)).size).toBe(6);
  });
  it("发布要求完整评估、问题依据、教练与详细剂量", () => {
    const s = fixture(),
      p = plan();
    expect(() =>
      publishPlan(
        { ...s, assessment: { ...s.assessment, confirmed: false } },
        p,
      ),
    ).toThrow("评估");
    expect(() =>
      publishPlan({ ...s, problems: [{ ...s.problems[0]!, basis: "" }] }, p),
    ).toThrow("依据");
    expect(() =>
      publishPlan(s, { ...p, exercises: [{ ...p.exercises[0]!, load: "" }] }),
    ).toThrow("负荷");
    expect(() => publishPlan(s, { ...p, nextReview: "" })).toThrow("复查");
  });
  it("发布生成课次，并保存独立动作快照", () => {
    const p = plan(),
      s = publishPlan(fixture(), p);
    p.exercises[0]!.load = "后来改变";
    expect(s.sessions).toHaveLength(14);
    expect(s.sessions[0]!.exercises[0]!.load).toBe("测试负荷");
    expect(s.plans[0]!.status).toBe("已发布");
    expect(() => publishPlan(s, p)).toThrow("复查调整");
  });
  it("调整仅取消生效日起待完成课次，保护完成/跳过与更早记录", () => {
    const s = publishPlan(fixture(), plan());
    s.sessions[0]!.status = "已完成";
    s.sessions[1]!.status = "已跳过";
    s.sessions[3]!.status = "已完成";
    const before = structuredClone(s.sessions);
    const p = {
      ...s.plans[0]!,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      exercises: [{ ...s.plans[0]!.exercises[0]!, load: "新负荷" }],
    };
    const n = applyAdjustment(
      s,
      p,
      shiftDate(today(), 2),
      "复查进阶",
      "review-1",
    );
    expect(n.sessions.find((x) => x.id === before[0]!.id)).toEqual(before[0]);
    expect(n.sessions.find((x) => x.id === before[1]!.id)).toEqual(before[1]);
    expect(n.sessions.find((x) => x.id === before[3]!.id)).toEqual(before[3]);
    expect(n.sessions.filter((x) => x.status === "已取消")).toHaveLength(11);
    expect(n.sessions.filter((x) => x.planVersion === 2)).toHaveLength(11);
    expect(
      n.sessions.filter(
        (x) => x.status !== "已取消" && x.date === before[3]!.date,
      ),
    ).toHaveLength(1);
    expect(n.adjustments[0]).toMatchObject({
      fromVersion: 1,
      toVersion: 2,
      cancelled: 11,
      scheduled: 11,
      reviewId: "review-1",
    });
    expect(
      n.sessions.find((x) => x.planVersion === 2)!.exercises[0]!.load,
    ).toBe("新负荷");
  });
  it("拒绝追溯修改过去排期和超长周期", () => {
    const s = publishPlan(fixture(), plan());
    expect(() =>
      applyAdjustment(s, s.plans[0]!, shiftDate(today(), -1), "测试"),
    ).toThrow("今天或未来");
    expect(() =>
      generateSessions({ ...plan(), end: shiftDate(today(), 370) }),
    ).toThrow("一年");
  });
});
describe("旧数据、输入与备份", () => {
  it("旧版个人资料与问题导入，原表程度不当成已核实结论", () => {
    const r = [
      {
        id: "profile",
        kind: "profile" as const,
        payload: { birthYear: 1990, goal: "增肌", gainKg: 5 },
        version: 1,
        deleted: 0,
        updatedAt: new Date().toISOString(),
      },
      {
        id: "issue-P3",
        kind: "assessment" as const,
        payload: { topic: "头颈姿态", detail: "原表中等，未提供依据" },
        version: 1,
        deleted: 0,
        updatedAt: new Date().toISOString(),
      },
    ];
    const s = migrateLegacy(r);
    expect(s.profile.birthYear).toBe(1990);
    expect(s.problems[0]).toMatchObject({
      severity: "待评估",
      basis: "原表中等，未提供依据",
    });
    expect(s.assessment.confirmed).toBe(false);
    expect(r).toHaveLength(2);
  });
  it("拒绝不存在的日期、非法视频协议和无效指标", () => {
    const s = fixture();
    expect(
      systemSchema.safeParse({
        ...s,
        daily: [
          {
            id: "d",
            date: "2026-02-30",
            weight: 65,
            bodyFat: null,
            waist: null,
            sleep: null,
            heartRate: null,
            steps: null,
            energy: null,
            notes: "",
            source: "手动",
          },
        ],
      }).success,
    ).toBe(false);
    const p = plan();
    p.exercises[0]!.video = "javascript:alert(1)";
    expect(systemSchema.safeParse({ ...s, plans: [p] }).success).toBe(false);
  });
  it("备份有效验证及原子导入；相同编号保留当前版本", async () => {
    const r = await saveRecord("system", "execution-system", fixture(), 0);
    const parsed = parseBackup(JSON.stringify({ records: [r] }));
    expect(parsed[0]!.payload.schemaVersion).toBe(2);
    expect(await importRecords(parsed)).toBe(0);
    expect((await readRecords()).find((x) => x.id === r.id)!.version).toBe(1);
    expect(() => parseBackup(JSON.stringify({ records: [r, r] }))).toThrow(
      "重复",
    );
    expect(() => parseBackup("{")).toThrow("JSON");
  });
  it("并发修改不会覆盖；重复提交同一结果幂等", async () => {
    const s = fixture();
    const first = await saveRecord("system", "cas-test", s, 0);
    const a = { ...s, profile: { ...s.profile, name: "A" } },
      b = { ...s, profile: { ...s.profile, name: "B" } };
    const r = await Promise.allSettled([
      saveRecord("system", "cas-test", a, first.version),
      saveRecord("system", "cas-test", b, first.version),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(r.filter((x) => x.status === "rejected")).toHaveLength(1);
    const current = (await readRecords()).find((x) => x.id === "cas-test")!;
    expect(
      (await saveRecord("system", "cas-test", current.payload, 1)).version,
    ).toBe(2);
  });
});

it("方案错误只指出实际缺项", () => {
  const p = plan();
  p.progression = "";
  p.exercises[0]!.rest = "";
  const errors = planErrors(fixture(), p);
  expect(errors).toContain("请填写加量／减量规则");
  expect(errors).toContain("动作1：请填写休息");
  expect(errors.join("；")).not.toContain("请填写周期目标");
});
