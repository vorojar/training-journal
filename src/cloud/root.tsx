import { useCallback, useEffect, useRef, useState } from "react";
import App from "../execution/app";
import { Button, Input } from "../execution/ui";
import {
  request,
  send,
  type CloudUser,
  type Space,
  type CloudDocument,
} from "./client";
export const cloudMode = () => import.meta.env.BASE_URL === "/";
export default function CloudRoot() {
  const [user, setUser] = useState<CloudUser | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [spaces, setSpaces] = useState<Space[]>([]),
    [selected, setSelected] = useState(""),
    [doc, setDoc] = useState<CloudDocument | null>(null),
    [status, setStatus] = useState("正在连接云端");
  const current = useRef("");
  const [invite, setInvite] = useState(
    () =>
      new URLSearchParams(location.hash.split("?")[1] || "").get("invite") ||
      "",
  );
  const initialize = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const auth = await request<{ user: CloudUser } | null>(
        "/api/auth/get-session",
      );
      if (!auth?.user) {
        setUser(null);
        return;
      }
      setUser(auth.user);
      await send("/api/bootstrap", {
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      const list = await request<{ spaces: Space[] }>("/api/spaces");
      setSpaces(list.spaces);
      const last = localStorage.getItem("fitness-space-" + auth.user.id);
      setSelected((previous) =>
        list.spaces.some((x) => x.id === previous)
          ? previous
          : list.spaces.find((x) => x.id === last)?.id ||
            list.spaces.find((x) => x.role === "owner")?.id ||
            "",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "云端连接失败");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  useEffect(() => {
    const capture = () => {
      const token = new URLSearchParams(location.hash.split("?")[1] || "").get(
        "invite",
      );
      if (token) setInvite(token);
    };
    window.addEventListener("hashchange", capture, true);
    return () => window.removeEventListener("hashchange", capture, true);
  }, []);
  const refresh = useCallback(async () => {
    if (!selected) return;
    try {
      const list = await request<{ spaces: Space[] }>("/api/spaces");
      if (current.current !== selected) return;
      setSpaces(list.spaces);
      if (!list.spaces.some((s) => s.id === selected)) {
        setDoc(null);
        setSelected(list.spaces.find((s) => s.role === "owner")?.id || "");
        return;
      }
      const latest = await request<CloudDocument>(
        "/api/spaces/" + selected + "/document",
      );
      if (current.current !== selected) return;
      setDoc((previous) =>
        previous && previous.version > latest.version ? previous : latest,
      );
      setStatus("已同步到云端");
    } catch (e) {
      setStatus("同步失败：" + (e instanceof Error ? e.message : "请重试"));
      throw e;
    }
  }, [selected]);
  useEffect(() => {
    if (!user || !selected) return;
    current.current = selected;
    setDoc(null);
    setStatus("正在连接云端");
    localStorage.setItem("fitness-space-" + user.id, selected);
    void refresh().catch(() => {});
    const tick = () => {
      if (document.visibilityState === "visible")
        void refresh().catch(() => {});
    };
    const timer = setInterval(tick, 20000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [selected, user?.id, refresh]);
  if (!cloudMode()) return <App />;
  if (loading)
    return <div className="cloud-loading">正在连接你的云端健身空间…</div>;
  if (error)
    return (
      <div className="auth-page">
        <section className="auth-panel">
          <h1>暂时无法连接云端</h1>
          <p className="error">{error}</p>
          <Button onClick={() => void initialize()}>重试连接</Button>
        </section>
      </div>
    );
  if (!user) return <AuthPage done={initialize} />;
  if (invite)
    return (
      <InvitePage
        token={invite}
        user={user}
        close={() => {
          setInvite("");
          history.replaceState(null, "", "#settings");
          void initialize();
        }}
      />
    );
  const space = spaces.find((x) => x.id === selected);
  if (!space || !doc)
    return (
      <div className="auth-page">
        <section className="auth-panel">
          <h1>正在打开健身空间</h1>
          <p>{status}</p>
          <Button secondary onClick={() => void initialize()}>
            重新连接
          </Button>
        </section>
      </div>
    );
  return (
    <App
      key={space.id}
      cloud={{
        user,
        spaces,
        space,
        document: doc,
        status,
        refresh,
        select: (id) => {
          if (current.current === id) return;
          current.current = id;
          setDoc(null);
          setSelected(id);
        },
        onSaved: (newDoc) => {
          if (current.current !== space.id) return;
          setDoc((previous) =>
            previous && previous.version > newDoc.version
              ? previous
              : {
                  ...newDoc,
                  legacy: newDoc.legacy ?? previous?.legacy,
                },
          );
          setStatus("已同步到云端");
        },
        logout: async () => {
          if ("serviceWorker" in navigator) {
            const reg = await navigator.serviceWorker.getRegistration("/");
            const sub = await reg?.pushManager.getSubscription();
            if (sub) {
              await send("/api/notifications/unsubscribe", {
                endpoint: sub.endpoint,
              });
              await sub.unsubscribe();
            }
          }
          await send("/api/auth/sign-out", {});
          current.current = "";
          setDoc(null);
          setUser(null);
          setSpaces([]);
          setSelected("");
        },
      }}
    />
  );
}
function AuthPage({ done }: { done: () => Promise<void> }) {
  const [mode, setMode] = useState<"login" | "signup">(() =>
      location.hash.split("?")[0] === "#signup" ? "signup" : "login",
    ),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const update = () =>
      setMode(location.hash.split("?")[0] === "#signup" ? "signup" : "login");
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return (
    <div className="auth-page">
      <section className="auth-intro">
        <a className="auth-brand" href="#overview">
          <span>循</span><strong>循序</strong>
        </a>
        <h1>
          你的健身计划，
          <br />
          从这里开始执行。
        </h1>
        <p>
          完整评估，教练制定，日历执行，定期复查。
          <br />
          手机和电脑同步，和授权教练一起把计划落实。
        </p>
        <div className="auth-steps">
          <span>01　独立个人空间</span>
          <span>02　邀请你的教练</span>
          <span>03　持续记录与调整</span>
        </div>
      </section>
      <section className="auth-panel">
        <h2>{mode === "login" ? "登录你的健身空间" : "注册独立健身空间"}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            void send(
              mode === "login"
                ? "/api/auth/sign-in/email"
                : "/api/auth/sign-up/email",
              { email, password, ...(mode === "signup" ? { name } : {}) },
            )
              .then(done)
              .catch((e) => setError(e instanceof TypeError ? "网络连接失败，请重试" : e.message || (mode === "login" ? "登录失败" : "注册失败")))
              .finally(() => setBusy(false));
          }}
        >
          {mode === "signup" && (
            <Input label="姓名／称呼" required value={name} onChange={setName} />
          )}
          <Input
            label="邮箱"
            type="email"
            required
            value={email}
            onChange={setEmail}
          />
          <Input
            label="密码（至少6位）"
            type="password"
            required
            value={password}
            onChange={setPassword}
          />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? (mode === "login" ? "登录中…" : "注册中…") : mode === "login" ? "登录" : "注册"}
          </Button>
        </form>
        <button
          className="link"
          onClick={() => {
            const next = mode === "login" ? "signup" : "login";
            setMode(next);
            const token = new URLSearchParams(
              location.hash.split("?")[1] || "",
            ).get("invite");
            location.hash =
              next + (token ? "?invite=" + encodeURIComponent(token) : "");
            setError("");
          }}
        >
          {mode === "login" ? "还没有账号？注册使用" : "已有账号？返回登录"}
        </button>
        <small>
          请保存好密码，暂不支持邮件找回。
        </small>
      </section>
    </div>
  );
}
function InvitePage({
  token,
  user,
  close,
}: {
  token: string;
  user: CloudUser;
  close: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [accepted, setAccepted] = useState(false);
  return (
    <div className="auth-page">
      <section className="auth-panel">
        <h1>{accepted ? "已提交教练加入申请" : "接受教练邀请"}</h1>
        <p>
          当前登录：{user.name}（{user.email}）
        </p>
        <p>
          {accepted
            ? "请联系学员打开“设置 → 教练协作”确认授权。确认后，点页面顶部“我的学员”即可开始评估、制定方案和调整日历。"
            : "你将申请以教练身份访问邀请人的健身空间。只有邀请邮箱匹配、学员再次确认授权后，才能查看健康资料。"}
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!accepted && (
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError("");
              void send("/api/invites/accept", { token })
                .then(() => setAccepted(true))
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            接受邀请并申请加入
          </Button>
        )}
        <Button secondary onClick={close}>
          {accepted ? "返回我的空间" : "暂不加入，返回我的空间"}
        </Button>
      </section>
    </div>
  );
}
