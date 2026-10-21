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
export const planSchema = z.object({
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
export const setLogSchema = z.object({
  id: short.min(1),
  exerciseId: short,
  exerciseName: short.min(1),
  reps: z.number().int().min(1).max(1000).nullable(),
  weight: num(0, 2000),
  seconds: num(1, 86400),
  done: z.boolean(),
});
export type SetLog = z.infer<typeof setLogSchema>;
const sessionSchema = z.object({
  id: short,
  planId: short,
  planVersion: z.number().int(),
  date,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  title: short,
  minutes: z.number().int().min(5).max(300),
  status: z.enum(["待完成", "已完成", "已跳过", "已取消", "已暂停"]),
  setLogs: z.array(setLogSchema).max(1000).optional(),
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
  planIds: z.array(short).max(200).optional(),
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
export const measurementSchema = z.object({
  id: short.min(1),
  problemId: short,
  date,
  metric: short.min(1),
  value: z.number().finite().min(-100000).max(100000),
  unit: short.min(1),
  side: z.enum(["整体", "左侧", "右侧"]),
  method: text.min(1),
  assessor: short.min(1),
  target: num(-100000, 100000),
  notes: text,
  photo: z
    .string()
    .max(420000)
    .refine(
      (v) =>
        !v || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v),
    )
    .optional(),
});
export type Measurement = z.infer<typeof measurementSchema>;
export const templateSchema = z.object({
  id: short.min(1),
  name: short.min(1),
  goal: text,
  progression: text,
  cautions: text,
  weekdays: z.array(z.number().int().min(0).max(6)),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  minutes: z.number().int().min(5).max(300),
  weeks: z.number().int().min(1).max(52),
  exercises: z.array(exerciseSchema).max(100),
});
export type PlanTemplate = z.infer<typeof templateSchema>;
const trashSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("daily"), item: dailySchema }),
    z.object({ kind: z.literal("session"), item: sessionSchema }),
    z.object({ kind: z.literal("problem"), item: problemSchema }),
    z.object({ kind: z.literal("plan"), item: planSchema }),
    z.object({ kind: z.literal("review"), item: reviewSchema }),
    z.object({ kind: z.literal("measurement"), item: measurementSchema }),
  ])
  .and(z.object({ id: short.min(1), at: short, reason: text.min(1) }));
export type Trash = z.infer<typeof trashSchema>;
export const systemSchema = z
  .object({
    schemaVersion: z.literal(2),
    profile: z.object({
      name: short,
      timeZone: z
        .string()
        .max(100)
        .refine((v) => {
          try {
            new Intl.DateTimeFormat("en", { timeZone: v });
            return true;
          } catch {
            return false;
          }
        })
        .optional(),
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
    measurements: z.array(measurementSchema).max(3000).optional(),
    trash: z.array(trashSchema).max(5000).optional(),
    templates: z.array(templateSchema).max(200).optional(),
    trainingHold: z
      .object({ active: z.boolean(), reason: text, since: date })
      .optional(),
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
export function today(timeZone?: string) {
  const d = new Date();
  if (timeZone) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    return ["year", "month", "day"]
      .map((k) => parts.find((p) => p.type === k)!.value)
      .join("-");
  }
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
    graded: s.problems.filter(
      (p) =>
        p.severity !== "待评估" &&
        [p.basis, p.measurement, p.goal, p.retest].every((v) => v.trim()),
    ).length,
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
  if (
    s.problems.some(
      (x) =>
        x.severity === "待评估" ||
        ![x.basis, x.measurement, x.goal, x.retest].every((v) => v.trim()),
    )
  )
    errors.push("请补齐所有问题的程度、分级依据、基线测量、改善目标和复查方法");
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
  if (!p.goal.trim()) errors.push("请填写周期目标");
  if (!p.progression.trim()) errors.push("请填写加量／减量规则");
  if (!p.exercises.length) errors.push("请至少填写一个训练动作");
  p.exercises.forEach((e, i) => {
    const missing = ([
      ["名称", e.name], ["方法", e.method], ["组数", e.sets],
      ["次数／时长", e.reps], ["负荷", e.load], ["休息", e.rest],
    ] as [string, string][]).filter(([, value]) => !value.trim()).map(([label]) => label);
    if (missing.length) errors.push(`动作${i + 1}：请填写${missing.join("、")}`);
  });
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
  const next = {
    ...s,
    plans: [published, ...s.plans.filter((x) => x.id !== p.id)],
    sessions: [...s.sessions, ...generateSessions(published)],
  };
  assertNoConflicts(s, next);
  return next;
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
  const next = {
    ...s,
    plans: s.plans.map((x) => (x.id === p.id ? updated : x)),
    sessions: [...sessions, ...added],
    adjustments: [adjustment, ...s.adjustments],
  };
  assertNoConflicts(s, next);
  return next;
}

export function assessmentErrors(s: System): string[] {
  const errors: string[] = [];
  if (
    assessmentFields.some(([k]) => !s.assessment.fields[k]?.trim()) ||
    !s.assessment.assessor.trim() ||
    !s.assessment.date ||
    !s.assessment.cautions.trim() ||
    !s.assessment.stopRules.trim()
  )
    errors.push("请补齐8项评估、评估人、日期、注意事项和暂停条件");
  if (
    s.problems.some(
      (p) =>
        p.severity === "待评估" ||
        ![p.basis, p.measurement, p.goal, p.retest].every((v) => v.trim()),
    )
  )
    errors.push("每个问题都需要程度、分级依据、基线测量、改善目标和复查方法");
  return errors;
}
function activeSession(s: Session) {
  return s.status === "待完成" || s.status === "已完成";
}
function slot(s: Session) {
  const start = Date.parse(`${s.date}T${s.time}:00Z`);
  return { start, end: start + s.minutes * 60000 };
}
export function calendarConflicts(s: System) {
  const rows = s.sessions
    .filter(activeSession)
    .map((x) => ({ x, ...slot(x) }))
    .sort((a, b) => a.start - b.start);
  const pairs: [Session, Session][] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length && rows[j]!.start < rows[i]!.end; j++) {
      if (rows[j]!.end > rows[i]!.start) pairs.push([rows[i]!.x, rows[j]!.x]);
    }
  }
  return pairs;
}
export function assertNoConflicts(before: System, next: System) {
  const changed = new Set(
    next.sessions
      .filter((n) => {
        const old = before.sessions.find((o) => o.id === n.id);
        return (
          !old ||
          old.date !== n.date ||
          old.time !== n.time ||
          old.minutes !== n.minutes ||
          (!activeSession(old) && activeSession(n))
        );
      })
      .map((x) => x.id),
  );
  const conflict = calendarConflicts(next).find(
    ([a, b]) => changed.has(a.id) || changed.has(b.id),
  );
  if (conflict) {
    const [a, b] = conflict;
    throw new Error(
      `训练时间冲突：${a.date} ${a.time}「${a.title}」与${b.date} ${b.time}「${b.title}」重叠，请调整日期或时间`,
    );
  }
}
export function reviewPlans(s: System, r: Review) {
  const ids =
    r.planIds ?? s.plans.filter((p) => p.status === "已发布").map((p) => p.id);
  return s.plans.filter((p) => ids.includes(p.id));
}
export function reviewProgress(s: System, r: Review) {
  const plans = reviewPlans(s, r);
  return {
    plans,
    remaining: plans.filter(
      (p) =>
        !s.adjustments.some((a) => a.reviewId === r.id && a.planId === p.id),
    ),
  };
}
export function reconcileSystem(
  before: System,
  input: System,
  day = today(input.profile.timeZone),
  allowHistoricalImport = false,
): System {
  const next = structuredClone(input);
  for (const rows of [
    next.problems,
    next.plans,
    next.sessions,
    next.daily,
    next.reviews,
    next.adjustments,
    next.measurements ?? [],
    next.trash ?? [],
    next.templates ?? [],
  ]) {
    if (new Set(rows.map((x) => x.id)).size !== rows.length)
      throw new Error("记录编号重复，请核对后重新保存");
  }
  for (const m of next.measurements ?? []) {
    const prior = before.measurements?.find((x) => x.id === m.id);
    if (JSON.stringify(prior) !== JSON.stringify(m)) {
      if (m.date > day) throw new Error("不能记录未来的测量");
      if (m.problemId && !next.problems.some((p) => p.id === m.problemId))
        throw new Error("测量关联的问题不存在");
    }
  }
  const archiveKeys = {
    daily: "daily",
    session: "sessions",
    problem: "problems",
    plan: "plans",
    review: "reviews",
    measurement: "measurements",
  } as const;
  for (const archived of allowHistoricalImport ? [] : (next.trash ?? [])) {
    const prior = before.trash?.find((x) => x.id === archived.id);
    if (prior) {
      if (JSON.stringify(prior) !== JSON.stringify(archived))
        throw new Error("归档原件不可修改，请恢复后纠正记录");
      continue;
    }
    const key = archiveKeys[archived.kind];
    const original = (before[key] ?? []).find((x) => x.id === archived.item.id);
    if (
      !original ||
      JSON.stringify(original) !== JSON.stringify(archived.item) ||
      (next[key] ?? []).some((x) => x.id === archived.item.id)
    )
      throw new Error("归档必须保留当前记录的完整原件");
  }
  const newReview = next.reviews.find(
    (r) =>
      r.action === "进一步评估" &&
      !before.reviews.some((old) => old.id === r.id),
  );
  if (
    newReview ||
    (before.assessment.confirmed &&
      !next.assessment.confirmed &&
      next.sessions.some((row) => row.status === "待完成")) ||
    (!next.assessment.confirmed &&
      next.plans.some((p) => p.status === "已发布") &&
      next.sessions.some((row) => row.status === "待完成") &&
      !before.trainingHold?.active)
  ) {
    next.assessment.confirmed = false;
    next.trainingHold = {
      active: true,
      reason:
        newReview?.conclusion || "评估或问题分级已更新，请重新核对训练边界",
      since: newReview?.date || day,
    };
  } else if (before.trainingHold?.active) {
    if (
      next.assessment.confirmed &&
      (!before.assessment.confirmed ||
        JSON.stringify(before.assessment) !== JSON.stringify(next.assessment) ||
        JSON.stringify(before.problems) !== JSON.stringify(next.problems))
    ) {
      const errors = assessmentErrors(next);
      if (errors.length) throw new Error(errors.join("；"));
      next.trainingHold = { ...before.trainingHold, active: false };
    } else next.trainingHold = before.trainingHold;
  }
  if (
    next.assessment.confirmed &&
    (!before.assessment.confirmed ||
      JSON.stringify(before.assessment) !== JSON.stringify(next.assessment) ||
      JSON.stringify(before.problems) !== JSON.stringify(next.problems))
  ) {
    const errors = assessmentErrors(next);
    if (errors.length) throw new Error(errors.join("；"));
  }
  if (next.trainingHold?.active) {
    for (const row of next.sessions) {
      const archived = before.trash?.find(
        (x) =>
          x.kind === "session" &&
          x.item.id === row.id &&
          JSON.stringify(x.item) === JSON.stringify(row),
      );
      const old =
        before.sessions.find((x) => x.id === row.id) ??
        (archived?.kind === "session" ? archived.item : undefined);
      if (
        row.status === "已完成" &&
        old?.status !== "已完成" &&
        !(allowHistoricalImport && row.date <= day)
      )
        throw new Error("训练已暂停，请先完成重新评估并由评估人确认恢复");
    }
    next.sessions = next.sessions.map((row) =>
      row.status === "待完成" ? { ...row, status: "已暂停" } : row,
    );
  } else if (before.trainingHold?.active) {
    next.sessions = next.sessions.map((row) =>
      row.status === "已暂停" && row.date >= day
        ? { ...row, status: "待完成" }
        : row,
    );
  }
  for (const row of next.sessions) {
    const archived = before.trash?.find(
      (x) =>
        x.kind === "session" &&
        x.item.id === row.id &&
        JSON.stringify(x.item) === JSON.stringify(row),
    );
    const old =
      before.sessions.find((x) => x.id === row.id) ??
      (archived?.kind === "session" ? archived.item : undefined);
    if (
      row.status === "已完成" &&
      old?.status !== "已完成" &&
      !(allowHistoricalImport && row.date <= day)
    ) {
      if (!next.assessment.confirmed || assessmentErrors(next).length)
        throw new Error("请先补齐并确认评估，再完成训练记录");
      if (row.date > day) throw new Error("未来课次不能提前标记完成");
      if (!row.actual.trim() && !row.setLogs?.some((set) => set.done))
        throw new Error("请填写实际训练内容或完成组记录");
    }
    if (
      new Set(row.setLogs?.map((x) => x.id)).size !== (row.setLogs?.length ?? 0)
    )
      throw new Error("组记录编号重复");
    for (const set of row.setLogs ?? []) {
      if (
        !row.exercises.some(
          (e) => e.id === set.exerciseId && e.name === set.exerciseName,
        )
      )
        throw new Error("组记录必须对应本次训练的动作");
      if (
        set.done &&
        !((set.reps !== null && set.weight !== null) || set.seconds !== null)
      )
        throw new Error("完成一组前，请填写次数与负重（自重填0），或实际时长");
    }
  }
  assertNoConflicts(before, next);
  return next;
}
export function strengthSeries(s: System, name: string) {
  const grouped = new Map<
    string,
    {
      date: string;
      load: number;
      volume: number;
      reps: number;
      sets: number;
      estimatedMax: number | null;
    }
  >();
  for (const session of s.sessions.filter((x) => x.status === "已完成"))
    for (const log of session.setLogs ?? []) {
      if (
        !log.done ||
        log.exerciseName.trim() !== name.trim() ||
        log.reps === null ||
        log.weight === null
      )
        continue;
      const row = grouped.get(session.date) ?? {
        date: session.date,
        load: 0,
        volume: 0,
        reps: 0,
        sets: 0,
        estimatedMax: null,
      };
      row.load = Math.max(row.load, log.weight);
      row.volume += log.weight * log.reps;
      row.reps += log.reps;
      row.sets++;
      if (log.weight > 0 && log.reps <= 10) {
        const estimate =
          log.reps === 1 ? log.weight : log.weight * (1 + log.reps / 30);
        row.estimatedMax = Math.max(row.estimatedMax ?? 0, estimate);
      }
      grouped.set(session.date, row);
    }
  return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date));
}
