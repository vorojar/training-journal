/// <reference types="node" />
import { describe, it, expect } from "vitest";
import { runInNewContext } from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createECDH, randomBytes } from "node:crypto";
import {
  dueNotices,
  pushEndpointAllowed,
  localClock,
  notificationApi,
  deliverNotifications,
  scheduledReminders,
} from "./notifications";
import { emptySystem, type Session } from "../src/execution/domain";
import type { Env } from "./auth";
function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const path of [
    "0001_auth.sql",
    "0002_workspaces.sql",
    "0003_notifications.sql",
  ])
    sqlite.exec(
      readFileSync(new URL("../migrations/" + path, import.meta.url), "utf8"),
    );
  sqlite.exec(
    `INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES('u','测试','qa@example.invalid',0,0,0),('other','其他','other@example.invalid',0,0,0)`,
  );
  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const stmt = {
        bind(...v: unknown[]) {
          values = v;
          return stmt;
        },
        async all() {
          const rows = sqlite.prepare(sql).all(...(values as never[]));
          return {
            results: rows,
            success: true,
            meta: {
              changes: sqlite.prepare("SELECT changes() AS count").get()!.count,
            },
          };
        },
        async first() {
          return sqlite.prepare(sql).get(...(values as never[])) ?? null;
        },
        async run() {
          const result = sqlite.prepare(sql).run(...(values as never[]));
          return {
            results: [],
            success: true,
            meta: { changes: Number(result.changes) },
          };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
  return { sqlite, db };
}
function keys() {
  const e = createECDH("prime256v1");
  e.generateKeys();
  return {
    publicKey: e.getPublicKey().toString("base64url"),
    privateKey: e.getPrivateKey().toString("base64url"),
  };
}
function session(date = "2026-10-21", time = "00:05"): Session {
  return {
    id: "s",
    date,
    time,
    planId: "p",
    planVersion: 1,
    title: "测试",
    minutes: 30,
    status: "待完成",
    exercises: [],
    actual: "",
    effort: null,
    symptoms: "",
    nextDay: "",
    completedAt: "",
    cautions: "",
  };
}
const pref = { time_zone: "Asia/Shanghai", training: 1, review: 1, lead: 30 };
describe("提醒真实边界", () => {
  it("Service Worker显示提醒并仅打开本站，不跟随推送中的外部链接", async () => {
    const handlers: Record<string, (event: any) => void> = {};
    const calls: any[] = [];
    const waits: Promise<unknown>[] = [];
    const self = {
      location: { origin: "https://fitness.bibidu.com" },
      registration: {
        showNotification: async (title: string, options: unknown) =>
          calls.push({ title, options }),
      },
      clients: {
        matchAll: async () => [],
        openWindow: async (url: string) => calls.push({ url }),
      },
      addEventListener: (name: string, fn: (event: any) => void) => {
        handlers[name] = fn;
      },
    };
    runInNewContext(
      readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"),
      { self, URL },
    );
    handlers.push!({
      data: {
        json: () => ({
          body: "测试提醒",
          url: "https://untrusted.invalid",
          tag: "test",
        }),
      },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    await Promise.all(waits);
    expect(calls[0].title).toBe("循序提醒");
    handlers.notificationclick!({
      notification: { close: () => {} },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    await Promise.all(waits);
    expect(calls[1].url).toBe("https://fitness.bibidu.com/#settings");
  });

  it("按时区跨午夜提前提醒，暂停及完成不再提醒", () => {
    const s = emptySystem();
    s.sessions = [session()];
    const at = new Date("2026-10-20T15:40:00Z");
    expect(localClock(at, "Asia/Shanghai")).toEqual({
      date: "2026-10-20",
      minutes: 1420,
    });
    expect(dueNotices(s, pref, at)).toHaveLength(1);
    s.trainingHold = { active: true, since: "2026-10-20", reason: "重新评估" };
    expect(dueNotices(s, pref, at)).toHaveLength(0);
    s.trainingHold.active = false;
    s.sessions[0]!.status = "已完成";
    expect(dueNotices(s, pref, at)).toHaveLength(0);
  });
  it("推送地址仅允许受信任服务，拒绝SSRF与伪装后缀", () => {
    expect(pushEndpointAllowed("https://fcm.googleapis.com/fcm/send/a")).toBe(
      true,
    );
    for (const endpoint of [
      "http://fcm.googleapis.com/a",
      "https://localhost/a",
      "https://fcm.googleapis.com.evil.test/a",
      "https://fcm.googleapis.com:8443/a",
      "https://user:pass@fcm.googleapis.com/a",
    ])
      expect(pushEndpointAllowed(endpoint)).toBe(false);
  });
  it("提醒设置校验时区，通知已读不能影响他人", async () => {
    const { db, sqlite } = database();
    const env = { DB: db, APP_URL: "http://localhost" } as Env;
    const put = (body: unknown) =>
      notificationApi(
        new Request("http://localhost/api/notifications/preferences", {
          method: "PUT",
          body: JSON.stringify(body),
        }),
        env,
        "u",
      );
    await expect(
      put({
        timeZone: "Invalid/Zone",
        training: true,
        review: true,
        updates: true,
        lead: 30,
      }),
    ).rejects.toThrow();
    expect(
      (await put({
        timeZone: "Asia/Shanghai",
        training: true,
        review: true,
        updates: true,
        lead: 30,
      }))!.ok,
    ).toBe(true);
    sqlite.exec(
      `INSERT INTO notifications(id,user_id,event_key,kind,title,href,created_at) VALUES('aaaaaaaaaaaaaaaa','other','event','change','他人的通知','#overview','2026-10-20')`,
    );
    await notificationApi(
      new Request("http://localhost/api/notifications/read", {
        method: "POST",
        body: JSON.stringify({ id: "aaaaaaaaaaaaaaaa" }),
      }),
      env,
      "u",
    );
    expect(
      sqlite.prepare("SELECT read_at FROM notifications").get()!.read_at,
    ).toBe(null);
  });
  it("同一推送地址并发绑定只属于一个账号，不能覆盖他人订阅", async () => {
    const { db, sqlite } = database();
    const env = { DB: db, APP_URL: "http://localhost" } as Env;
    const pair = keys(),
      body = {
        endpoint: "https://fcm.googleapis.com/test-race",
        keys: {
          p256dh: pair.publicKey,
          auth: randomBytes(16).toString("base64url"),
        },
      };
    const post = (user: string) =>
      notificationApi(
        new Request("http://localhost/api/notifications/subscribe", {
          method: "POST",
          body: JSON.stringify(body),
        }),
        env,
        user,
      );
    const results = await Promise.all([post("u"), post("other")]);
    expect(results.map((r) => r!.status).sort()).toEqual([200, 409]);
    expect(
      sqlite.prepare("SELECT count(*) AS count FROM push_subscriptions").get()!
        .count,
    ).toBe(1);
  });
  it("定时任务重复执行不会重复生成训练提醒", async () => {
    const { db, sqlite } = database();
    const s = emptySystem();
    s.sessions = [session()];
    sqlite.exec(
      "INSERT INTO spaces VALUES('space','u','测试','2026-10-20');INSERT INTO notification_preferences VALUES('u','Asia/Shanghai',1,1,1,30)",
    );
    sqlite
      .prepare(
        "INSERT INTO documents(space_id,payload,version,actor_id,mutation_id,mutation_hash,action,updated_at) VALUES('space',?,1,'u','initial','initial','测试','2026-10-20')",
      )
      .run(JSON.stringify(s));
    const env = { DB: db, APP_URL: "http://localhost" } as Env;
    await Promise.all([
      scheduledReminders(env, new Date("2026-10-20T15:40:00Z")),
      scheduledReminders(env, new Date("2026-10-20T15:40:00Z")),
    ]);
    expect(
      sqlite.prepare("SELECT count(*) AS count FROM notifications").get()!
        .count,
    ).toBe(1);
  });
  it("真实SQL唯一键和租约保证并发推送只领取一次；失败可重试而不标成功", async () => {
    const { db, sqlite } = database(),
      vapid = keys(),
      client = keys();
    sqlite
      .prepare(
        "INSERT INTO notification_preferences VALUES('u','Asia/Shanghai',1,1,1,30)",
      )
      .run();
    sqlite
      .prepare(
        "INSERT INTO notifications(id,user_id,event_key,kind,title,href,created_at) VALUES('note','u','event','test','测试','#settings',?)",
      )
      .run(new Date().toISOString());
    sqlite
      .prepare("INSERT INTO push_subscriptions VALUES('sub','u',?,?,?,?)")
      .run(
        "https://fcm.googleapis.com/test",
        client.publicKey,
        randomBytes(16).toString("base64url"),
        new Date().toISOString(),
      );
    const env = {
      DB: db,
      APP_URL: "http://localhost",
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
    } as Env;
    let calls = 0;
    const fail = (async (_url: unknown, init: RequestInit) => {
      calls++;
      expect(new Headers(init.headers).get("content-encoding")).toBe(
        "aes128gcm",
      );
      expect(new Headers(init.headers).get("authorization")).toMatch(/^vapid /);
      return new Response(null, { status: 503 });
    }) as typeof fetch;
    await Promise.all([
      deliverNotifications(env, "u", fail),
      deliverNotifications(env, "u", fail),
    ]);
    expect(calls).toBe(1);
    expect(
      sqlite.prepare("SELECT status FROM notification_deliveries").get()!
        .status,
    ).toBe("retry");
    sqlite.exec("UPDATE notification_deliveries SET lease_until='2000-01-01'");
    await deliverNotifications(
      env,
      "u",
      (async () => new Response(null, { status: 201 })) as typeof fetch,
    );
    expect(
      sqlite
        .prepare("SELECT status,attempts FROM notification_deliveries")
        .get(),
    ).toMatchObject({ status: "sent", attempts: 2 });
  });
});
