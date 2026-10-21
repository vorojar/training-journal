import { useEffect, useState } from "react";
import { Button, Input, Section, Badge } from "../execution/ui";
import { request, send, type CloudConnection } from "./client";
type Member = {
  user_id: string;
  name: string;
  email: string;
  status: "pending" | "active";
  created_at: string;
};
type Invitation = {
  id: string;
  email: string;
  expires_at: string;
  revoked: number;
  used_by: string | null;
};
export default function CloudAccount({ cloud }: { cloud: CloudConnection }) {
  const [members, setMembers] = useState<Member[]>([]),
    [invites, setInvites] = useState<Invitation[]>([]),
    [email, setEmail] = useState(""),
    [link, setLink] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false),
    [collaborationOpen, setCollaborationOpen] = useState(false);
  const path = "/api/spaces/" + cloud.space.id;
  async function load() {
    if (cloud.space.role === "owner") {
      const access = await request<{
        members: Member[];
        invites: Invitation[];
      }>(path + "/members");
      setMembers(access.members);
      setInvites(access.invites);
    }
  }
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible")
        void load().catch((e) => setError(e.message));
    };
    refresh();
    const timer = setInterval(refresh, 20000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [cloud.space.id]);
  const pending = members.filter((m) => m.status === "pending").length;
  useEffect(() => {
    if (pending) setCollaborationOpen(true);
  }, [pending]);
  async function perform(action: () => Promise<unknown>) {
    setError("");
    setBusy(true);
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Section title="账号与空间">
        <dl>
          <div>
            <dt>当前账号</dt>
            <dd>
              {cloud.user.name} · {cloud.user.email}
            </dd>
          </div>
          <div>
            <dt>当前空间</dt>
            <dd>
              {cloud.space.name}{" "}
              <Badge tone="blue">
                {cloud.space.role === "owner" ? "本人空间" : "教练协作"}
              </Badge>
            </dd>
          </div>
          <div>
            <dt>同步状态</dt>
            <dd>{cloud.status}</dd>
          </div>
        </dl>
        <div className="backup-actions">
          <Button secondary onClick={() => void perform(() => cloud.refresh())}>
            立即同步
          </Button>
          <Button secondary onClick={() => void perform(() => cloud.logout())}>
            退出登录
          </Button>
        </div>
        {cloud.spaces.length > 1 && (
          <label className="field">
            <span>切换本人／学员空间</span>
            <select
              aria-label="切换健身空间"
              value={cloud.space.id}
              onChange={(e) => cloud.select(e.target.value)}
            >
              {cloud.spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.role === "owner" ? "我的空间" : "学员：" + s.owner_name}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </Section>
      <details
        className="settings-disclosure"
        open={collaborationOpen}
        onToggle={(e) => setCollaborationOpen(e.currentTarget.open)}
      >
        <summary>
          教练协作
          {pending > 0 && (
            <span className="pending-count">{pending}个待确认</span>
          )}
        </summary>
        {cloud.space.role === "owner" ? (
          <Section
            title="教练邀请与授权"
            description="邀请链接48小时内有效，只能由指定登录邮箱使用。教练接受后，请再次核对身份并确认授权。"
          >
            <form
              className="invite-form"
              onSubmit={(e) => {
                e.preventDefault();
                void perform(async () => {
                  const result = await send<{ url: string }>(
                    path + "/invites",
                    {
                      email,
                    },
                  );
                  setLink(result.url);
                  setCopied(false);
                });
              }}
            >
              <Input
                label="教练登录邮箱"
                type="email"
                required
                value={email}
                onChange={setEmail}
              />
              <Button type="submit" disabled={busy}>
                生成教练邀请链接
              </Button>
            </form>
            {link && (
              <div className="callout">
                <strong>请将此链接发给你的教练</strong>
                <textarea aria-label="教练邀请链接" readOnly value={link} />
                <Button
                  secondary
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(link)
                      .then(() => setCopied(true))
                      .catch(() => setError("复制失败，请长按链接复制"))
                  }
                >
                  {copied ? "已复制" : "复制邀请链接"}
                </Button>
                <p>
                  链接只显示这一次。不要公开发布；教练接受后，还需你在下方确认。
                </p>
              </div>
            )}
            <h3>已加入与待确认的教练</h3>
            {!members.length && (
              <p className="muted">
                还没有教练加入，你的健康资料目前只对本人开放。
              </p>
            )}
            {members.map((m) => (
              <div className="access-row" key={m.user_id}>
                <div>
                  <strong>{m.name}</strong>
                  <small>{m.email}</small>
                  <Badge tone={m.status === "active" ? "green" : "amber"}>
                    {m.status === "active" ? "已授权" : "待本人确认"}
                  </Badge>
                </div>
                <div className="row-actions">
                  {m.status === "pending" && (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void perform(() =>
                          send(
                            path + "/members/" + m.user_id,
                            { status: "active" },
                            "PUT",
                          ),
                        )
                      }
                    >
                      确认授权
                    </Button>
                  )}
                  <Button
                    secondary
                    disabled={busy}
                    onClick={() =>
                      void perform(() =>
                        send(
                          path + "/members/" + m.user_id,
                          { status: "revoked" },
                          "PUT",
                        ),
                      )
                    }
                  >
                    {m.status === "active" ? "撤销授权" : "拒绝申请"}
                  </Button>
                </div>
              </div>
            ))}
            <details className="legacy">
              <summary>查看发出的邀请</summary>
              {invites.map((i) => (
                <div className="access-row" key={i.id}>
                  <span>
                    {i.email}
                    <small>
                      {i.revoked
                        ? "已作废"
                        : i.used_by
                          ? "已使用"
                          : i.expires_at < new Date().toISOString()
                            ? "已过期"
                            : "待接受"}
                    </small>
                  </span>
                  {!i.revoked && !i.used_by && (
                    <Button
                      secondary
                      disabled={busy}
                      onClick={() =>
                        void perform(() =>
                          request(path + "/invites/" + i.id, {
                            method: "DELETE",
                          }),
                        )
                      }
                    >
                      作废邀请
                    </Button>
                  )}
                </div>
              ))}
            </details>
          </Section>
        ) : (
          <Section title="教练协作权限">
            <p>
              可以填写评估、问题分级、训练方案、复查和调整后续日历。本人资料、每日测量与实际完成情况由学员维护。学员撤销授权后，将无法继续访问此空间。
            </p>
          </Section>
        )}
      </details>
    </>
  );
}
