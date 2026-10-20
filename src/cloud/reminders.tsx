import { useEffect, useState } from "react";
import { Button, Section } from "../execution/ui";
import { today, reviewProgress, type System } from "../execution/domain";
import { request, send, type CloudConnection } from "./client";
type Note = {
  id: string;
  space_id: string | null;
  kind: string;
  title: string;
  href: string;
  created_at: string;
  read_at: string | null;
};
type Preferences = {
  timeZone: string;
  training: boolean;
  review: boolean;
  updates: boolean;
  lead: 5 | 15 | 30 | 60;
};
export function ReminderTasks({
  s,
  go,
}: {
  s: System;
  go: (view: string) => void;
}) {
  const overdue = s.sessions.filter(
    (x) => x.status === "待完成" && x.date <= today(),
  );
  const plans = s.plans.filter((p) => p.status === "已发布");
  const reviews = plans.filter((p) => {
    const latest = s.reviews.find(
      (r) => !r.planIds || r.planIds.includes(p.id),
    );
    return (
      (latest?.nextDate || p.nextReview) &&
      (latest?.nextDate || p.nextReview) <= today()
    );
  });
  const pending = s.reviews.filter(
    (r) => r.action === "调整后续计划" && reviewProgress(s, r).remaining.length,
  );
  return (
    <Section title="提醒与待办">
      {s.trainingHold?.active ? (
        <p className="amber-text">训练已暂停，请先完成重新评估和恢复确认。</p>
      ) : (
        <p>
          {overdue.length
            ? `今天及以前有 ${overdue.length} 次训练待记录。`
            : "当前没有待记录的到期训练。"}
        </p>
      )}
      {reviews.length > 0 && <p>有 {reviews.length} 份方案已到复查日期。</p>}
      {pending.length > 0 && (
        <p>有 {pending.length} 次复查的方案调整尚未全部处理。</p>
      )}
      <div className="backup-actions">
        <Button
          secondary
          onClick={() => go(s.trainingHold?.active ? "训练前评估" : "训练日历")}
        >
          {s.trainingHold?.active ? "重新评估" : "查看训练日历"}
        </Button>
        <Button secondary onClick={() => go("复查与调整")}>
          查看复查待办
        </Button>
        <Button secondary onClick={() => go("资料与备份")}>
          提醒设置与更新通知
        </Button>
      </div>
    </Section>
  );
}
export function UpdateBell({
  cloud,
  open,
}: {
  cloud: CloudConnection;
  open: () => void;
}) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let live = true;
    const load = () => {
      if (document.visibilityState === "visible")
        void request<{ notifications: Note[] }>("/api/notifications")
          .then((r) => {
            if (live)
              setCount(r.notifications.filter((n) => !n.read_at).length);
          })
          .catch(() => {});
    };
    load();
    const timer = setInterval(load, 30000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [cloud.user.id]);
  return (
    <Button secondary onClick={open}>
      提醒{count ? ` · ${count}条未读` : ""}
    </Button>
  );
}
export function NotificationCenter({ cloud }: { cloud: CloudConnection }) {
  const [notes, setNotes] = useState<Note[]>([]),
    [prefs, setPrefs] = useState<Preferences>({
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      training: true,
      review: true,
      updates: true,
      lead: 30,
    }),
    [key, setKey] = useState(""),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [subscribed, setSubscribed] = useState(false);
  const supported =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  async function load(initial = false) {
    const data = await request<{
      notifications: Note[];
      preferences: {
        time_zone: string;
        training: number;
        review: number;
        updates: number;
        lead: Preferences["lead"];
      } | null;
      publicKey: string;
    }>("/api/notifications");
    setNotes(data.notifications);
    setKey(data.publicKey);
    if (initial && data.preferences) {
      const p = data.preferences;
      setPrefs({
        timeZone: p.time_zone,
        training: !!p.training,
        review: !!p.review,
        updates: !!p.updates,
        lead: p.lead,
      });
    }
    if (supported) {
      const reg = await navigator.serviceWorker.getRegistration("/");
      setSubscribed(!!(await reg?.pushManager.getSubscription()));
    }
  }
  useEffect(() => {
    void load(true).catch((e) => setError(e.message));
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        void load().catch((e) => setError(e.message));
    }, 30000);
    return () => clearInterval(timer);
  }, [cloud.user.id]);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "提醒设置失败");
    } finally {
      setBusy(false);
    }
  }
  async function enable() {
    if (!supported)
      throw new Error(
        "此浏览器暂不支持系统推送，可继续使用站内提醒。iPhone请先添加到主屏幕后打开。",
      );
    if (!key) throw new Error("系统推送暂未就绪，请稍后重试");
    const permission = await Notification.requestPermission();
    if (permission !== "granted")
      throw new Error(
        "尚未允许通知；站内提醒仍可用。你可以在浏览器网站设置中更改权限。",
      );
    await send("/api/notifications/preferences", prefs, "PUT");
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const raw = Uint8Array.from(
      atob(key.replace(/-/g, "+").replace(/_/g, "/")),
      (x) => x.charCodeAt(0),
    );
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: raw,
      }));
    await send("/api/notifications/subscribe", subscription.toJSON());
    setStatus("系统提醒已开启，关闭网页后也可接收。通知时间受设备和网络影响。");
  }
  return (
    <>
      <Section
        title="提醒设置"
        description="站内待办始终可查看。开启系统提醒后，训练、复查和资料更新可推送到此设备；锁屏通知只显示通用提示，不包含身体数据。"
      >
        <div className="reminder-options">
          {(["training", "review", "updates"] as const).map((field, i) => (
            <label className="checkline" key={field}>
              <input
                type="checkbox"
                checked={prefs[field]}
                onChange={(e) =>
                  setPrefs({ ...prefs, [field]: e.target.checked })
                }
              />
              {["训练提醒", "复查到期提醒", "教练／学员资料更新"][i]}
            </label>
          ))}
          <label className="field">
            <span>训练提前提醒</span>
            <select
              aria-label="训练提前提醒"
              value={prefs.lead}
              onChange={(e) =>
                setPrefs({
                  ...prefs,
                  lead: Number(e.target.value) as Preferences["lead"],
                })
              }
            >
              {[5, 15, 30, 60].map((n) => (
                <option key={n} value={n}>
                  {n}分钟
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>提醒时区</span>
            <input
              aria-label="提醒时区"
              value={prefs.timeZone}
              onChange={(e) => setPrefs({ ...prefs, timeZone: e.target.value })}
            />
          </label>
        </div>
        <div className="backup-actions">
          <Button
            secondary
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                await send("/api/notifications/preferences", prefs, "PUT");
                setStatus("提醒偏好已保存");
              })
            }
          >
            保存提醒偏好
          </Button>
          <Button disabled={busy} onClick={() => void perform(enable)}>
            {subscribed ? "重新检查系统提醒" : "开启此设备系统提醒"}
          </Button>
          {subscribed && (
            <Button
              secondary
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  const r = await navigator.serviceWorker.getRegistration("/");
                  const sub = await r?.pushManager.getSubscription();
                  if (sub) {
                    await send("/api/notifications/unsubscribe", {
                      endpoint: sub.endpoint,
                    });
                    await sub.unsubscribe();
                  }
                  setSubscribed(false);
                  setStatus("此设备系统提醒已关闭");
                })
              }
            >
              关闭此设备提醒
            </Button>
          )}
          <Button
            secondary
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                await send("/api/notifications/test", {});
                setStatus(
                  "测试提醒已写入站内中心；已开启系统提醒的设备会尝试接收推送",
                );
              })
            }
          >
            发送测试提醒
          </Button>
        </div>
        <p className="muted">
          iPhone／iPad：先在 Safari
          将网站添加到主屏幕，再从主屏幕打开并开启提醒。系统提醒由服务器每5分钟检查一次。
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {status && <p role="status">{status}</p>}
      </Section>
      <Section
        title="通知中心"
        description="显示最近50条更新与提醒；点击后进入对应空间。"
      >
        {!notes.length ? (
          <p className="muted">暂时没有通知。</p>
        ) : (
          notes.map((n) => (
            <div className="access-row" key={n.id}>
              <div>
                <strong>
                  {n.title}
                  {!n.read_at ? " · 未读" : ""}
                </strong>
                <small>{new Date(n.created_at).toLocaleString()}</small>
              </div>
              <Button
                secondary
                onClick={() =>
                  void perform(async () => {
                    await send("/api/notifications/read", { id: n.id });
                    if (n.space_id && n.space_id !== cloud.space.id)
                      cloud.select(n.space_id);
                    location.hash = n.href;
                  })
                }
              >
                查看
              </Button>
            </div>
          ))
        )}
      </Section>
    </>
  );
}
