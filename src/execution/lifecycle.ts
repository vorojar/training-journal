import {
  uid,
  today,
  shiftDate,
  type System,
  type Trash,
  type Plan,
  type PlanTemplate,
  type Measurement,
} from "./domain";
export const collections = {
  daily: "daily",
  session: "sessions",
  problem: "problems",
  plan: "plans",
  review: "reviews",
  measurement: "measurements",
} as const;
export const labels = {
  daily: "每日记录",
  session: "训练课次",
  problem: "问题",
  plan: "方案",
  review: "复查",
  measurement: "量化测量",
} as const;
export type Kind = keyof typeof collections;
export function archiveRecord(
  s: System,
  kind: Kind,
  id: string,
  reason: string,
): System {
  if (!reason.trim()) throw new Error("请填写归档原因");
  const key = collections[kind];
  const item = (s[key] ?? []).find((x) => x.id === id);
  if (!item) throw new Error("记录不存在或已归档");
  if (
    kind === "problem" &&
    s.plans.some((p) => p.exercises.some((e) => e.problemId === id))
  )
    throw new Error("该问题已关联方案，请先在方案中解除关联");
  if (kind === "review" && s.adjustments.some((a) => a.reviewId === id))
    throw new Error("该复查已关联调整，请通过历史对比纠错，保留调整依据");
  const next = {
    ...s,
    [key]: (s[key] ?? []).filter((x) => x.id !== id),
    trash: [
      ...(s.trash ?? []),
      {
        id: uid(),
        kind,
        item: structuredClone(item),
        at: new Date().toISOString(),
        reason: reason.trim(),
      } as Trash,
    ],
  };
  if (kind === "plan")
    next.sessions = s.sessions.map((x) =>
      x.planId === id && ["待完成", "已暂停"].includes(x.status)
        ? { ...x, status: "已取消" }
        : x,
    );
  if (kind === "problem")
    next.assessment = { ...s.assessment, confirmed: false };
  return next;
}
export function restoreTrash(s: System, id: string): System {
  const row = s.trash?.find((x) => x.id === id);
  if (!row) throw new Error("归档记录不存在");
  const key = collections[row.kind];
  if ((s[key] ?? []).some((x) => x.id === row.item.id))
    throw new Error("同编号记录已存在，请先核对历史");
  const item =
    row.kind === "plan"
      ? { ...structuredClone(row.item), status: "草稿" }
      : structuredClone(row.item);
  return {
    ...s,
    [key]: [...(s[key] ?? []), item],
    trash: s.trash!.filter((x) => x.id !== id),
    ...(row.kind === "problem"
      ? { assessment: { ...s.assessment, confirmed: false } }
      : {}),
  };
}
export function measurementGroups(s: System) {
  const map = new Map<string, Measurement[]>();
  for (const m of s.measurements ?? []) {
    const key = JSON.stringify([
      m.problemId,
      m.metric,
      m.unit,
      m.side,
      m.method.trim(),
    ]);
    const group = map.get(key);
    if (group) group.push(m);
    else map.set(key, [m]);
  }
  return [...map.values()].map((rows) =>
    rows.sort((a, b) => a.date.localeCompare(b.date)),
  );
}
export function templateFromPlan(p: Plan): PlanTemplate {
  return {
    id: uid(),
    name: p.name,
    goal: p.goal,
    progression: p.progression,
    cautions: p.cautions,
    weekdays: [...p.weekdays],
    time: p.time,
    minutes: p.minutes,
    weeks: Math.min(
      52,
      Math.max(
        1,
        Math.ceil(
          (Date.parse(p.end) - Date.parse(p.start) + 86400000) / 604800000,
        ),
      ),
    ),
    exercises: p.exercises.map((e) => ({ ...e, id: uid(), problemId: "" })),
  };
}
export function planFromTemplate(
  t: PlanTemplate,
  start = today(),
  coach = "",
): Plan {
  return {
    id: uid(),
    name: t.name,
    coach,
    version: 1,
    status: "草稿",
    start,
    end: shiftDate(start, t.weeks * 7 - 1),
    weekdays: [...t.weekdays],
    time: t.time,
    minutes: t.minutes,
    nextReview: shiftDate(start, 13),
    goal: t.goal,
    progression: t.progression,
    cautions: t.cautions,
    exercises: t.exercises.map((e) => ({ ...e, id: uid(), problemId: "" })),
  };
}
export function recordTitle(kind: Kind, item: Record<string, unknown>) {
  const name = String(
    item.name || item.title || item.metric || item.date || labels[kind],
  );
  if (kind === "session")
    return `${item.date} ${item.time} · ${name} · ${item.status}`;
  if (kind === "measurement") return `${item.date} · ${name} · ${item.side}`;
  if (kind === "plan") return `${name} · v${item.version}`;
  if (kind === "review")
    return `${item.date} · ${item.coach} · ${String(item.conclusion).slice(0, 24)}`;
  return name;
}
export function differences(
  before: unknown,
  after: unknown,
  path = "",
): { path: string; before: unknown; after: unknown }[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (Array.isArray(before) || Array.isArray(after)) {
    const a = Array.isArray(before) ? before : [],
      b = Array.isArray(after) ? after : [];
    if (
      [...a, ...b].every(
        (x) => x && typeof x === "object" && typeof x.id === "string",
      )
    ) {
      return [...new Set([...a, ...b].map((x) => x.id))].flatMap((id) => {
        const old = a.find((x) => x.id === id),
          next = b.find((x) => x.id === id),
          name = (next ?? old).name ?? (next ?? old).exerciseName ?? id;
        return differences(old, next, path + " / " + name);
      });
    }
    return [{ path, before, after }];
  }
  const a =
    before && typeof before === "object"
      ? (before as Record<string, unknown>)
      : undefined;
  const b =
    after && typeof after === "object"
      ? (after as Record<string, unknown>)
      : undefined;
  if (a || b)
    return [
      ...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]),
    ].flatMap((k) => differences(a?.[k], b?.[k], path ? path + "." + k : k));
  return [{ path, before, after }];
}
export type HistorySelection = { version: number; key: string };
export function recoverHistory(s: System, past: System, key: string): System {
  if (key === "profile")
    return { ...s, profile: structuredClone(past.profile) };
  if (key === "assessment")
    return { ...s, assessment: structuredClone(past.assessment) };
  const [kind, id] = key.split(":");
  if (!Object.hasOwn(collections, kind ?? "")) throw new Error("恢复类型无效");
  const collection = collections[kind as Kind];
  const item = (past[collection] ?? []).find((x) => x.id === id);
  if (!item) throw new Error("历史记录不存在");
  return {
    ...s,
    [collection]: [
      ...(s[collection] ?? []).filter((x) => x.id !== id),
      kind === "plan"
        ? { ...structuredClone(item), status: "草稿" }
        : structuredClone(item),
    ],
    trash: (s.trash ?? []).filter(
      (x) => !(x.kind === kind && x.item.id === id),
    ),
    ...(kind === "problem"
      ? { assessment: { ...s.assessment, confirmed: false } }
      : {}),
  };
}
