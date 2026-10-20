import { describe, it, expect } from "vitest";
import {
  emptySystem,
  assessmentFields,
  today,
  shiftDate,
  publishPlan,
  applyAdjustment,
  reconcileSystem,
  reviewProgress,
  strengthSeries,
  type Plan,
  type Review,
} from "./domain";
function ready() {
  const s = emptySystem();
  s.assessment = {
    fields: Object.fromEntries(assessmentFields.map(([k]) => [k, "测试结果"])),
    confirmed: true,
    assessor: "测试教练",
    date: today(),
    cautions: "测试注意",
    stopRules: "测试暂停",
  };
  s.problems = [
    {
      id: "p",
      name: "测试问题",
      severity: "轻度",
      priority: "本阶段重点",
      basis: "测量依据",
      measurement: "3次",
      goal: "5次",
      retest: "每周同条件测量",
      cautions: "",
    },
  ];
  return s;
}
function plan(id = "a", time = "18:00"): Plan {
  return {
    id,
    name: id,
    coach: "教练",
    version: 1,
    status: "草稿",
    start: today(),
    end: shiftDate(today(), 7),
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    time,
    minutes: 45,
    nextReview: shiftDate(today(), 7),
    goal: "测试目标",
    progression: "复查再进阶",
    cautions: "",
    exercises: [
      {
        id: "e",
        name: "深蹲",
        problemId: "p",
        purpose: "力量",
        method: "测试方法",
        sets: "2",
        reps: "8次",
        load: "测试负荷",
        rest: "60秒",
        tempo: "",
        cautions: "",
        alternative: "",
        video: "",
      },
    ],
  };
}
function review(): Review {
  return {
    id: "r",
    date: today(),
    coach: "教练",
    conclusion: "需要进一步评估",
    nextDate: shiftDate(today(), 7),
    action: "进一步评估",
    changes: [],
  };
}
describe("执行规则回归", () => {
  it("基线、目标、复测任一缺失都不能发布", () => {
    for (const key of ["measurement", "goal", "retest"] as const) {
      const s = ready();
      s.problems[0]![key] = "";
      expect(() => publishPlan(s, plan())).toThrow("基线测量");
    }
  });
  it("进一步评估暂停所有未完成课次，保留已完成；禁止绕过暂停打卡", () => {
    const before = publishPlan(ready(), plan());
    before.sessions[0]!.status = "已完成";
    before.sessions[0]!.actual = "历史记录";
    const next = reconcileSystem(before, { ...before, reviews: [review()] });
    expect(next.trainingHold?.active).toBe(true);
    expect(next.sessions.filter((x) => x.status === "已暂停")).toHaveLength(7);
    expect(next.sessions[0]).toEqual(before.sessions[0]);
    const forged = structuredClone(next);
    forged.sessions[1]!.status = "已完成";
    expect(() => reconcileSystem(next, forged)).toThrow("已暂停");
    const resumed = reconcileSystem(next, {
      ...next,
      assessment: { ...next.assessment, confirmed: true },
    });
    expect(resumed.sessions.filter((x) => x.status === "待完成")).toHaveLength(
      7,
    );
  });
  it("未确认评估不能通过直接改状态完成训练；历史导入仍保留已完成资料", () => {
    const before = publishPlan(ready(), plan());
    before.assessment.confirmed = false;
    const next = structuredClone(before);
    next.sessions[0]!.status = "已完成";
    next.sessions[0]!.actual = "历史训练";
    expect(() => reconcileSystem(before, next)).toThrow();
    const imported = reconcileSystem(emptySystem(), next, today(), true);
    expect(imported.sessions[0]!.status).toBe("已完成");
  });
  it("拒绝相同时间、部分重叠、跨午夜冲突；相邻时间允许", () => {
    const s = publishPlan(ready(), plan());
    expect(() => publishPlan(s, plan("b", "18:00"))).toThrow("时间冲突");
    expect(() => publishPlan(s, plan("b", "18:30"))).toThrow("时间冲突");
    expect(() => publishPlan(s, plan("b", "18:45"))).not.toThrow();
    const n = publishPlan(ready(), { ...plan(), time: "23:45", minutes: 45 });
    expect(() =>
      publishPlan(n, { ...plan("b", "00:10"), start: shiftDate(today(), 1) }),
    ).toThrow("时间冲突");
  });
  it("改期也检查冲突，跳过和取消课次不占用时段", () => {
    const s = publishPlan(publishPlan(ready(), plan()), plan("b", "19:00"));
    const next = structuredClone(s);
    next.sessions.find((x) => x.planId === "b")!.time = "18:15";
    expect(() => reconcileSystem(s, next)).toThrow("时间冲突");
    next.sessions.find((x) => x.planId === "b")!.status = "已跳过";
    expect(() => reconcileSystem(s, next)).not.toThrow();
  });
  it("复查逐方案核对，调整A后B仍待处理，旧数据也支持", () => {
    const s = publishPlan(publishPlan(ready(), plan()), plan("b", "19:00"));
    const r = {
      ...review(),
      action: "调整后续计划" as const,
      planIds: ["a", "b"],
    };
    const adjusted = applyAdjustment(
      s,
      s.plans.find((x) => x.id === "a")!,
      today(),
      "复查调整",
      r.id,
    );
    expect(reviewProgress(adjusted, r).remaining.map((x) => x.id)).toEqual([
      "b",
    ]);
    const finished = applyAdjustment(
      adjusted,
      adjusted.plans.find((x) => x.id === "b")!,
      today(),
      "复查调整",
      r.id,
    );
    expect(reviewProgress(finished, r).remaining).toHaveLength(0);
  });
  it("力量统计只计已完成课次的完成组，不计草稿，按动作汇总", () => {
    const s = publishPlan(ready(), plan());
    s.sessions[0]!.status = "已完成";
    s.sessions[0]!.setLogs = [
      {
        id: "s1",
        exerciseId: "e",
        exerciseName: "深蹲",
        reps: 8,
        weight: 20,
        seconds: null,
        done: true,
      },
      {
        id: "s2",
        exerciseId: "e",
        exerciseName: "深蹲",
        reps: 6,
        weight: 25,
        seconds: null,
        done: true,
      },
      {
        id: "s3",
        exerciseId: "e",
        exerciseName: "深蹲",
        reps: 8,
        weight: 100,
        seconds: null,
        done: false,
      },
    ];
    s.sessions[1]!.setLogs = [{ ...s.sessions[0]!.setLogs![0]!, weight: 200 }];
    expect(strengthSeries(s, "深蹲")[0]).toMatchObject({
      load: 25,
      volume: 310,
      reps: 14,
      sets: 2,
      estimatedMax: 30,
    });
  });
});
