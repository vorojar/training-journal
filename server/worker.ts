/// <reference types="@cloudflare/workers-types" />
import {
  notificationApi,
  changeNotifications,
  scheduledReminders,
} from "./notifications";
import { z } from "zod";
import { parseBackup } from "../src/lib/storage";
import { authentication, type Env } from "./auth";
import {
  emptySystem,
  today,
  planErrors,
  assessmentErrors,
  reconcileSystem,
  systemSchema,
  templateSchema,
  type System,
} from "../src/execution/domain";
import { recoverHistory } from "../src/execution/lifecycle";
const apiError = (message: string, status = 400) =>
  Response.json({ error: message }, { status });
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
export async function digest(value: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
async function body(request: Request) {
  const raw = await request.text();
  if (raw.length > 2_500_000)
    throw new Error("提交内容超过2.5MB，请先导出备份并精简旧记录");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("提交格式无效");
  }
}
export function coachAllowed(old: System, next: System) {
  if (
    JSON.stringify(old.profile) !== JSON.stringify(next.profile) ||
    JSON.stringify(old.daily) !== JSON.stringify(next.daily) ||
    JSON.stringify(old.trash ?? []) !== JSON.stringify(next.trash ?? [])
  )
    return false;
  // Coaches prescribe and reschedule; actual training completion remains the trainee's record.
  for (const before of old.sessions) {
    const after = next.sessions.find((s) => s.id === before.id);
    if (!after) return false;
    if (
      !["待完成", "已暂停"].includes(before.status) &&
      JSON.stringify(before) !== JSON.stringify(after)
    )
      return false;
    if (
      ["待完成", "已暂停"].includes(before.status) &&
      !["待完成", "已暂停", "已取消"].includes(after.status)
    )
      return false;
    if (
      JSON.stringify(before.setLogs ?? []) !==
        JSON.stringify(after.setLogs ?? []) ||
      before.actual !== after.actual ||
      before.effort !== after.effort ||
      before.symptoms !== after.symptoms ||
      before.nextDay !== after.nextDay ||
      before.completedAt !== after.completedAt
    )
      return false;
  }
  if (
    next.sessions.some(
      (s) =>
        !old.sessions.some((x) => x.id === s.id) &&
        !["待完成", "已暂停"].includes(s.status),
    )
  )
    return false;
  return true;
}
export async function api(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url),
    path = url.pathname;
  if (path === "/api/health")
    return Response.json({
      ok: true,
      service: "fitness-saas",
      storage: "cloudflare-d1",
    });

  if (
    !["GET", "HEAD"].includes(request.method) &&
    request.headers.get("Origin") !== env.APP_URL
  )
    return apiError("请求来源无效", 403);
  const auth = authentication(env);
  if (path.startsWith("/api/auth/")) return auth.handler(request);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return apiError("请先登录", 401);
  const user = session.user,
    db = env.DB;
  const notices = await notificationApi(request, env, user.id);
  if (notices) return notices;
  if (path === "/api/bootstrap" && request.method === "POST") {
    const spaceId = uuid(),
      s = emptySystem();
    const profileInput = z
      .object({ timeZone: z.string().max(100).optional() })
      .parse(await body(request));
    const zone = profileInput.timeZone ?? "Asia/Shanghai";
    try {
      new Intl.DateTimeFormat("en", { timeZone: zone });
    } catch {
      return apiError("时区不正确");
    }
    s.profile.timeZone = zone;
    s.profile.name = user.name;
    s.profile.goal = "尚未设置训练目标";
    s.profile.gainKg = null;
    await db.batch([
      db
        .prepare(
          "INSERT INTO spaces(id,owner_id,name,created_at) VALUES(?,?,?,?) ON CONFLICT(owner_id) DO NOTHING",
        )
        .bind(spaceId, user.id, user.name + "的健身空间", now()),
      db
        .prepare(
          "INSERT INTO documents(space_id,payload,version,actor_id,mutation_id,mutation_hash,action,updated_at) SELECT id,?,1,?,'initial','initial','创建健身空间',? FROM spaces WHERE owner_id=? ON CONFLICT(space_id) DO NOTHING",
        )
        .bind(JSON.stringify(s), user.id, now(), user.id),
      db
        .prepare(
          "INSERT INTO changes SELECT d.space_id,d.mutation_id,d.mutation_hash,d.actor_id,d.version,d.payload,d.action,d.updated_at FROM documents d JOIN spaces s ON s.id=d.space_id WHERE s.owner_id=? ON CONFLICT(space_id,mutation_id) DO NOTHING",
        )
        .bind(user.id),
    ]);
    return Response.json({ ok: true });
  }
  if (path === "/api/spaces" && request.method === "GET") {
    const result = await db
      .prepare(
        "SELECT s.id,s.name,s.owner_id,u.name AS owner_name,CASE WHEN s.owner_id=? THEN 'owner' ELSE 'coach' END AS role FROM spaces s JOIN user u ON u.id=s.owner_id WHERE s.owner_id=? OR EXISTS(SELECT 1 FROM members m WHERE m.space_id=s.id AND m.user_id=? AND m.status='active') ORDER BY s.created_at",
      )
      .bind(user.id, user.id, user.id)
      .all();
    return Response.json({ spaces: result.results });
  }
  if (path === "/api/coach-dashboard" && request.method === "GET") {
    const result = await db
      .prepare(
        "SELECT s.id,s.name,u.name AS owner_name,d.payload,d.version,d.updated_at FROM spaces s JOIN user u ON u.id=s.owner_id JOIN documents d ON d.space_id=s.id JOIN members m ON m.space_id=s.id WHERE m.user_id=? AND m.status='active'",
      )
      .bind(user.id)
      .all<{
        id: string;
        name: string;
        owner_name: string;
        payload: string;
        version: number;
        updated_at: string;
      }>();
    return Response.json({
      students: result.results.map((row) => {
        const s = systemSchema.parse(JSON.parse(row.payload));
        const day = today(s.profile.timeZone ?? "Asia/Shanghai");
        const pending = s.sessions.filter((x) => x.status === "待完成");
        const last = [...s.reviews].sort((a, b) =>
          b.date.localeCompare(a.date),
        )[0];
        const reviewDates = last
          ? [last.nextDate]
          : s.plans
              .filter((p) => p.status === "已发布")
              .map((p) => p.nextReview);
        return {
          id: row.id,
          name: row.owner_name,
          version: row.version,
          updated_at: row.updated_at,
          assessmentNeeded: !s.assessment.confirmed,
          hold: !!s.trainingHold?.active,
          reviewDue: reviewDates.some((d) => d && d <= day),
          adjustmentsNeeded: s.reviews
            .filter((r) => r.action === "调整后续计划")
            .reduce(
              (n, r) =>
                n +
                (
                  r.planIds ??
                  s.plans.filter((p) => p.status === "已发布").map((p) => p.id)
                ).filter(
                  (id) =>
                    !s.adjustments.some(
                      (a) => a.reviewId === r.id && a.planId === id,
                    ),
                ).length,
              0,
            ),
          todaySessions: pending.filter((x) => x.date === day).length,
          overdue: pending.filter((x) => x.date < day).length,
          completed: s.sessions.filter((x) => x.status === "已完成").length,
        };
      }),
    });
  }
  if (path === "/api/templates" && request.method === "GET") {
    const rows = await db
      .prepare(
        "SELECT id,payload,updated_at FROM plan_templates WHERE user_id=? ORDER BY updated_at DESC",
      )
      .bind(user.id)
      .all<{ id: string; payload: string; updated_at: string }>();
    return Response.json({
      templates: rows.results.map((r) => JSON.parse(r.payload)),
    });
  }
  if (path === "/api/templates" && request.method === "PUT") {
    const t = templateSchema.parse(await body(request));
    // A template carries prescriptions, never another student's problem identifiers.
    t.exercises = t.exercises.map((e) => ({ ...e, problemId: "" }));
    await db
      .prepare(
        "INSERT INTO plan_templates(user_id,id,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
      )
      .bind(user.id, t.id, JSON.stringify(t), now())
      .run();
    return Response.json({ template: t });
  }
  const templateDelete = path.match(/^\/api\/templates\/([a-zA-Z0-9_-]+)$/);
  if (templateDelete && request.method === "DELETE") {
    await db
      .prepare("DELETE FROM plan_templates WHERE user_id=? AND id=?")
      .bind(user.id, templateDelete[1])
      .run();
    return Response.json({ ok: true });
  }
  if (path === "/api/invites/accept" && request.method === "POST") {
    const b = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(await body(request));
    const hash = await digest(b.token);
    const invite = await db
      .prepare("SELECT * FROM invites WHERE token_hash=?")
      .bind(hash)
      .first<{
        id: string;
        space_id: string;
        email: string;
        expires_at: string;
        revoked: number;
        used_by: string | null;
      }>();
    if (
      !invite ||
      invite.revoked ||
      invite.expires_at <= now() ||
      invite.email !== user.email.toLowerCase()
    )
      return apiError("邀请无效、已过期，或与你的登录邮箱不符", 403);
    if (invite.used_by) {
      if (invite.used_by === user.id)
        return Response.json({ ok: true, status: "pending" });
      return apiError("邀请已使用", 409);
    }
    const results = await db.batch([
      db
        .prepare(
          "UPDATE invites SET used_by=? WHERE id=? AND used_by IS NULL AND revoked=0 AND expires_at>? AND email=? AND EXISTS(SELECT 1 FROM spaces WHERE id=invites.space_id AND owner_id<>?)",
        )
        .bind(user.id, invite.id, now(), user.email.toLowerCase(), user.id),
      db
        .prepare(
          "INSERT INTO members(space_id,user_id,status,created_at) SELECT space_id,?,'pending',? FROM invites WHERE id=? AND used_by=? AND revoked=0 ON CONFLICT(space_id,user_id) DO UPDATE SET status=CASE WHEN members.status='active' THEN 'active' ELSE 'pending' END",
        )
        .bind(user.id, now(), invite.id, user.id),
      db
        .prepare(
          "INSERT INTO access_log SELECT ?,space_id,?,id,'request-coaching',? FROM invites WHERE id=? AND used_by=?",
        )
        .bind(uuid(), user.id, now(), invite.id, user.id),
    ]);
    if (!results[0]?.meta.changes)
      return apiError("邀请已使用或不能邀请自己", 409);
    return Response.json({ ok: true, status: "pending" });
  }
  const match = path.match(
    /^\/api\/spaces\/([a-zA-Z0-9_-]+)(?:\/(document|members|invites|history)(?:\/([a-zA-Z0-9_-]+))?)?$/,
  );
  if (!match) return apiError("接口不存在", 404);
  const spaceId = match[1]!,
    section = match[2],
    target = match[3];
  const space = await db
    .prepare(
      "SELECT s.*,CASE WHEN s.owner_id=? THEN 'owner' ELSE 'coach' END AS role FROM spaces s WHERE s.id=? AND (s.owner_id=? OR EXISTS(SELECT 1 FROM members m WHERE m.space_id=s.id AND m.user_id=? AND m.status='active'))",
    )
    .bind(user.id, spaceId, user.id, user.id)
    .first<{ id: string; owner_id: string; role: "owner" | "coach" }>();
  if (!space) return apiError("没有访问这个健身空间的权限，或授权已撤销", 403);
  if (section === "document" && request.method === "GET") {
    const doc = await db
      .prepare(
        "SELECT payload,version,updated_at,actor_id,legacy FROM documents WHERE space_id=?",
      )
      .bind(spaceId)
      .first<{
        payload: string;
        version: number;
        updated_at: string;
        actor_id: string;
        legacy: string;
      }>();
    if (!doc) return apiError("健身空间数据暂未初始化", 404);
    const { legacy, ...safeDoc } = doc;
    return Response.json({
      ...safeDoc,
      payload: JSON.parse(doc.payload),
      ...(space.role === "owner" ? { legacy: JSON.parse(legacy) } : {}),
      role: space.role,
    });
  }
  if (section === "document" && request.method === "PUT") {
    if (request.headers.get("X-Fitness-Client") !== "4")
      return apiError(
        "网站已升级，请先复制保留当前填写，再刷新网页后保存，避免旧页面覆盖新记录",
        409,
      );
    const b = z
      .object({
        payload: systemSchema,
        version: z.number().int().positive(),
        mutationId: id,
        action: z.string().min(1).max(100),
        legacy: z.array(z.unknown()).max(5000).optional(),
        restore: z
          .object({
            version: z.number().int().positive(),
            key: z.string().min(1).max(400),
          })
          .optional(),
      })
      .parse(await body(request));
    if (b.restore && space.role !== "owner")
      return apiError("只有本人可以恢复历史记录", 403);
    if (b.legacy && space.role !== "owner")
      return apiError("只有本人可以导入原版备份", 403);
    const legacy = b.legacy
      ? parseBackup(JSON.stringify({ records: b.legacy })).filter(
          (r) => r.kind !== "system",
        )
      : undefined;
    const hash = await digest(
      JSON.stringify({
        actor: user.id,
        payload: b.payload,
        version: b.version,
        action: b.action,
        legacy,
        restore: b.restore,
      }),
    );
    const replay = async () => {
      const done = await db
        .prepare(
          "SELECT mutation_hash,version,payload,created_at FROM changes WHERE space_id=? AND mutation_id=?",
        )
        .bind(spaceId, b.mutationId)
        .first<{
          mutation_hash: string;
          version: number;
          payload: string;
          created_at: string;
        }>();
      if (!done) return null;
      if (done.mutation_hash !== hash)
        return apiError("重复请求编号对应了不同内容，请重新打开记录", 409);
      return Response.json({
        version: done.version,
        payload: JSON.parse(done.payload),
        updated_at: done.created_at,
        replayed: true,
      });
    };
    const cached = await replay();
    if (cached) return cached;
    const current = await db
      .prepare("SELECT payload FROM documents WHERE space_id=?")
      .bind(spaceId)
      .first<{ payload: string }>();
    if (!current) return apiError("记录不存在", 404);
    if (
      space.role === "coach" &&
      !coachAllowed(systemSchema.parse(JSON.parse(current.payload)), b.payload)
    )
      return apiError(
        "教练可以编辑评估、问题、方案与排期；个人资料、每日测量和实际完成情况由本人填写",
        403,
      );
    if (b.legacy !== undefined && assessmentErrors(b.payload).length) {
      b.payload.assessment.confirmed = false;
      if (b.payload.sessions.some((s) => s.status === "待完成"))
        b.payload.trainingHold = {
          active: true,
          reason: "导入的资料需要补齐评估后恢复训练",
          since: new Date().toISOString().slice(0, 10),
        };
    }
    let ruleBefore = systemSchema.parse(JSON.parse(current.payload));
    try {
      if (b.restore) {
        const row = await db
          .prepare("SELECT payload FROM changes WHERE space_id=? AND version=?")
          .bind(spaceId, b.restore.version)
          .first<{ payload: string }>();
        if (!row) return apiError("历史版本不存在", 404);
        const past = systemSchema.parse(JSON.parse(row.payload));
        b.payload = systemSchema.parse(
          recoverHistory(ruleBefore, past, b.restore.key),
        );
        if (b.restore.key.startsWith("session:")) {
          const restored = past.sessions.find(
            (x) => x.id === b.restore!.key.slice(8),
          );
          if (restored?.status === "已完成")
            ruleBefore = {
              ...ruleBefore,
              sessions: [
                ...ruleBefore.sessions.filter((x) => x.id !== restored.id),
                restored,
              ],
            };
        }
      }
      b.payload = reconcileSystem(
        ruleBefore,
        b.payload,
        today(b.payload.profile.timeZone ?? "Asia/Shanghai"),
        b.legacy !== undefined,
      );
    } catch (error) {
      return apiError(
        error instanceof Error ? error.message : "训练数据不符合执行规则",
      );
    }
    const before = systemSchema.parse(JSON.parse(current.payload));
    for (const plan of b.payload.plans) {
      const previous = before.plans.find((p) => p.id === plan.id);
      if (
        b.legacy === undefined &&
        plan.status === "已发布" &&
        JSON.stringify(previous) !== JSON.stringify(plan)
      ) {
        const errors = planErrors(b.payload, plan);
        if (errors.length) return apiError(errors.join("；"));
      }
    }
    try {
      const results = await db.batch([
        db
          .prepare(
            "UPDATE documents SET payload=?,legacy=COALESCE(?,legacy),version=version+1,actor_id=?,mutation_id=?,mutation_hash=?,action=?,updated_at=? WHERE space_id=? AND version=? AND (EXISTS(SELECT 1 FROM spaces s WHERE s.id=documents.space_id AND s.owner_id=?) OR EXISTS(SELECT 1 FROM members m WHERE m.space_id=documents.space_id AND m.user_id=? AND m.status='active')) RETURNING version,payload,updated_at",
          )
          .bind(
            JSON.stringify(b.payload),
            legacy ? JSON.stringify(legacy) : null,
            user.id,
            b.mutationId,
            hash,
            b.action,
            now(),
            spaceId,
            b.version,
            user.id,
            user.id,
          ),
        db
          .prepare(
            "INSERT INTO changes SELECT space_id,mutation_id,mutation_hash,actor_id,version,payload,action,updated_at FROM documents WHERE space_id=? AND mutation_id=? AND mutation_hash=? ON CONFLICT(space_id,mutation_id) DO NOTHING",
          )
          .bind(spaceId, b.mutationId, hash),
        ...changeNotifications(db, spaceId, b.mutationId, user.id),
      ]);
      const result = results[0]?.results[0] as
        | { version: number; payload: string; updated_at: string }
        | undefined;
      if (result)
        return Response.json({
          ...result,
          payload: JSON.parse(result.payload),
        });
    } catch (error) {
      const cached = await replay();
      if (cached) return cached;
      throw error;
    }
    const finalReplay = await replay();
    if (finalReplay) return finalReplay;
    return apiError(
      "记录已在另一台设备或由教练更新。请保留当前填写，关闭窗口，获取最新记录后重新核对。",
      409,
    );
  }
  if (section === "history" && target && request.method === "GET") {
    const version = z.coerce.number().int().positive().parse(target);
    const row = await db
      .prepare(
        "SELECT payload,version,action,created_at FROM changes WHERE space_id=? AND version=?",
      )
      .bind(spaceId, version)
      .first<{
        payload: string;
        version: number;
        action: string;
        created_at: string;
      }>();
    if (!row) return apiError("历史版本不存在", 404);
    return Response.json({ ...row, payload: JSON.parse(row.payload) });
  }
  if (section === "history" && request.method === "GET") {
    const beforeVersion = z.coerce
      .number()
      .int()
      .positive()
      .parse(url.searchParams.get("before") || "2147483647");
    const rows = await db
      .prepare(
        "SELECT c.version,c.action,c.created_at,u.name AS actor_name FROM changes c JOIN user u ON u.id=c.actor_id WHERE c.space_id=? AND c.version<? ORDER BY c.version DESC LIMIT 50",
      )
      .bind(spaceId, beforeVersion)
      .all();
    return Response.json({ history: rows.results });
  }
  if (space.role !== "owner") return apiError("只有本人可以管理教练授权", 403);
  if (section === "members" && request.method === "GET") {
    const members = await db
      .prepare(
        "SELECT m.user_id,m.status,m.created_at,u.name,u.email FROM members m JOIN user u ON u.id=m.user_id WHERE m.space_id=? AND m.status<>'revoked'",
      )
      .bind(spaceId)
      .all();
    const invites = await db
      .prepare(
        "SELECT id,email,expires_at,revoked,used_by FROM invites WHERE space_id=? ORDER BY created_at DESC LIMIT 30",
      )
      .bind(spaceId)
      .all();
    return Response.json({
      members: members.results,
      invites: invites.results,
    });
  }
  if (section === "members" && target && request.method === "PUT") {
    const b = z
      .object({ status: z.enum(["active", "revoked"]) })
      .parse(await body(request));
    const results = await db.batch([
      db
        .prepare(
          "UPDATE members SET status=? WHERE space_id=? AND user_id=? AND EXISTS(SELECT 1 FROM spaces s WHERE s.id=members.space_id AND s.owner_id=?)",
        )
        .bind(b.status, spaceId, target, user.id),
      db
        .prepare("INSERT INTO access_log VALUES(?,?,?,?,?,?)")
        .bind(
          uuid(),
          spaceId,
          user.id,
          target,
          b.status === "active" ? "approve-coach" : "revoke-coach",
          now(),
        ),
    ]);
    if (!results[0]?.meta.changes) return apiError("未找到此教练授权", 404);
    return Response.json({ ok: true });
  }
  if (section === "invites" && request.method === "POST") {
    const b = z
      .object({ email: z.string().email().max(200) })
      .parse(await body(request));
    if (b.email.toLowerCase() === user.email.toLowerCase())
      return apiError("请填写教练的邮箱");
    const token = randomToken(),
      inviteId = uuid();
    await db
      .prepare(
        "INSERT INTO invites(id,space_id,token_hash,email,expires_at,created_at) VALUES(?,?,?,?,?,?)",
      )
      .bind(
        inviteId,
        spaceId,
        await digest(token),
        b.email.toLowerCase(),
        new Date(Date.now() + 48 * 3600000).toISOString(),
        now(),
      )
      .run();
    return Response.json({
      id: inviteId,
      url: env.APP_URL + "/#settings?invite=" + token,
      expiresInHours: 48,
    });
  }
  if (section === "invites" && target && request.method === "DELETE") {
    await db
      .prepare("UPDATE invites SET revoked=1 WHERE id=? AND space_id=?")
      .bind(target, spaceId)
      .run();
    return Response.json({ ok: true });
  }
  return apiError("接口不存在", 404);
}
export default {
  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(scheduledReminders(env));
  },
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    let response: Response;
    try {
      response = url.pathname.startsWith("/api/")
        ? await api(request, env)
        : await env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof z.ZodError)
        response = apiError("填写内容格式不正确，请检查必填字段与数值范围");
      else {
        console.error(
          "Request failed:",
          error instanceof Error ? error.name : "unknown",
        );
        response = apiError("云端暂时不可用，填写内容仍保留，请稍后重试", 503);
      }
    }
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Frame-Options", "DENY");
    headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    if (url.pathname.startsWith("/api/"))
      headers.set("Cache-Control", "no-store");
    else
      headers.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
    return new Response(response.body, { status: response.status, headers });
  },
};
