import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  Home,
  ClipboardCheck,
  FileText,
  CalendarDays,
  PenLine,
  RefreshCcw,
  Database,
  Download,
  Upload,
  UserRound,
  ChevronRight,
  X,
  Check,
} from "lucide-react";
import {
  readRecords,
  saveRecord,
  parseBackup,
  importRecords,
} from "../lib/storage";
import type { SavedRecord } from "../lib/model";
import {
  emptySystem,
  migrateLegacy,
  systemSchema,
  today,
  type System,
} from "./domain";
import {
  ProfileEditor,
  AssessmentEditor,
  ProblemEditor,
  PlanEditor,
  SessionEditor,
  DailyEditor,
  ReviewEditor,
} from "./editors";
import {
  Overview,
  AssessmentScreen,
  PlanScreen,
  CalendarScreen,
  DailyScreen,
  ReviewScreen,
} from "./screens";
import { Button, Modal, Section } from "./ui";
import {
  formatRoute,
  missingTarget,
  pageForView,
  pages,
  type Edit,
} from "./routes";
import { EditorNavigationContext, useHashNavigation } from "./hash-navigation";
const navigationItems = [
  ["我的总览", Home],
  ["训练前评估", ClipboardCheck],
  ["教练方案", FileText],
  ["训练日历", CalendarDays],
  ["每日记录", PenLine],
  ["复查与调整", RefreshCcw],
] as const;
type Editing = { key: string; edit: Edit; snapshot: System; version: number };
export default function App() {
  const [records, setRecords] = useState<SavedRecord[]>([]),
    [s, setS] = useState<System>(emptySystem),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [editing, setEditing] = useState<Editing | null>(null),
    [leave, setLeave] = useState<(() => void) | null>(null);
  const dirty = useRef(false),
    saving = useRef(false);
  const navigation = useHashNavigation(
    (retry) => {
      if (saving.current) {
        setNotice("正在保存，请稍候再离开填写窗口");
        return false;
      }
      if (dirty.current) {
        setLeave(() => retry);
        return false;
      }
      return true;
    },
    () => dirty.current || saving.current,
  );
  const { route } = navigation;
  const view = pages[route.page];
  const file = useRef<HTMLInputElement>(null),
    channel = useRef<BroadcastChannel | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await readRecords();
      const state = r.find((x) => x.id === "execution-system" && !x.deleted);
      setS(state ? systemSchema.parse(state.payload) : migrateLegacy(r));
      setRecords(r);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取失败");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    if ("BroadcastChannel" in window) {
      channel.current = new BroadcastChannel("steady-training-journal");
      channel.current.onmessage = () => void load();
    }
    return () => channel.current?.close();
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (loading || error) return;
    const key = formatRoute(route);
    if (!route.edit) {
      setEditing(null);
      dirty.current = false;
      saving.current = false;
      return;
    }
    if (editing?.key === key) return;
    const missing = missingTarget(s, route.edit);
    if (missing) {
      setNotice(
        missing +
          "，已返回对应页面。记录仅保存在原浏览器，链接不会携带健康数据。",
      );
      navigation.navigate(
        { ...route, edit: undefined },
        { replace: true, skipGuard: true },
      );
      return;
    }
    dirty.current = false;
    saving.current = false;
    setEditing({
      key,
      edit: route.edit,
      snapshot: structuredClone(s),
      version: records.find((x) => x.id === "execution-system")?.version || 0,
    });
  }, [route, loading, error, s, records, editing?.key]);
  function go(v: string) {
    navigation.navigate({
      page: pageForView(v),
      calendar: { month: today().slice(0, 7), date: today() },
    });
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function edit(value: Edit) {
    navigation.navigate(
      { ...route, edit: value },
      { parent: formatRoute({ ...route, edit: undefined }) },
    );
  }
  async function save(next: System) {
    if (!editing) throw new Error("填写窗口已关闭，请重试");
    const parsed = systemSchema.safeParse(next);
    if (!parsed.success)
      throw new Error(
        "请检查日期、数值范围及视频链接。" +
          (parsed.error.issues[0]?.message || ""),
      );
    const r = await saveRecord(
      "system",
      "execution-system",
      parsed.data,
      editing.version,
    );
    setRecords((old) => [r, ...old.filter((x) => x.id !== r.id)]);
    setS(parsed.data);
    channel.current?.postMessage("refresh");
    setNotice("已保存，相关记录与日历已更新");
  }
  function exportData() {
    const data = records.some((x) => x.id === "execution-system")
      ? records
      : [
          ...records,
          {
            id: "execution-system",
            kind: "system",
            payload: s,
            version: 1,
            deleted: 0,
            updatedAt: new Date().toISOString(),
          },
        ];
    const blob = new Blob(
      [
        JSON.stringify(
          {
            app: "循序 · 健身计划执行系统",
            exportedAt: new Date().toISOString(),
            records: data,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `健身计划备份-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("备份已导出，请妥善保存");
  }
  async function importFile(f?: File) {
    if (!f) return;
    try {
      if (f.size > 5_000_000) throw new Error("备份不能超过5MB");
      const items = parseBackup(await f.text());
      const added = await importRecords(items);
      await load();
      channel.current?.postMessage("refresh");
      setNotice(
        `已导入 ${added} 条，保留 ${items.length - added} 条当前已有记录。`,
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "导入失败");
    } finally {
      if (file.current) file.current.value = "";
    }
  }
  const props = { s, edit, go };
  const title =
    view === "我的总览"
      ? `${s.profile.name ? s.profile.name + "的" : "我的"}健身计划`
      : view;
  return (
    <EditorNavigationContext.Provider
      value={{
        setDirty: (value) => {
          dirty.current = value;
        },
        setSaving: (value) => {
          saving.current = value;
        },
      }}
    >
      <div className="app">
        <aside className="sidebar">
          <a
            className="brand"
            href="#overview"
            onClick={(e) => {
              e.preventDefault();
              go("我的总览");
            }}
          >
            <span>循</span>
            <strong>循序</strong>
          </a>
          <nav aria-label="主要导航">
            {navigationItems.map(([name, Icon]) => (
              <button
                key={name}
                className={view === name ? "active" : ""}
                aria-current={view === name ? "page" : undefined}
                onClick={() => go(name)}
              >
                <Icon size={20} />
                <span>{name}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-foot">
            <button
              aria-label="资料与备份"
              className={view === "资料与备份" ? "active" : ""}
              onClick={() => go("资料与备份")}
            >
              <Database size={19} />
              <span>资料与备份</span>
            </button>
            <div className="person">
              <span className="avatar">
                {s.profile.name?.slice(0, 1) || "我"}
              </span>
              <span>
                <strong>{s.profile.name || "我的训练空间"}</strong>
                <small>数据保存在此浏览器</small>
              </span>
            </div>
          </div>
        </aside>
        <main>
          <header className="page-header">
            <div>
              <h1>{title}</h1>
              <p>
                {view === "我的总览" ? s.profile.goal : "个人健身计划执行系统"}
                {view === "我的总览" && s.profile.gainKg !== null && (
                  <span> · 增重目标 {s.profile.gainKg} kg</span>
                )}
              </p>
            </div>
            <Button
              secondary
              disabled={loading || !!error}
              onClick={() => edit({ type: "profile" })}
            >
              <UserRound size={18} />
              编辑个人资料
            </Button>
          </header>
          {loading ? (
            <div className="loading" role="status">
              正在读取你的健身计划…
            </div>
          ) : error ? (
            <Section title="暂时无法读取记录">
              <p className="error" role="alert">
                {error}
              </p>
              <Button onClick={() => void load()}>重新读取</Button>
            </Section>
          ) : view === "我的总览" ? (
            <Overview {...props} />
          ) : view === "训练前评估" ? (
            <AssessmentScreen {...props} />
          ) : view === "教练方案" ? (
            <PlanScreen {...props} />
          ) : view === "训练日历" ? (
            <CalendarScreen
              {...props}
              calendar={route.calendar}
              setCalendar={(calendar) =>
                navigation.navigate({ ...route, calendar })
              }
            />
          ) : view === "每日记录" ? (
            <DailyScreen {...props} />
          ) : view === "复查与调整" ? (
            <ReviewScreen {...props} />
          ) : (
            <>
              <Section
                title="个人资料"
                action={
                  <Button secondary onClick={() => edit({ type: "profile" })}>
                    编辑资料
                  </Button>
                }
              >
                <dl>
                  <div>
                    <dt>称呼</dt>
                    <dd>{s.profile.name || "尚未填写"}</dd>
                  </div>
                  <div>
                    <dt>出生年份</dt>
                    <dd>{s.profile.birthYear ?? "尚未填写"}</dd>
                  </div>
                  <div>
                    <dt>训练目标</dt>
                    <dd>{s.profile.goal}</dd>
                  </div>
                  <div>
                    <dt>负责教练</dt>
                    <dd>{s.profile.coach || "尚未填写"}</dd>
                  </div>
                </dl>
              </Section>
              <Section
                title="记录备份与转移"
                description="健康资料只保存在当前浏览器，不会随网站发布到 GitHub。更换设备或清理浏览器前，请先导出备份。"
              >
                <div className="backup-actions">
                  <Button onClick={exportData}>
                    <Download size={18} />
                    导出完整备份
                  </Button>
                  <Button secondary onClick={() => file.current?.click()}>
                    <Upload size={18} />
                    导入备份
                  </Button>
                </div>
                <p className="muted">
                  当前共 {s.daily.length} 条每日记录、{s.sessions.length}{" "}
                  个课次、
                  {s.reviews.length}{" "}
                  次复查。不同设备目前不自动同步；同编号导入保留此浏览器已有版本。
                </p>
                <p className="muted">
                  “教练填写”表示填写流程，目前没有独立教练账号与远程协作。教练目前需在同一设备一起填写。备份可迁移到新浏览器，不支持双向合并。
                </p>
                <input
                  ref={file}
                  type="file"
                  hidden
                  accept="application/json,.json"
                  aria-label="选择备份文件"
                  onChange={(e) => void importFile(e.target.files?.[0])}
                />
              </Section>
              {records.some((x) => x.kind !== "system") && (
                <Section
                  title="保留的原版资料"
                  description="原有个人资料、评估和身体记录已带入新系统；原版训练、复查与调整笔记仍保留在下方。原表描述不代表已经核实。"
                >
                  {records
                    .filter((x) => x.kind !== "system")
                    .map((r) => (
                      <details className="legacy" key={r.id}>
                        <summary>
                          {r.kind} ·{" "}
                          {r.payload.topic ||
                            r.payload.date ||
                            r.payload.exercise ||
                            r.id}
                          {r.deleted ? "（原版归档）" : ""}
                          <ChevronRight size={16} />
                        </summary>
                        <dl>
                          {Object.entries(r.payload).map(([k, v]) => (
                            <div key={k}>
                              <dt>
                                {(
                                  {
                                    birthYear: "出生年份",
                                    goal: "目标",
                                    height: "身高",
                                    baselineWeight: "起始体重",
                                    gainKg: "增重目标",
                                    startDate: "开始日期",
                                    coach: "教练",
                                    topic: "项目",
                                    detail: "内容",
                                    status: "状态",
                                    owner: "评估人",
                                    date: "日期",
                                    exercise: "动作",
                                    session: "训练分组",
                                    sets: "组数",
                                    quantity: "次数／时长",
                                    load: "负荷",
                                    effort: "费力程度",
                                    during: "训练中反应",
                                    nextDay: "次日恢复",
                                    notes: "备注",
                                    summary: "结论",
                                    reason: "原因",
                                    before: "调整前",
                                    after: "调整后",
                                    nextDate: "下次日期",
                                    weight: "体重",
                                    waist: "腰围",
                                    sleep: "睡眠",
                                    food: "饮食",
                                    appetite: "食欲",
                                  } as Record<string, string>
                                )[k] || k}
                              </dt>
                              <dd>{String(v ?? "未填写")}</dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    ))}
                </Section>
              )}
            </>
          )}
          <div className="page-bottom">
            循序 · 个人健身计划执行系统
            <span>资料 → 评估 → 方案 → 执行 → 复查</span>
          </div>
        </main>
        {notice && (
          <div className="toast" role="status">
            <Check size={18} />
            <span>{notice}</span>
            <button
              className="icon"
              aria-label="关闭提示"
              onClick={() => setNotice("")}
            >
              <X size={17} />
            </button>
          </div>
        )}
        {editing && editing.key === formatRoute(route) && (
          <Fragment key={editing.key}>
            {(() => {
              const { edit: e, snapshot: b } = editing,
                close = () => navigation.close(),
                shared = { s: b, save, close };
              if (e.type === "profile") return <ProfileEditor {...shared} />;
              if (e.type === "assessment")
                return <AssessmentEditor {...shared} />;
              if (e.type === "problem")
                return (
                  <ProblemEditor
                    {...shared}
                    problem={b.problems.find((x) => x.id === e.id)}
                  />
                );
              if (e.type === "plan")
                return (
                  <PlanEditor
                    {...shared}
                    plan={b.plans.find((x) => x.id === e.id)}
                    adjust={e.adjust}
                    reviewId={e.reviewId}
                  />
                );
              if (e.type === "daily")
                return (
                  <DailyEditor
                    {...shared}
                    entry={b.daily.find((x) => x.id === e.id)}
                  />
                );
              if (e.type === "review") return <ReviewEditor {...shared} />;
              const session = b.sessions.find((x) => x.id === e.id);
              return session ? (
                <SessionEditor {...shared} session={session} />
              ) : null;
            })()}
          </Fragment>
        )}
        {leave && (
          <Modal title="保留尚未保存的修改？" onClose={() => setLeave(null)}>
            <div className="form-content">
              <p>当前填写内容还没有保存。离开后，这些修改将不会保留。</p>
            </div>
            <footer className="form-footer">
              <Button secondary onClick={() => setLeave(null)}>
                继续填写
              </Button>
              <Button
                onClick={() => {
                  dirty.current = false;
                  setLeave(null);
                  leave();
                }}
              >
                放弃修改并离开
              </Button>
            </footer>
          </Modal>
        )}
      </div>
    </EditorNavigationContext.Provider>
  );
}
