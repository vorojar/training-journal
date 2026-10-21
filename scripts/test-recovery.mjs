import assert from "node:assert/strict";
import fs from "node:fs";
const q = JSON.parse(fs.readFileSync(process.env.QA_FIXTURE, "utf8"));
const { owner, coach, other } = q;
assert(owner.email.endsWith("@example.invalid"));
const path = "/api/spaces/" + owner.space;
let checks = 0;
async function call(
  who,
  url,
  body,
  method = body ? "POST" : "GET",
  expected = 200,
  headers = {},
) {
  const r = await fetch(q.base + url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Fitness-Client": "4",
      Origin: q.base,
      Cookie: who?.cookie ?? "",
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const b = await r.json();
  assert.equal(
    r.status,
    expected,
    `${method} ${url.replace(owner.space, "[space]")}: ${JSON.stringify(b).slice(0, 160)}`,
  );
  checks++;
  return b;
}
await call(owner, path + "/members/" + coach.user, { status: "active" }, "PUT");
let doc = await call(owner, path + "/document");
async function save(who, payload, extra = {}, expected = 200) {
  const r = await call(
    who,
    path + "/document",
    {
      payload,
      version: doc.version,
      mutationId: crypto.randomUUID(),
      action: "验收：恢复与协作",
      ...extra,
    },
    "PUT",
    expected,
  );
  if (expected === 200) doc = r;
  return r;
}
const m = {
  id: "recovery-m",
  date: "2026-10-01",
  problemId: "",
  metric: "测试角度",
  value: 40,
  unit: "度",
  side: "整体",
  method: "固定机位",
  assessor: "测试教练",
  target: 45,
  notes: "虚构验收",
};
await save(coach, { ...doc.payload, measurements: [m] });
const originalVersion = doc.version;
await save(owner, {
  ...doc.payload,
  measurements: [{ ...m, value: 44 }],
  profile: { ...doc.payload.profile, goal: "另一设备更新，应当保留" },
});
const history = await call(coach, path + "/history/" + originalVersion);
assert.equal(history.payload.measurements[0].value, 40);
await call(other, path + "/history/" + originalVersion, undefined, "GET", 403);
await save(
  coach,
  doc.payload,
  { restore: { version: originalVersion, key: "measurement:recovery-m" } },
  403,
);
await save(owner, doc.payload, {
  restore: { version: originalVersion, key: "measurement:recovery-m" },
});
assert.equal(doc.payload.measurements[0].value, 40);
assert.equal(doc.payload.profile.goal, "另一设备更新，应当保留");
const hist = await call(owner, path + "/history");
const page = await call(owner, path + "/history?before=" + originalVersion);
assert(page.history.every((x) => x.version < originalVersion));
assert(hist.history.some((x) => x.version === originalVersion));
await save(
  owner,
  doc.payload,
  { restore: { version: 99999999, key: "measurement:recovery-m" } },
  404,
);
const stale = doc.version;
await save(owner, { ...doc.payload, measurements: [{ ...m, value: 41 }] });
await call(
  owner,
  path + "/document",
  {
    payload: doc.payload,
    version: stale,
    mutationId: crypto.randomUUID(),
    action: "过期恢复",
    restore: { version: originalVersion, key: "measurement:recovery-m" },
  },
  "PUT",
  409,
);
const daily = doc.payload.daily[0] ?? {
  id: "recovery-d",
  date: "2026-10-01",
  weight: 60,
  bodyFat: null,
  waist: null,
  sleep: null,
  heartRate: null,
  steps: null,
  energy: null,
  notes: "",
  source: "手动",
};
await save(owner, { ...doc.payload, daily: [daily] });
const archived = {
  id: "trash-test",
  kind: "daily",
  item: daily,
  at: new Date().toISOString(),
  reason: "测试归档",
};
await save(owner, {
  ...doc.payload,
  daily: [],
  trash: [...(doc.payload.trash ?? []), archived],
});
await save(coach, { ...doc.payload, trash: [] }, {}, 403);
await save(owner, {
  ...doc.payload,
  daily: [daily],
  trash: doc.payload.trash.filter((x) => x.id !== "trash-test"),
});
const template = {
  id: "qa-template",
  name: "私人训练模板",
  goal: "力量",
  progression: "复查后调整",
  cautions: "按个人评估核对",
  weekdays: [1, 3, 5],
  time: "18:00",
  minutes: 45,
  weeks: 4,
  exercises: [],
};
await call(coach, "/api/templates", template, "PUT");
assert(
  (await call(coach, "/api/templates")).templates.some(
    (t) => t.id === template.id,
  ),
);
assert(
  !(await call(owner, "/api/templates")).templates.some(
    (t) => t.id === template.id,
  ),
);
await call(owner, "/api/templates/" + template.id, undefined, "DELETE");
assert(
  (await call(coach, "/api/templates")).templates.some(
    (t) => t.id === template.id,
  ),
);
const dashboard = await call(coach, "/api/coach-dashboard");
assert(dashboard.students.some((s) => s.id === owner.space));
assert(!dashboard.students.some((s) => s.id === other.space));
await call(
  owner,
  path + "/members/" + coach.user,
  { status: "revoked" },
  "PUT",
);
assert(
  !(await call(coach, "/api/coach-dashboard")).students.some(
    (s) => s.id === owner.space,
  ),
);
await call(coach, path + "/history/" + originalVersion, undefined, "GET", 403);
await call(
  owner,
  path + "/document",
  {
    payload: doc.payload,
    version: doc.version,
    mutationId: crypto.randomUUID(),
    action: "旧客户端",
  },
  "PUT",
  409,
  { "X-Fitness-Client": "3" },
);
console.log(
  JSON.stringify({
    ok: true,
    checks,
    scope: new URL(q.base).hostname,
    isolatedRestore: true,
    historyPermission: true,
    conflictProtected: true,
    privateTemplates: true,
    coachRevocation: true,
  }),
);
