import { z } from "zod";
import { buildPushPayload } from "@block65/webcrypto-web-push";
import type { Env } from "./auth";
import { systemSchema, type System } from "../src/execution/domain";
const stamp = () => new Date().toISOString();
export type Notice = {
  id: string;
  user_id: string;
  space_id: string | null;
  kind: string;
  reference: string;
  title: string;
  href: string;
  created_at: string;
  read_at: string | null;
};
export function localClock(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (key: string) => parts.find((p) => p.type === key)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}
export function pushEndpointAllowed(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      (u.hostname === "fcm.googleapis.com" ||
        u.hostname === "updates.push.services.mozilla.com" ||
        u.hostname === "web.push.apple.com" ||
        u.hostname.endsWith(".push.apple.com") ||
        u.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
const preferenceSchema = z.object({
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
    }),
  training: z.boolean(),
  review: z.boolean(),
  updates: z.boolean(),
  lead: z.union([z.literal(5), z.literal(15), z.literal(30), z.literal(60)]),
});
async function json(request: Request) {
  const raw = await request.text();
  if (raw.length > 10000) throw new z.ZodError([]);
  return JSON.parse(raw);
}
export function changeNotifications(
  db: D1Database,
  spaceId: string,
  mutationId: string,
  actor: string,
) {
  return [
    db
      .prepare(
        "INSERT OR IGNORE INTO notifications(id,user_id,space_id,event_key,kind,title,href,created_at) SELECT lower(hex(randomblob(16))),s.owner_id,d.space_id,?,'change','教练更新了你的训练资料','#overview',d.updated_at FROM documents d JOIN spaces s ON s.id=d.space_id WHERE d.space_id=? AND d.mutation_id=? AND s.owner_id<>?",
      )
      .bind(spaceId + ":" + mutationId, spaceId, mutationId, actor),
    db
      .prepare(
        "INSERT OR IGNORE INTO notifications(id,user_id,space_id,event_key,kind,title,href,created_at) SELECT lower(hex(randomblob(16))),m.user_id,d.space_id,?,'change','学员训练资料有更新','#overview',d.updated_at FROM documents d JOIN members m ON m.space_id=d.space_id AND m.status='active' WHERE d.space_id=? AND d.mutation_id=? AND m.user_id<>?",
      )
      .bind(spaceId + ":" + mutationId, spaceId, mutationId, actor),
  ];
}
export async function notificationApi(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response | null> {
  const path = new URL(request.url).pathname,
    db = env.DB;
  if (path === "/api/notifications" && request.method === "GET") {
    const rows = await db
      .prepare(
        "SELECT n.* FROM notifications n WHERE n.user_id=? AND (n.space_id IS NULL OR EXISTS(SELECT 1 FROM spaces s WHERE s.id=n.space_id AND (s.owner_id=? OR EXISTS(SELECT 1 FROM members m WHERE m.space_id=s.id AND m.user_id=? AND m.status='active')))) ORDER BY n.created_at DESC LIMIT 50",
      )
      .bind(userId, userId, userId)
      .all<Notice>();
    const prefs = await db
      .prepare("SELECT * FROM notification_preferences WHERE user_id=?")
      .bind(userId)
      .first();
    return Response.json({
      notifications: rows.results,
      preferences: prefs,
      publicKey: env.VAPID_PUBLIC_KEY ?? "",
    });
  }
  if (path === "/api/notifications/read" && request.method === "POST") {
    const b = z
      .object({ id: z.string().regex(/^[a-f0-9-]{16,64}$/) })
      .parse(await json(request));
    await db
      .prepare("UPDATE notifications SET read_at=? WHERE id=? AND user_id=?")
      .bind(stamp(), b.id, userId)
      .run();
    return Response.json({ ok: true });
  }
  if (path === "/api/notifications/preferences" && request.method === "PUT") {
    const b = preferenceSchema.parse(await json(request));
    await db
      .prepare(
        "INSERT INTO notification_preferences(user_id,time_zone,training,review,updates,lead) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET time_zone=excluded.time_zone,training=excluded.training,review=excluded.review,updates=excluded.updates,lead=excluded.lead",
      )
      .bind(userId, b.timeZone, +b.training, +b.review, +b.updates, b.lead)
      .run();
    return Response.json({ ok: true });
  }
  if (path === "/api/notifications/subscribe" && request.method === "POST") {
    const b = z
      .object({
        endpoint: z.string().url().max(3000).refine(pushEndpointAllowed),
        keys: z.object({
          p256dh: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/),
          auth: z.string().regex(/^[A-Za-z0-9_-]{20,30}$/),
        }),
      })
      .parse(await json(request));
    const existing = await db
      .prepare("SELECT user_id FROM push_subscriptions WHERE endpoint=?")
      .bind(b.endpoint)
      .first<{ user_id: string }>();
    if (existing && existing.user_id !== userId)
      return Response.json(
        { error: "此浏览器已绑定其他账号，请先在原账号关闭系统提醒" },
        { status: 409 },
      );
    const registered = await db
      .prepare(
        "INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth WHERE push_subscriptions.user_id=excluded.user_id RETURNING id",
      )
      .bind(
        crypto.randomUUID(),
        userId,
        b.endpoint,
        b.keys.p256dh,
        b.keys.auth,
        stamp(),
      )
      .all();
    if (!registered.results.length)
      return Response.json(
        { error: "此设备提醒已属于其他账号" },
        { status: 409 },
      );
    return Response.json({ ok: true });
  }
  if (path === "/api/notifications/unsubscribe" && request.method === "POST") {
    const b = z
      .object({ endpoint: z.string().max(3000) })
      .parse(await json(request));
    await db
      .prepare("DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?")
      .bind(b.endpoint, userId)
      .run();
    return Response.json({ ok: true });
  }
  if (path === "/api/notifications/test" && request.method === "POST") {
    await db
      .prepare(
        "INSERT INTO notifications(id,user_id,event_key,kind,title,href,created_at) VALUES(?,?,?,'test','测试提醒已送达站内提醒中心','#settings',?)",
      )
      .bind(crypto.randomUUID(), userId, crypto.randomUUID(), stamp())
      .run();
    await deliverNotifications(env, userId);
    return Response.json({ ok: true });
  }
  return null;
}
export function dueNotices(
  s: System,
  prefs: { time_zone: string; training: number; review: number; lead: number },
  at: Date,
) {
  const clock = localClock(at, prefs.time_zone),
    due: {
      key: string;
      kind: string;
      reference: object;
      title: string;
      href: string;
    }[] = [];
  if (prefs.training && !s.trainingHold?.active)
    for (const row of s.sessions) {
      if (row.status !== "待完成") continue;
      const [h, m] = row.time.split(":").map(Number);
      const delta =
        (Date.parse(row.date + "T00:00:00Z") -
          Date.parse(clock.date + "T00:00:00Z")) /
          60000 +
        h! * 60 +
        m! -
        clock.minutes;
      if (delta <= prefs.lead && delta >= 0)
        due.push({
          key: `training:${row.id}:${row.date}:${row.time}`,
          kind: "training",
          reference: { id: row.id, date: row.date, time: row.time },
          title: `训练即将开始 · ${row.time}`,
          href: `#calendar/session/${row.id}?month=${row.date.slice(0, 7)}&date=${row.date}`,
        });
    }
  if (prefs.review && clock.minutes >= 9 * 60)
    for (const plan of s.plans.filter((p) => p.status === "已发布")) {
      const latest = s.reviews.find(
        (r) => !r.planIds || r.planIds.includes(plan.id),
      );
      const date = latest?.nextDate || plan.nextReview;
      if (date && date <= clock.date)
        due.push({
          key: `review:${plan.id}:${date}:${clock.date}`,
          kind: "review",
          reference: { id: plan.id, date },
          title: "有训练方案需要复查",
          href: "#reviews",
        });
    }
  return due;
}
export async function deliverNotifications(
  env: Env,
  onlyUser?: string,
  transport: typeof fetch = fetch,
) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
  const rows = await env.DB.prepare(
    `SELECT n.*,p.id AS subscription_id,p.endpoint,p.p256dh,p.auth FROM notifications n JOIN push_subscriptions p ON p.user_id=n.user_id LEFT JOIN notification_preferences f ON f.user_id=n.user_id WHERE n.read_at IS NULL AND n.created_at>? AND (? IS NULL OR n.user_id=?) AND (n.kind<>'change' OR f.updates=1) AND (n.kind<>'training' OR f.training=1) AND (n.kind<>'review' OR f.review=1) AND NOT EXISTS(SELECT 1 FROM notification_deliveries d WHERE d.notification_id=n.id AND d.subscription_id=p.id AND (d.status='sent' OR d.lease_until>strftime('%Y-%m-%dT%H:%M:%fZ','now') OR d.attempts>=5)) AND (n.space_id IS NULL OR EXISTS(SELECT 1 FROM spaces s WHERE s.id=n.space_id AND (s.owner_id=n.user_id OR EXISTS(SELECT 1 FROM members m WHERE m.space_id=s.id AND m.user_id=n.user_id AND m.status='active')))) ORDER BY n.created_at DESC LIMIT 100`,
  )
    .bind(
      new Date(Date.now() - 86400000).toISOString(),
      onlyUser ?? null,
      onlyUser ?? null,
    )
    .all<
      Notice & {
        subscription_id: string;
        endpoint: string;
        p256dh: string;
        auth: string;
      }
    >();
  for (const row of rows.results) {
    if (!pushEndpointAllowed(row.endpoint)) continue;
    if (row.kind === "training" && row.space_id) {
      const doc = await env.DB.prepare(
        "SELECT payload FROM documents WHERE space_id=?",
      )
        .bind(row.space_id)
        .first<{ payload: string }>();
      if (!doc) continue;
      const s = systemSchema.parse(JSON.parse(doc.payload)),
        ref = JSON.parse(row.reference);
      if (
        s.trainingHold?.active ||
        !s.sessions.some(
          (x) =>
            x.id === ref.id &&
            x.status === "待完成" &&
            x.date === ref.date &&
            x.time === ref.time,
        )
      )
        continue;
    }
    const claim = await env.DB.prepare(
      "INSERT INTO notification_deliveries(notification_id,subscription_id,status,lease_until) VALUES(?,?,'sending',?) ON CONFLICT(notification_id,subscription_id) DO UPDATE SET status='sending',lease_until=excluded.lease_until,attempts=notification_deliveries.attempts+1 WHERE notification_deliveries.status<>'sent' AND notification_deliveries.lease_until<? AND notification_deliveries.attempts<5 RETURNING notification_id",
    )
      .bind(
        row.id,
        row.subscription_id,
        new Date(Date.now() + 5 * 60000).toISOString(),
        stamp(),
      )
      .all();
    if (!claim.results.length) continue;
    try {
      const payload = await buildPushPayload(
        {
          data: JSON.stringify({
            title: "循序提醒",
            body: "你有一条训练或复查待办，请打开循序查看。",
            url: "#settings",
            tag: row.id,
          }),
          options: { ttl: 3600 },
        },
        {
          endpoint: row.endpoint,
          expirationTime: null,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        {
          subject: "https://fitness.bibidu.com",
          publicKey: env.VAPID_PUBLIC_KEY,
          privateKey: env.VAPID_PRIVATE_KEY,
        },
      );
      const response = await transport(row.endpoint, {
        ...payload,
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        await env.DB.prepare(
          "UPDATE notification_deliveries SET status='sent' WHERE notification_id=? AND subscription_id=?",
        )
          .bind(row.id, row.subscription_id)
          .run();
      } else {
        await env.DB.prepare(
          "UPDATE notification_deliveries SET status='retry' WHERE notification_id=? AND subscription_id=?",
        )
          .bind(row.id, row.subscription_id)
          .run();
        if ([404, 410].includes(response.status))
          await env.DB.prepare("DELETE FROM push_subscriptions WHERE id=?")
            .bind(row.subscription_id)
            .run();
      }
    } catch {
      await env.DB.prepare(
        "UPDATE notification_deliveries SET status='retry' WHERE notification_id=? AND subscription_id=?",
      )
        .bind(row.id, row.subscription_id)
        .run();
    }
  }
}
export async function scheduledReminders(env: Env, at = new Date()) {
  const rows = await env.DB.prepare(
    "SELECT d.space_id,d.payload,d.version,s.owner_id,f.* FROM documents d JOIN spaces s ON s.id=d.space_id JOIN notification_preferences f ON f.user_id=s.owner_id WHERE f.training=1 OR f.review=1",
  ).all<{
    space_id: string;
    payload: string;
    version: number;
    owner_id: string;
    time_zone: string;
    training: number;
    review: number;
    lead: number;
  }>();
  for (const row of rows.results) {
    const s = systemSchema.parse(JSON.parse(row.payload));
    for (const due of dueNotices(s, row, at)) {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO notifications(id,user_id,space_id,event_key,kind,reference,title,href,created_at) SELECT ?,?,?,?,?,?,?,?,? FROM documents WHERE space_id=? AND version=?",
      )
        .bind(
          crypto.randomUUID(),
          row.owner_id,
          row.space_id,
          due.key,
          due.kind,
          JSON.stringify(due.reference),
          due.title,
          due.href,
          at.toISOString(),
          row.space_id,
          row.version,
        )
        .run();
    }
  }
  await deliverNotifications(env);
}
