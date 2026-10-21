import assert from "node:assert/strict";
import fs from "node:fs";
import {
  assessmentFields,
  publishPlan,
  applyAdjustment,
  today,
  shiftDate,
  strengthSeries,
  reviewProgress,
} from "../src/execution/domain.ts";
const q = JSON.parse(fs.readFileSync(process.env.QA_FIXTURE, "utf8"));
const { owner, coach, other } = q;
assert(owner.email.endsWith("@example.invalid"));
const base = q.base,
  path = "/api/spaces/" + owner.space;
let checks = 0;
async function call(
  who,
  url,
  body,
  method = body ? "POST" : "GET",
  expected = 200,
) {
  const r = await fetch(base + url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Fitness-Client": "4",
      Origin: base,
      Cookie: who?.cookie ?? "",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await r.json();
  assert.equal(
    r.status,
    expected,
    `${method} ${url.replace(/\/spaces\/[^/]+/, "/spaces/[id]")}: ${JSON.stringify(value).slice(0, 180)}`,
  );
  checks++;
  return value;
}
await call(owner, path + "/members/" + coach.user, { status: "active" }, "PUT");
let doc = await call(owner, path + "/document");
async function save(who, payload, action = "验收执行流程", status = 200) {
  const result = await call(
    who,
    path + "/document",
    { payload, version: doc.version, mutationId: crypto.randomUUID(), action },
    "PUT",
    status,
  );
  if (status === 200) doc = result;
  return result;
}
const prepared = structuredClone(doc.payload);
prepared.sessions = prepared.sessions.map((x) => ({ ...x, status: "已取消" }));
prepared.assessment = {
  fields: Object.fromEntries(
    assessmentFields.map(([key]) => [key, "升级验收用虚构评估"]),
  ),
  confirmed: true,
  assessor: "验收教练",
  date: today(),
  cautions: "验收注意",
  stopRules: "验收暂停",
};
prepared.problems = [
  {
    id: "qa-problem",
    name: "验收问题",
    severity: "轻度",
    priority: "本阶段重点",
    basis: "验收依据",
    measurement: "3次",
    goal: "5次",
    retest: "每周同条件测量",
    cautions: "",
  },
];
const plan = {
  id: "upgrade-a",
  name: "升级验收A",
  coach: "验收教练",
  version: 1,
  status: "草稿",
  start: today(),
  end: shiftDate(today(), 7),
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  time: "18:00",
  minutes: 45,
  nextReview: shiftDate(today(), 7),
  goal: "验收",
  progression: "复查后进阶",
  cautions: "验收",
  exercises: [
    {
      id: "upgrade-e",
      name: "验收深蹲",
      problemId: "qa-problem",
      purpose: "力量",
      method: "验收方法",
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
for (const key of ["measurement", "goal", "retest"]) {
  const invalid = structuredClone(prepared);
  invalid.problems[0][key] = "";
  await save(coach, invalid, "验收：拒绝不完整确认", 400);
}
await save(
  coach,
  publishPlan(publishPlan(prepared, plan), {
    ...plan,
    id: "upgrade-b",
    name: "升级验收B",
    time: "19:00",
  }),
  "验收：发布A/B方案",
);
const overlap = structuredClone(doc.payload);
overlap.sessions.find((x) => x.planId === "upgrade-b").time = "18:30";
await save(coach, overlap, "验收：拒绝重叠改期", 400);
let next = structuredClone(doc.payload);
const completed = next.sessions.find(
  (x) => x.planId === "upgrade-a" && x.date === today(),
);
completed.status = "已完成";
completed.setLogs = [
  {
    id: "set-1",
    exerciseId: "upgrade-e",
    exerciseName: "验收深蹲",
    reps: 8,
    weight: 20,
    seconds: null,
    done: true,
  },
  {
    id: "set-2",
    exerciseId: "upgrade-e",
    exerciseName: "验收深蹲",
    reps: 6,
    weight: 25,
    seconds: null,
    done: true,
  },
];
completed.completedAt = new Date().toISOString();
await save(owner, next, "验收：保存逐组完成");
assert.equal(strengthSeries(doc.payload, "验收深蹲")[0].volume, 310);
const originalCompleted = structuredClone(
  doc.payload.sessions.find((x) => x.id === completed.id),
);
next = structuredClone(doc.payload);
next.sessions.find((x) => x.id === completed.id).setLogs[0].weight = 999;
await save(coach, next, "验收：教练不能修改实际组记录", 403);
next = structuredClone(doc.payload);
next.reviews.unshift({
  id: "hold-review",
  date: today(),
  coach: "验收教练",
  conclusion: "升级验收：进一步评估",
  nextDate: shiftDate(today(), 1),
  action: "进一步评估",
  changes: [],
  planIds: ["upgrade-a", "upgrade-b"],
});
await save(coach, next, "验收：进一步评估暂停训练");
assert(doc.payload.trainingHold.active);
assert(doc.payload.sessions.some((x) => x.status === "已暂停"));
assert.deepEqual(
  doc.payload.sessions.find((x) => x.id === completed.id),
  originalCompleted,
);
next = structuredClone(doc.payload);
next.sessions.find((x) => x.status === "已暂停").status = "已完成";
await save(owner, next, "验收：暂停禁止打卡", 400);
next = structuredClone(doc.payload);
next.assessment.confirmed = true;
await save(coach, next, "验收：重新确认恢复");
assert.equal(doc.payload.trainingHold.active, false);
assert(
  !doc.payload.sessions.some((x) => x.status === "已暂停" && x.date >= today()),
);
next = structuredClone(doc.payload);
const review = {
  id: "adjust-review",
  date: today(),
  coach: "验收教练",
  conclusion: "升级验收：调整A/B",
  nextDate: shiftDate(today(), 7),
  action: "调整后续计划",
  changes: [],
  planIds: ["upgrade-a", "upgrade-b"],
};
next.reviews.unshift(review);
await save(coach, next, "验收：多方案复查");
await save(
  coach,
  applyAdjustment(
    doc.payload,
    doc.payload.plans.find((p) => p.id === "upgrade-a"),
    today(),
    "验收调整A",
    review.id,
  ),
);
assert.deepEqual(
  reviewProgress(doc.payload, review).remaining.map((p) => p.id),
  ["upgrade-b"],
);
await save(
  coach,
  applyAdjustment(
    doc.payload,
    doc.payload.plans.find((p) => p.id === "upgrade-b"),
    today(),
    "验收调整B",
    review.id,
  ),
);
assert.equal(reviewProgress(doc.payload, review).remaining.length, 0);
assert.deepEqual(
  doc.payload.sessions.find((x) => x.id === completed.id),
  originalCompleted,
);
await call(
  owner,
  "/api/notifications/preferences",
  {
    timeZone: "Asia/Shanghai",
    training: true,
    review: true,
    updates: true,
    lead: 30,
  },
  "PUT",
);
await call(owner, "/api/notifications/test", {});
const notifications = await call(owner, "/api/notifications");
assert(notifications.publicKey);
assert(notifications.notifications.some((n) => n.kind === "test"));
assert(notifications.notifications.some((n) => n.kind === "change"));
const note = notifications.notifications[0];
await call(other, "/api/notifications/read", { id: note.id });
assert.equal(
  (await call(owner, "/api/notifications")).notifications.find(
    (n) => n.id === note.id,
  ).read_at,
  null,
);
await call(owner, "/api/notifications/read", { id: note.id });
assert(
  (await call(owner, "/api/notifications")).notifications.find(
    (n) => n.id === note.id,
  ).read_at,
);
await call(
  owner,
  "/api/notifications/subscribe",
  {
    endpoint: "https://localhost/push",
    keys: { p256dh: "x".repeat(87), auth: "y".repeat(22) },
  },
  "POST",
  400,
);
console.log(
  JSON.stringify({
    ok: true,
    checks,
    scope: new URL(base).hostname,
    assessmentGate: true,
    pauseResume: true,
    multiplePlans: true,
    overlapRejected: true,
    structuredSets: true,
    strengthVolume: 310,
    notificationsIsolated: true,
  }),
);
