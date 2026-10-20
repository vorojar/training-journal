import { z } from "zod";
import type { SavedRecord } from "../lib/model";

export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === v;
  });
const text = z.string().max(10000),
  short = z.string().max(200),
  optionalDate = date.or(z.literal(""));
const num = (min: number, max: number) =>
  z.number().finite().min(min).max(max).nullable();
export const severity = ["待评估", "轻度", "中度", "重度", "已改善"] as const;
export const assessmentFields = [
  ["history", "病史、手术与用药", "类型、时间、恢复情况；没有也请写“无”"],
  [
    "restriction",
    "运动限制与专业意见",
    "已有医嘱、禁忌、允许范围与有效期限；需核实的内容请明确写出",
  ],
  ["symptoms", "当前症状与活动耐受", "气短、胸痛、头晕、疼痛的触发情况与恢复"],
  [
    "posture",
    "体态、关节活动与动作筛查",
    "头颈、肩背、髋膝足踝；观察方法和结果",
  ],
  [
    "strength",
    "力量、平衡与训练基础",
    "相同条件下的动作版本、负荷、次数和左右侧表现",
  ],
  ["recovery", "生活、饮食与恢复", "工作久坐、睡眠、饮食、近期体重趋势"],
  [
    "availability",
    "时间、场地与器械",
    "每周可练日期、时长、器械与教练陪同条件",
  ],
  [
    "baseline",
    "身体基线与目标",
    "身高、体重、体脂、围度；可量化目标和目标期限",
  ],
] as const;
const problemSchema = z.object({
  id: short,
  name: short.min(1),
  severity: z.enum(severity),
  priority: z.enum(["优先处理", "本阶段重点", "持续观察"]),
  basis: text,
  measurement: text,
  goal: text,
  retest: text,
  cautions: text,
});
const exerciseSchema = z.object({
  id: short,
  name: short.min(1),
  problemId: short,
  purpose: text,
  method: text,
  sets: short,
  reps: short,
  load: short,
  rest: short,
  tempo: short,
  cautions: text,
  alternative: text,
  video: short.refine(
    (v) => !v || /^https?:\/\//i.test(v),
    "请填写 http 或 https 链接",
  ),
});
const planSchema = z.object({
  id: short,
  name: short.min(1),
  coach: short,
  version: z.number().int().min(1),
  status: z.enum(["草稿", "已发布"]),
  start: date,
  end: date,
  weekdays: z.array(z.number().int().min(0).max(6)),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  minutes: z.number().int().min(5).max(300),
  nextReview: optionalDate,
  goal: text,
  progression: text,
  cautions: text,
  exercises: z.array(exerciseSchema).max(100),
});
const sessionSchema = z.object({
  id: short,
  planId: short,
  planVersion: z.number().int(),
  date,
  time: short,
  title: short,
  minutes: z.number(),
  status: z.enum(["待完成", "已完成", "已跳过", "已取消"]),
  exercises: z.array(exerciseSchema),
  cautions: text,
  actual: text,
  effort: num(0, 10),
  symptoms: text,
  nextDay: text,
  completedAt: short,
});
const dailySchema = z.object({
  id: short,
  date,
  weight: num(15, 350),
  bodyFat: num(1, 75),
  waist: num(20, 250),
  sleep: num(0, 24),
  heartRate: num(20, 250),
  steps: num(0, 200000),
  energy: num(0, 10),
  notes: text,
  source: short,
});
const reviewSchema = z.object({
  id: short,
  date,
  coach: short,
  conclusion: text,
  nextDate: optionalDate,
  changes: z.array(
    z.object({
      problemId: short,
      name: short,
      before: z.enum(severity),
      after: z.enum(severity),
      measurement: text,
      method: text,
    }),
  ),
  action: z.enum(["继续原计划", "调整后续计划", "进一步评估"]),
});
const adjustmentSchema = z.object({
  id: short,
  date,
  effective: date,
  reason: text,
  reviewId: short,
  planId: short,
  fromVersion: z.number().int(),
  toVersion: z.number().int(),
  cancelled: z.number().int(),
  scheduled: z.number().int(),
  summary: text,
});
export const systemSchema = z
  .object({
    schemaVersion: z.literal(2),
    profile: z.object({
      name: short,
      birthYear: num(1900, 2100),
      goal: text,
      height: num(50, 250),
      baselineWeight: num(15, 350),
      gainKg: num(0, 100),
      coach: short,
    }),
    assessment: z.object({
      fields: z.record(text),
      assessor: short,
      date: optionalDate,
      confirmed: z.boolean(),
      cautions: text,
      stopRules: text,
    }),
    problems: z.array(problemSchema).max(200),
    plans: z.array(planSchema).max(200),
    sessions: z.array(sessionSchema).max(5000),
    daily: z.array(dailySchema).max(5000),
    reviews: z.array(reviewSchema).max(1000),
    adjustments: z.array(adjustmentSchema).max(1000),
  })
  .strict();
export type System = z.infer<typeof systemSchema>;
export type Problem = z.infer<typeof problemSchema>;
export type Exercise = z.infer<typeof exerciseSchema>;
export type Plan = z.infer<typeof planSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Daily = z.infer<typeof dailySchema>;
export type Review = z.infer<typeof reviewSchema>;
export type Adjustment = z.infer<typeof adjustmentSchema>;
export const uid = () => crypto.randomUUID();
export function shiftDate(value: string, days: number) {
  const d = new Date(value + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function today() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}
export function emptySystem(): System {
  return {
    schemaVersion: 2,
    profile: {
      name: "",
      birthYear: null,
      goal: "增肌增重 · 改善体态 · 提升力量",
      height: null,
      baselineWeight: null,
      gainKg: 5,
      coach: "",
    },
    assessment: {
      fields: {},
      assessor: "",
      date: "",
      confirmed: false,
      cautions: "",
      stopRules: "",
    },
    problems: [],
    plans: [],
    sessions: [],
    daily: [],
    reviews: [],
    adjustments: [],
  };
}
export function migrateLegacy(records: SavedRecord[]): System {
  const active = records.filter((r) => !r.deleted),
    s = emptySystem(),
    p = active.find((r) => r.id === "profile")?.payload;
  if (p)
    s.profile = {
      ...s.profile,
      birthYear: p.birthYear ?? null,
      goal: p.goal || s.profile.goal,
      height: p.height ?? null,
      baselineWeight: p.baselineWeight ?? null,
      gainKg: p.gainKg ?? 5,
      coach: p.coach || "",
    };
  const mappings: Record<string, string> = {
    "assessment-9": "history",
    "assessment-10": "history",
    "assessment-11": "symptoms",
    "assessment-12": "restriction",
    "assessment-13": "symptoms",
    "assessment-14": "history",
    "assessment-15": "availability",
    "assessment-16": "availability",
    "assessment-17": "recovery",
    "assessment-18": "stopRules",
    "assessment-19": "recovery",
  };
  for (const r of active.filter((r) => r.kind === "assessment")) {
    const a = r.payload;
    if (r.id.startsWith("issue-"))
      s.problems.push({
        id: r.id,
        name: a.topic,
        severity: "待评估",
        priority: "本阶段重点",
        basis: a.detail,
        measurement: "",
        goal: "",
        retest: "",
        cautions: "",
      });
    else {
      const k = mappings[r.id] || "history";
      if (k === "stopRules") s.assessment.stopRules = a.detail;
      else if (a.detail)
        s.assessment.fields[k] = [
          s.assessment.fields[k],
          a.topic + "：" + a.detail,
        ]
          .filter(Boolean)
          .join("\n");
    }
  }
  const grouped = new Map<string, SavedRecord>();
  for (const r of active
    .filter((r) => r.kind === "weight")
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)))
    grouped.set(r.payload.date, r);
  s.daily = [...grouped.values()].map((r) => ({
    id: r.id,
    date: r.payload.date,
    weight: r.payload.weight,
    bodyFat: null,
    waist: r.payload.waist,
    sleep: r.payload.sleep,
    heartRate: null,
    steps: null,
    energy: null,
    notes: [r.payload.notes, r.payload.food, r.payload.appetite]
      .filter(Boolean)
      .join("\n"),
    source: "原版记录",
  }));
  return s;
}
export function readiness(s: System) {
  return {
    fields: assessmentFields.filter(([key]) => s.assessment.fields[key]?.trim())
      .length,
    total: assessmentFields.length,
    confirmed: s.assessment.confirmed,
    graded: s.problems.filter((p) => p.severity !== "待评估" && p.basis.trim())
      .length,
  };
}
export function planErrors(s: System, p: Plan): string[] {
  const errors: string[] = [];
  if (
    !s.assessment.confirmed ||
    assessmentFields.some(([k]) => !s.assessment.fields[k]?.trim()) ||
    !s.assessment.assessor.trim() ||
    !s.assessment.date ||
    !s.assessment.cautions.trim() ||
    !s.assessment.stopRules.trim()
  )
    errors.push("请先完成并确认训练前评估");
  if (s.problems.some((x) => x.severity === "待评估" || !x.basis.trim()))
    errors.push("请补齐所有问题的分级与分级依据");
  if (!p.coach.trim()) errors.push("请填写制定教练");
  if (p.end < p.start) errors.push("结束日期不能早于开始日期");
  if (Date.parse(p.end) - Date.parse(p.start) > 366 * 86400000)
    errors.push("单次周期请控制在一年以内");
  if (!p.weekdays.length) errors.push("请至少选择一个训练日");
  if (
    p.end >= p.start &&
    Date.parse(p.end) - Date.parse(p.start) <= 366 * 86400000 &&
    p.weekdays.length &&
    !generateSessions(p).length
  )
    errors.push("所选周期内没有对应星期，请调整日期或训练日");
  if (!p.nextReview || p.nextReview < p.start || p.nextReview > p.end)
    errors.push("请填写周期内的下次复查日期");
  if (!p.goal.trim() || !p.progression.trim())
    errors.push("请填写周期目标和加量／减量规则");
  if (!p.exercises.length) errors.push("请至少填写一个训练动作");
  if (
    p.exercises.some(
      (e) =>
        ![e.name, e.method, e.sets, e.reps, e.load, e.rest].every((v) =>
          v.trim(),
        ),
    )
  )
    errors.push("每个动作都需要方法、组数、次数／时长、负荷和休息");
  return errors;
}
export function generateSessions(p: Plan, from = p.start): Session[] {
  const result: Session[] = [];
  if (
    p.end < p.start ||
    Date.parse(p.end) - Date.parse(p.start) > 366 * 86400000
  )
    throw new Error("周期日期无效或超过一年");
  for (let d = p.start; d <= p.end; d = shiftDate(d, 1)) {
    if (
      d < from ||
      !p.weekdays.includes(new Date(d + "T00:00:00Z").getUTCDay())
    )
      continue;
    result.push({
      id: `${p.id}-v${p.version}-${d}`,
      planId: p.id,
      planVersion: p.version,
      date: d,
      time: p.time,
      title: p.name,
      minutes: p.minutes,
      status: "待完成",
      exercises: structuredClone(p.exercises),
      cautions: p.cautions,
      actual: "",
      effort: null,
      symptoms: "",
      nextDay: "",
      completedAt: "",
    });
  }
  return result;
}
export function publishPlan(s: System, p: Plan): System {
  const errors = planErrors(s, p);
  if (errors.length) throw new Error(errors.join("；"));
  if (s.plans.some((x) => x.id === p.id && x.status === "已发布"))
    throw new Error("已发布方案请通过复查调整，保留原有执行记录");
  const published = { ...p, status: "已发布" as const };
  return {
    ...s,
    plans: [published, ...s.plans.filter((x) => x.id !== p.id)],
    sessions: [...s.sessions, ...generateSessions(published)],
  };
}
export function applyAdjustment(
  s: System,
  p: Plan,
  effective: string,
  reason: string,
  reviewId = "",
): System {
  const old = s.plans.find((x) => x.id === p.id && x.status === "已发布");
  if (!old) throw new Error("找不到已发布的原方案");
  if (effective < today()) throw new Error("调整仅能从今天或未来开始");
  if (effective < p.start || effective > p.end)
    throw new Error("生效日期需要在调整后的周期内");
  if (!reason.trim()) throw new Error("请填写调整原因");
  const updated = { ...p, version: old.version + 1, status: "已发布" as const };
  const errors = planErrors(s, updated);
  if (errors.length) throw new Error(errors.join("；"));
  let cancelled = 0;
  const sessions = s.sessions.map((x) => {
    if (x.planId === p.id && x.status === "待完成" && x.date >= effective) {
      cancelled++;
      return { ...x, status: "已取消" as const };
    }
    return x;
  });
  const protectedDates = new Set(
    sessions
      .filter((x) => x.planId === p.id && x.status !== "已取消")
      .map((x) => x.date),
  );
  const added = generateSessions(updated, effective).filter(
    (x) => !protectedDates.has(x.date),
  );
  const adjustment: Adjustment = {
    id: uid(),
    date: today(),
    effective,
    reason,
    reviewId,
    planId: p.id,
    fromVersion: old.version,
    toVersion: updated.version,
    cancelled,
    scheduled: added.length,
    summary: `${old.name} v${old.version} → ${updated.name} v${updated.version}；${updated.start} 至 ${updated.end}`,
  };
  return {
    ...s,
    plans: s.plans.map((x) => (x.id === p.id ? updated : x)),
    sessions: [...sessions, ...added],
    adjustments: [adjustment, ...s.adjustments],
  };
}
