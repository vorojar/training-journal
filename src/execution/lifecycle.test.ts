import { describe, it, expect } from "vitest";
import {
  emptySystem,
  reconcileSystem,
  systemSchema,
  type Plan,
  type Measurement,
} from "./domain";
import {
  archiveRecord,
  restoreTrash,
  recoverHistory,
  measurementGroups,
  templateFromPlan,
  planFromTemplate,
  differences,
} from "./lifecycle";
const plan: Plan = {
  id: "p",
  name: "A训练",
  coach: "教练",
  version: 1,
  status: "已发布",
  start: "2026-10-01",
  end: "2026-10-28",
  weekdays: [1, 3, 5],
  time: "18:00",
  minutes: 45,
  nextReview: "2026-10-15",
  goal: "力量",
  progression: "依据复查",
  cautions: "注意",
  exercises: [
    {
      id: "e",
      name: "深蹲",
      problemId: "personal-problem",
      purpose: "力量",
      method: "控制动作",
      sets: "3",
      reps: "8",
      load: "20kg",
      rest: "60秒",
      tempo: "",
      cautions: "",
      alternative: "",
      video: "",
    },
  ],
};
function daily() {
  return {
    id: "d",
    date: "2026-10-01",
    weight: 60,
    bodyFat: null,
    waist: null,
    sleep: null,
    heartRate: null,
    steps: null,
    energy: null,
    notes: "原值",
    source: "手动",
  };
}
function measurement(id = "m"): Measurement {
  return {
    id,
    date: "2026-10-01",
    problemId: "",
    metric: "颈部角度",
    value: 40,
    unit: "°",
    side: "整体",
    method: "同机位",
    assessor: "教练",
    target: 45,
    notes: "",
  };
}
describe("纠错与恢复", () => {
  it("归档每日记录保留原值和原因，恢复不改动其他数据", () => {
    const s = emptySystem();
    s.daily = [daily()];
    s.profile.name = "本人";
    const a = archiveRecord(s, "daily", "d", "录入错误");
    expect(a.daily).toEqual([]);
    expect(a.trash![0]!.item).toEqual(daily());
    expect(restoreTrash(a, a.trash![0]!.id).daily).toEqual([daily()]);
    expect(s.daily).toHaveLength(1);
    expect(a.profile.name).toBe("本人");
  });
  it("归档必须有原因，阻止重复编号恢复", () => {
    const s = emptySystem();
    s.daily = [daily()];
    expect(() => archiveRecord(s, "daily", "d", "")).toThrow();
    const a = archiveRecord(s, "daily", "d", "重复");
    a.daily = [daily()];
    expect(() => restoreTrash(a, a.trash![0]!.id)).toThrow("同编号");
  });
  it("归档方案仅取消未完成课次，已完成快照保留，恢复为草稿", () => {
    const s = emptySystem();
    s.plans = [plan];
    s.sessions = ["待完成", "已完成", "已暂停"].map((status, i) => ({
      id: "s" + i,
      planId: "p",
      planVersion: 1,
      date: "2026-10-01",
      time: "18:00",
      title: "A",
      minutes: 45,
      status: status as "待完成",
      exercises: [],
      cautions: "",
      actual: "完成",
      effort: null,
      symptoms: "",
      nextDay: "",
      completedAt: "",
    }));
    const a = archiveRecord(s, "plan", "p", "换周期");
    expect(a.sessions.map((x) => x.status)).toEqual([
      "已取消",
      "已完成",
      "已取消",
    ]);
    const r = restoreTrash(a, a.trash![0]!.id);
    expect(r.plans[0]!.status).toBe("草稿");
    expect(r.sessions).toEqual(a.sessions);
  });
  it("训练暂停期间可以原样恢复归档的已完成历史课次", () => {
    const s = emptySystem();
    s.trainingHold = { active: true, reason: "需评估", since: "2026-10-21" };
    s.sessions = [
      {
        id: "s",
        planId: "p",
        planVersion: 1,
        date: "2026-10-01",
        time: "18:00",
        title: "A",
        minutes: 45,
        status: "已完成",
        exercises: [],
        cautions: "",
        actual: "原始完成",
        effort: null,
        symptoms: "",
        nextDay: "",
        completedAt: "",
      },
    ];
    const a = archiveRecord(s, "session", "s", "误归档");
    expect(
      reconcileSystem(a, restoreTrash(a, a.trash![0]!.id)).sessions[0]!.status,
    ).toBe("已完成");
    const changed = restoreTrash(a, a.trash![0]!.id);
    changed.sessions[0]!.actual = "伪造";
    expect(() => reconcileSystem(a, changed)).toThrow("训练已暂停");
  });
  it("历史恢复只替换选择记录，并移出对应回收站", () => {
    const past = emptySystem();
    past.daily = [daily()];
    const now = emptySystem();
    now.profile.name = "另一台设备更新";
    now.daily = [
      { ...daily(), weight: 65 },
      { ...daily(), id: "d2", weight: 70 },
    ];
    const r = recoverHistory(now, past, "daily:d");
    expect(r.daily.map((x) => x.weight)).toEqual([70, 60]);
    expect(r.profile.name).toBe("另一台设备更新");
    expect(() => recoverHistory(now, past, "daily:no")).toThrow();
  });
  it("恢复问题取消评估确认，恢复方案不自动发布", () => {
    const past = emptySystem();
    past.plans = [plan];
    const now = emptySystem();
    expect(recoverHistory(now, past, "plan:p").plans[0]!.status).toBe("草稿");
  });
  it("字段差异能识别逐组数值和新增字段", () => {
    expect(
      differences(
        { setLogs: [{ id: "a", weight: 10 }] },
        { setLogs: [{ id: "a", weight: 20 }] },
      ),
    ).toEqual([{ path: "setLogs / a.weight", before: 10, after: 20 }]);
    expect(differences(undefined, { weight: 60 })).toEqual([
      { path: "weight", before: undefined, after: 60 },
    ]);
  });
  it("不能伪造归档原件或改写已归档原件", () => {
    const s = emptySystem();
    s.daily = [daily()];
    const archived = archiveRecord(s, "daily", "d", "归档");
    const changed = structuredClone(archived);
    if (changed.trash![0]!.kind === "daily")
      changed.trash![0]!.item.weight = 99;
    expect(() => reconcileSystem(s, changed)).toThrow("完整原件");
    expect(() => reconcileSystem(archived, changed)).toThrow("原件不可修改");
  });
  it("同日测量维持记录顺序，避免编号影响基线", () => {
    const s = emptySystem();
    s.measurements = [measurement("z"), { ...measurement("a"), value: 43 }];
    expect(measurementGroups(s)[0]!.map((x) => x.value)).toEqual([40, 43]);
  });
  it("重复记录编号不能保存", () => {
    const s = emptySystem();
    const n = { ...s, daily: [daily(), daily()] };
    expect(() => reconcileSystem(s, n)).toThrow("编号重复");
  });
});
describe("量化评估与模板", () => {
  it("测量仅在相同方法、单位、侧别和问题下比较，按日期排序", () => {
    const s = emptySystem();
    s.measurements = [
      { ...measurement("b"), date: "2026-10-02", value: 42 },
      measurement("a"),
      { ...measurement("c"), side: "左侧" },
      { ...measurement("d"), method: "不同机位" },
      { ...measurement("e"), unit: "cm" },
    ];
    const groups = measurementGroups(s);
    expect(groups).toHaveLength(4);
    expect(groups[0]!.map((x) => x.value)).toEqual([40, 42]);
  });
  it("拒绝未来测量和不存在的问题关联", () => {
    const s = emptySystem();
    expect(() =>
      reconcileSystem(s, {
        ...s,
        measurements: [{ ...measurement(), date: "2099-01-01" }],
      }),
    ).toThrow("未来");
    expect(() =>
      reconcileSystem(s, {
        ...s,
        measurements: [{ ...measurement(), problemId: "missing" }],
      }),
    ).toThrow("问题不存在");
  });
  it("照片只接受有限大小内嵌图片", () => {
    const s = emptySystem();
    s.measurements = [
      { ...measurement(), photo: "https://tracker.test/private" },
    ];
    expect(systemSchema.safeParse(s).success).toBe(false);
    s.measurements[0]!.photo = "data:image/png;base64,aGVsbG8=";
    expect(systemSchema.safeParse(s).success).toBe(true);
  });
  it("模板剔除学员关联、生成独立动作编号与新周期，不创建课次", () => {
    const t = templateFromPlan(plan);
    expect(t.exercises[0]!.problemId).toBe("");
    const a = planFromTemplate(t, "2026-11-01", "新教练"),
      b = planFromTemplate(t, "2026-12-01");
    expect(a.id).not.toBe(b.id);
    expect(a.exercises[0]!.id).not.toBe(b.exercises[0]!.id);
    expect(a.start).toBe("2026-11-01");
    expect(a.end).toBe("2026-11-28");
    expect(a.status).toBe("草稿");
    expect(a.coach).toBe("新教练");
    expect(plan.exercises[0]!.problemId).toBe("personal-problem");
  });
});
