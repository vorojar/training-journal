import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
const base = process.env.TEST_URL || "http://localhost:8787";
const nonce = Date.now().toString(36);
let passed = 0;
const actors = [];
async function call(
  actor,
  path,
  body,
  method = body === undefined ? "GET" : "POST",
  status = 200,
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Fitness-Client": "3",
      Origin: base,
      ...(actor?.cookie ? { Cookie: actor.cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (response.status !== status)
    throw new Error(
      `${method} ${path.replace(/\/spaces\/[^/]+/, "/spaces/[id]")} expected ${status}, got ${response.status}: ${JSON.stringify(data).slice(0, 300)}`,
    );
  if (actor) {
    const cookies = response.headers.getSetCookie();
    if (cookies.length)
      actor.cookie = cookies.map((c) => c.split(";")[0]).join("; ");
  }
  passed++;
  return data;
}
for (const role of ["owner", "coach", "other"]) {
  const actor = {
    email: `fitness-qa-${nonce}-${role}@example.invalid`,
    password: randomBytes(24).toString("base64url"),
    name: `验收空间-${role}`,
    cookie: "",
  };
  await call(actor, "/api/auth/sign-up/email", {
    email: actor.email,
    password: actor.password,
    name: actor.name,
  });
  await call(actor, "/api/bootstrap", {});
  const list = await call(actor, "/api/spaces");
  assert.equal(list.spaces.length, 1);
  actor.space = list.spaces[0].id;
  actor.user = (await call(actor, "/api/auth/get-session")).user.id;
  actors.push(actor);
}
const [owner, coach, other] = actors;
await call(null, "/api/spaces", undefined, "GET", 401);
await call(other, `/api/spaces/${owner.space}/document`, undefined, "GET", 403);
const ownerDoc = await call(owner, `/api/spaces/${owner.space}/document`);
assert.equal(ownerDoc.payload.profile.name, owner.name);
const invite = await call(owner, `/api/spaces/${owner.space}/invites`, {
  email: coach.email,
});
const token = new URLSearchParams(new URL(invite.url).hash.split("?")[1]).get(
  "invite",
);
await call(other, "/api/invites/accept", { token }, "POST", 403);
await call(coach, "/api/invites/accept", { token });
await call(coach, "/api/invites/accept", { token });
await call(coach, `/api/spaces/${owner.space}/document`, undefined, "GET", 403);
const members = await call(owner, `/api/spaces/${owner.space}/members`);
assert.equal(members.members[0].status, "pending");
await call(
  owner,
  `/api/spaces/${owner.space}/members/${coach.user}`,
  { status: "active" },
  "PUT",
);
assert.equal((await call(coach, "/api/spaces")).spaces.length, 2);
await call(coach, `/api/spaces/${owner.space}/members`, undefined, "GET", 403);
const edited = structuredClone(ownerDoc.payload);
edited.assessment.assessor = "验收教练";
const mutation = {
  payload: edited,
  version: ownerDoc.version,
  mutationId: randomUUID(),
  action: "验收：教练填写评估",
};
const written = await call(
  coach,
  `/api/spaces/${owner.space}/document`,
  mutation,
  "PUT",
);
assert.equal(written.version, ownerDoc.version + 1);
const replay = await call(
  coach,
  `/api/spaces/${owner.space}/document`,
  mutation,
  "PUT",
);
assert.equal(replay.version, written.version);
assert.equal(replay.replayed, true);
await call(owner, `/api/spaces/${owner.space}/document`, mutation, "PUT", 409);
const forged = structuredClone(edited);
forged.profile.name = "不允许的修改";
await call(
  coach,
  `/api/spaces/${owner.space}/document`,
  {
    ...mutation,
    payload: forged,
    mutationId: randomUUID(),
    version: written.version,
  },
  "PUT",
  403,
);
await call(
  coach,
  `/api/spaces/${owner.space}/document`,
  {
    ...mutation,
    legacy: [],
    mutationId: randomUUID(),
    version: written.version,
  },
  "PUT",
  403,
);
const incomplete = structuredClone(edited);
incomplete.plans = [
  {
    id: "qa-plan",
    name: "验收方案",
    coach: "验收教练",
    version: 1,
    status: "已发布",
    start: "2026-10-20",
    end: "2026-10-27",
    weekdays: [2],
    time: "18:00",
    minutes: 30,
    nextReview: "2026-10-27",
    goal: "测试",
    progression: "复查后调整",
    cautions: "测试注意",
    exercises: [],
  },
];
await call(
  coach,
  `/api/spaces/${owner.space}/document`,
  {
    payload: incomplete,
    version: written.version,
    mutationId: randomUUID(),
    action: "验收：禁止跳过完整评估发布",
  },
  "PUT",
  400,
);
const competing = [1, 2].map((n) => ({
  ...mutation,
  payload: { ...edited, profile: { ...edited.profile, coach: `并发验收${n}` } },
  version: written.version,
  mutationId: randomUUID(),
  action: "验收：并发更新",
}));
const concurrent = await Promise.all(
  competing.map((b) =>
    fetch(base + `/api/spaces/${owner.space}/document`, {
      method: "PUT",
      headers: {
        Origin: base,
        "Content-Type": "application/json",
        "X-Fitness-Client": "3",
        Cookie: owner.cookie,
      },
      body: JSON.stringify(b),
    }).then((r) => r.status),
  ),
);
assert.deepEqual(concurrent.sort(), [200, 409]);
passed += 2;
let current = await call(owner, `/api/spaces/${owner.space}/document`);
const legacy = [
  {
    id: "qa-legacy",
    kind: "assessment",
    payload: {
      topic: "验收原始评估",
      detail: "用于验证云端保留原版记录",
      status: "待核实",
      owner: "验收教练",
      date: "",
    },
    version: 1,
    deleted: 0,
    updatedAt: new Date().toISOString(),
  },
];
await call(
  owner,
  `/api/spaces/${owner.space}/document`,
  {
    payload: current.payload,
    version: current.version,
    mutationId: randomUUID(),
    action: "验收：导入备份",
    legacy,
  },
  "PUT",
);
current = await call(owner, `/api/spaces/${owner.space}/document`);
assert.deepEqual(current.legacy, legacy);
const scheduled = structuredClone(current.payload);
scheduled.sessions = [
  {
    id: "qa-pending",
    planId: "qa-plan",
    planVersion: 1,
    date: "2026-10-21",
    time: "18:00",
    title: "验收待完成课次",
    minutes: 30,
    status: "待完成",
    exercises: [],
    cautions: "测试注意",
    actual: "",
    effort: null,
    symptoms: "",
    nextDay: "",
    completedAt: "",
  },
];
current = await call(
  owner,
  `/api/spaces/${owner.space}/document`,
  {
    payload: scheduled,
    version: current.version,
    mutationId: randomUUID(),
    action: "验收：生成待完成课次",
  },
  "PUT",
);
const rescheduled = structuredClone(current.payload);
rescheduled.sessions[0].time = "19:00";
current = await call(
  coach,
  `/api/spaces/${owner.space}/document`,
  {
    payload: rescheduled,
    version: current.version,
    mutationId: randomUUID(),
    action: "验收：教练调整课次时间",
  },
  "PUT",
);
const falseCompletion = structuredClone(current.payload);
falseCompletion.sessions[0].status = "已完成";
falseCompletion.sessions[0].actual = "不允许代填";
await call(
  coach,
  `/api/spaces/${owner.space}/document`,
  {
    payload: falseCompletion,
    version: current.version,
    mutationId: randomUUID(),
    action: "验收：禁止教练改写实际完成",
  },
  "PUT",
  403,
);
const secondDevice = { cookie: "" };
await call(secondDevice, "/api/auth/sign-in/email", {
  email: owner.email,
  password: owner.password,
});
const synced = await call(secondDevice, `/api/spaces/${owner.space}/document`);
assert.equal(synced.version, current.version);
assert.deepEqual(synced.payload, current.payload);
await call(
  owner,
  `/api/spaces/${owner.space}/members/${coach.user}`,
  { status: "revoked" },
  "PUT",
);
await call(coach, `/api/spaces/${owner.space}/document`, undefined, "GET", 403);
await call(
  coach,
  `/api/spaces/${owner.space}/document`,
  { ...mutation, version: current.version, mutationId: randomUUID() },
  "PUT",
  403,
);
assert.equal((await call(coach, "/api/spaces")).spaces.length, 1);
const revoked = await call(owner, `/api/spaces/${owner.space}/invites`, {
  email: coach.email,
});
await call(
  owner,
  `/api/spaces/${owner.space}/invites/${revoked.id}`,
  undefined,
  "DELETE",
);
await call(
  coach,
  "/api/invites/accept",
  {
    token: new URLSearchParams(new URL(revoked.url).hash.split("?")[1]).get(
      "invite",
    ),
  },
  "POST",
  403,
);
const forgedOrigin = await fetch(base + "/api/bootstrap", {
  method: "POST",
  headers: {
    Origin: "https://untrusted.invalid",
    Cookie: owner.cookie,
    "Content-Type": "application/json",
    "X-Fitness-Client": "3",
  },
  body: "{}",
});
assert.equal(forgedOrigin.status, 403);
passed++;
await call(secondDevice, "/api/auth/sign-out", {});
await call(secondDevice, "/api/spaces", undefined, "GET", 401);
if (process.env.QA_FIXTURE)
  writeFileSync(
    process.env.QA_FIXTURE,
    JSON.stringify({ base, owner, coach, other }),
    { mode: 0o600 },
  );
console.log(
  JSON.stringify({
    ok: true,
    checks: passed,
    scope: new URL(base).hostname,
    covered: [
      "public-signup",
      "isolated-spaces",
      "bound-invites",
      "approval-before-access",
      "coach-permissions",
      "assessment-before-publication",
      "coach-calendar-rescheduling",
      "idempotent-retries",
      "actor-bound-mutations",
      "concurrent-version-conflict",
      "cross-device-sync",
      "revocation",
      "origin-validation",
      "sign-out",
    ],
  }),
);
