import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Home,
  ClipboardCheck,
  FileText,
  CalendarDays,
  PenLine,
  RefreshCcw,
  Download,
  Upload,
  Settings,
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
  reconcileSystem,
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
  navigationLabels,
  navigationGroup,
  type Page,
  type Edit,
} from "./routes";
import { EditorNavigationContext, useHashNavigation } from "./hash-navigation";
import { UpdateBell, NotificationCenter } from "../cloud/reminders";
import CloudAccount from "../cloud/account";
import {
  send,
  type CloudConnection,
  type CloudDocument,
} from "../cloud/client";
import { type HistorySelection } from "./lifecycle";
import {
  RecordsScreen,
  ArchiveEditor,
  HistoryEditor,
  MeasurementEditor,
  MeasurementsScreen,
  TemplateScreen,
  TemplateEditor,
  CoachScreen,
} from "./extensions";
import { DraftProvider } from "./drafts";
const navigationItems = [
  ["我的总览", Home],
  ["训练前评估", ClipboardCheck],
  ["教练方案", FileText],
  ["训练日历", CalendarDays],
  ["每日记录", PenLine],
  ["复查与调整", RefreshCcw],
] as const;
type Editing = { key: string; edit: Edit; snapshot: System; version: number };
export default function App({ cloud }: { cloud?: CloudConnection }) {
  const pendingMutation = useRef<{ key: string; id: string } | null>(null);
  const [pendingImport, setPendingImport] = useState<SavedRecord[] | null>(
    null,
  );
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
  const group = navigationGroup(route.page);
  const scrollPositions = useRef<Partial<Record<Page, number>>>({});
  useLayoutEffect(() => {
    window.scrollTo({
      top: scrollPositions.current[route.page] ?? 0,
      behavior: "instant",
    });
  }, [route.page]);
  const hasStudents = !!cloud?.spaces.some((x) => x.role === "coach");
  const file = useRef<HTMLInputElement>(null),
    channel = useRef<BroadcastChannel | null>(null);
  const load = useCallback(async () => {
    if (cloud) return cloud.refresh();
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
    if (cloud) return;
    void load();
    if ("BroadcastChannel" in window) {
      channel.current = new BroadcastChannel("steady-training-journal");
      channel.current.onmessage = () => void load();
    }
    return () => channel.current?.close();
  }, [load]);
  useEffect(() => {
    if (!cloud) return;
    setS(cloud.document.payload);
    setRecords([
      ...(cloud.document.legacy || []),
      {
        id: "execution-system",
        kind: "system",
        payload: cloud.document.payload,
        version: cloud.document.version,
        deleted: 0,
        updatedAt: cloud.document.updated_at,
      },
    ]);
    setLoading(false);
    setError("");
  }, [cloud?.document]);
  function blocked(e: Edit) {
    return (
      cloud?.space.role === "coach" &&
      ["profile", "daily", "archive"].includes(e.type)
    );
  }
  function guarded(action: () => void) {
    if (saving.current) {
      setNotice("正在保存，请稍候");
      return;
    }
    if (dirty.current) {
      setLeave(() => action);
      return;
    }
    action();
  }
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
    if (blocked(route.edit)) {
      setNotice("此项由学员本人填写，教练可以查看并制定训练安排");
      navigation.navigate(
        { ...route, edit: undefined },
        { replace: true, skipGuard: true },
      );
      return;
    }
    const missing = missingTarget(s, route.edit);
    if (missing) {
      setNotice(
        missing +
          "，已返回对应页面。请确认当前健身空间，链接不会携带健康数据。",
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
    scrollPositions.current[route.page] = window.scrollY;
    navigation.navigate({
      page: pageForView(v),
      calendar: { month: today().slice(0, 7), date: today() },
    });
  }
  function edit(value: Edit) {
    if (blocked(value)) {
      setNotice("此项由学员本人填写");
      return;
    }
    navigation.navigate(
      { ...route, edit: value },
      { parent: formatRoute({ ...route, edit: undefined }) },
    );
  }
  async function save(next: System, restore?: HistorySelection) {
    if (!editing) throw new Error("填写窗口已关闭，请重试");
    if (!restore) next = reconcileSystem(editing.snapshot, next);
    const parsed = systemSchema.safeParse(next);
    if (!parsed.success)
      throw new Error(
        "请检查日期、数值范围及视频链接。" +
          (parsed.error.issues[0]?.message || ""),
      );
    if (cloud) {
      const key = JSON.stringify({
        version: editing.version,
        restore,
        payload: parsed.data,
      });
      if (pendingMutation.current?.key !== key)
        pendingMutation.current = { key, id: crypto.randomUUID() };
      const result = await send<CloudDocument>(
        "/api/spaces/" + cloud.space.id + "/document",
        {
          payload: parsed.data,
          restore,
          version: editing.version,
          mutationId: pendingMutation.current.id,
          action: (
            {
              profile: "更新个人资料",
              assessment: "更新训练前评估",
              problem: "更新问题分级",
              plan: "更新方案与排期",
              session: "记录训练完成情况",
              daily: "更新每日记录",
              review: "记录定期复查",
              measurement: "更新量化评估",
              history: "恢复历史记录",
              archive: "归档或恢复记录",
              template: "套用方案模板",
            } as const
          )[editing.edit.type],
        },
        "PUT",
      );
      cloud.onSaved(result);
      setS(result.payload);
      setNotice(
        editing.edit.type === "archive"
          ? editing.edit.kind === "restore"
            ? "已恢复"
            : "已归档"
          : editing.edit.type === "history"
            ? "已恢复"
            : editing.edit.type === "template"
              ? "已创建方案草稿"
              : "已保存",
      );
      return;
    }
    const r = await saveRecord(
      "system",
      "execution-system",
      parsed.data,
      editing.version,
    );
    setRecords((old) => [r, ...old.filter((x) => x.id !== r.id)]);
    setS(parsed.data);
    channel.current?.postMessage("refresh");
    setNotice("已保存");
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
      if (cloud) {
        if (cloud.space.role !== "owner")
          throw new Error("只有本人可以导入备份");
        setPendingImport(items);
        return;
      }
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
  const props = { s, edit, go, owner: !cloud || cloud.space.role === "owner" };
  const title =
    route.page === "records"
      ? "历史与回收站"
      : route.page === "notifications"
        ? "提醒与通知"
        : route.page === "coach"
          ? "教练工作台"
          : navigationLabels[group];
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
                className={group === pageForView(name) ? "active" : ""}
                aria-current={group === pageForView(name) ? "page" : undefined}
                onClick={() => go(name)}
              >
                <Icon size={20} />
                <span>
                  {
                    navigationLabels[
                      pageForView(name) as keyof typeof navigationLabels
                    ]
                  }
                </span>
              </button>
            ))}
          </nav>
          <div className="sidebar-foot">
            <button
              aria-label="设置"
              className={group === "settings" ? "active" : ""}
              onClick={() => go("资料与备份")}
            >
              <Settings size={19} />
              <span>设置</span>
            </button>
            <div className="person">
              <span className="avatar">
                {s.profile.name?.slice(0, 1) || "我"}
              </span>
              <span>
                <strong>{s.profile.name || "我的训练空间"}</strong>
                <small>{cloud ? cloud.status : "数据保存在此浏览器"}</small>
              </span>
            </div>
          </div>
        </aside>
        <main>
          <header className="page-header">
            <div>
              <h1>{title}</h1>
              {route.page === "overview" &&
                s.profile.goal &&
                s.profile.goal !== "尚未设置训练目标" && (
                  <p>
                    {s.profile.goal}
                    {s.profile.gainKg !== null
                      ? ` · 增重目标 ${s.profile.gainKg} kg`
                      : ""}
                  </p>
                )}
              {cloud?.space.role === "coach" && (
                <p className="student-context">
                  学员：{cloud.space.owner_name}
                </p>
              )}
            </div>
            {cloud && (
              <UpdateBell cloud={cloud} open={() => go("提醒与通知")} />
            )}
            {group !== "settings" && (
              <button
                type="button"
                className="header-icon"
                aria-label="设置"
                onClick={() => go("资料与备份")}
              >
                <Settings size={20} />
              </button>
            )}
          </header>
          {s.trainingHold?.active && (
            <div className="hold-banner" role="alert">
              <strong>训练已暂停 · 等待重新评估</strong>
              <p>{s.trainingHold.reason}</p>
              <Button secondary onClick={() => edit({ type: "assessment" })}>
                完成评估与恢复确认
              </Button>
            </div>
          )}
          {cloud?.status.startsWith("同步失败") && (
            <p className="sync-error" role="alert">
              {cloud.status}
              <button
                className="link"
                onClick={() => void cloud.refresh().catch(() => {})}
              >
                重试
              </button>
            </p>
          )}
          {!cloud && (
            <a className="local-cloud-link" href="https://fitness.bibidu.com/">
              打开云端版 ↗
            </a>
          )}
          {group === "assessment" && (
            <nav className="subnav" aria-label="评估内容">
              {[
                ["训练前评估", "评估与问题"],
                ["量化评估", "测量与趋势"],
              ].map(([target, label]) => (
                <button
                  key={target}
                  aria-current={view === target ? "page" : undefined}
                  onClick={() => go(target!)}
                >
                  {label}
                </button>
              ))}
            </nav>
          )}
          {group === "plans" && (
            <nav className="subnav" aria-label="方案内容">
              {[
                ["教练方案", "当前方案"],
                ["方案模板", "从模板创建"],
              ].map(([target, label]) => (
                <button
                  key={target}
                  aria-current={view === target ? "page" : undefined}
                  onClick={() => go(target!)}
                >
                  {label}
                </button>
              ))}
            </nav>
          )}
          {["records", "coach", "notifications"].includes(route.page) && (
            <button
              className="back-to-settings"
              onClick={() => go("资料与备份")}
            >
              ← 设置
            </button>
          )}
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
          ) : view === "提醒与通知" ? (
            cloud ? (
              <NotificationCenter cloud={cloud} />
            ) : (
              <Section title="提醒">
                <p>登录云端账号后设置提醒。</p>
              </Section>
            )
          ) : view === "记录与恢复" ? (
            <RecordsScreen {...props} cloud={cloud} />
          ) : view === "量化评估" ? (
            <MeasurementsScreen {...props} />
          ) : view === "教练工作台" ? (
            <CoachScreen cloud={cloud} />
          ) : view === "方案模板" ? (
            <TemplateScreen
              key={String(!!route.edit)}
              {...props}
              cloud={cloud}
            />
          ) : view === "复查与调整" ? (
            <ReviewScreen {...props} />
          ) : (
            <>
              <div className="settings-links">
                {cloud && (
                  <button onClick={() => go("提醒与通知")}>
                    提醒与通知
                    <ChevronRight size={18} />
                  </button>
                )}
                <button onClick={() => go("记录与恢复")}>
                  历史与回收站
                  <ChevronRight size={18} />
                </button>
                {hasStudents && (
                  <button onClick={() => go("教练工作台")}>
                    教练工作台
                    <ChevronRight size={18} />
                  </button>
                )}
              </div>
              {cloud && (
                <CloudAccount
                  cloud={{
                    ...cloud,
                    select: (id) => guarded(() => cloud.select(id)),
                    logout: () =>
                      new Promise<void>((resolve, reject) =>
                        guarded(() => {
                          void cloud.logout().then(resolve, reject);
                        }),
                      ),
                  }}
                />
              )}
              <details className="settings-disclosure">
                <summary>个人资料</summary>
                <Section
                  title="个人资料"
                  action={
                    <Button
                      secondary
                      disabled={cloud?.space.role === "coach"}
                      onClick={() => edit({ type: "profile" })}
                    >
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
              </details>
              <details className="settings-disclosure">
                <summary>备份与转移</summary>
                <Section
                  title="记录备份与转移"
                  description={
                    cloud
                      ? "健康资料保存在独立云端空间，不会发布到 GitHub。备份可用于额外保留或迁入旧站资料。"
                      : "健康资料只保存在当前浏览器，不会随网站发布到 GitHub。更换设备或清理浏览器前，请先导出备份。"
                  }
                >
                  <div className="backup-actions">
                    <Button onClick={exportData}>
                      <Download size={18} />
                      导出完整备份
                    </Button>
                    <Button
                      secondary
                      disabled={cloud?.space.role === "coach"}
                      onClick={() => file.current?.click()}
                    >
                      <Upload size={18} />
                      导入备份
                    </Button>
                  </div>
                  <p className="muted">
                    当前共 {s.daily.length} 条每日记录、{s.sessions.length}{" "}
                    个课次、
                    {s.reviews.length} 次复查。
                    {cloud
                      ? "云端版会同步其他设备的新修改；同时编辑会检查版本，避免覆盖。"
                      : "不同设备目前不自动同步；同编号导入保留此浏览器已有版本。"}
                  </p>
                  <p className="muted">
                    {cloud
                      ? "导入备份会替换当前空间的计划与记录；导入前会让你核对并确认。原版资料会一起保留。"
                      : "“教练填写”表示填写流程，目前没有独立教练账号与远程协作。教练目前需在同一设备一起填写。备份可迁移到新浏览器，不支持双向合并。"}
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
              </details>
              {records.some((x) => x.kind !== "system") && (
                <details className="settings-disclosure">
                  <summary>原版资料</summary>
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
                </details>
              )}
            </>
          )}
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
          <DraftProvider
            key={editing.key}
            scope={cloud ? cloud.user.id + ":" + cloud.space.id : "local"}
            route={JSON.stringify(editing.edit)}
            version={editing.version}
            onDiscard={() =>
              setEditing({
                ...editing,
                snapshot: structuredClone(s),
                version:
                  records.find((r) => r.id === "execution-system")?.version ??
                  0,
              })
            }
          >
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
              if (e.type === "review")
                return (
                  <ReviewEditor
                    {...shared}
                    review={b.reviews.find((x) => x.id === e.id)}
                  />
                );
              if (e.type === "archive")
                return <ArchiveEditor {...shared} kind={e.kind} id={e.id} />;
              if (e.type === "history")
                return (
                  <HistoryEditor {...shared} cloud={cloud} version={e.id} />
                );
              if (e.type === "measurement")
                return <MeasurementEditor {...shared} id={e.id} />;
              if (e.type === "template")
                return <TemplateEditor {...shared} cloud={cloud} id={e.id} />;
              const session = b.sessions.find((x) => x.id === e.id);
              return session ? (
                <SessionEditor
                  {...shared}
                  session={session}
                  coachMode={cloud?.space.role === "coach"}
                />
              ) : null;
            })()}
          </DraftProvider>
        )}
        {pendingImport && cloud && (
          <Modal title="核对云端导入" onClose={() => setPendingImport(null)}>
            <div className="form-content">
              <p>
                准备导入 {pendingImport.length} 条备份记录，当前空间：
                {cloud.space.name}。
              </p>
              <p>
                确认后将替换此空间的当前计划、日历、评估及每日记录。建议先导出当前云端备份。原版资料会一起保存，其他空间不受影响。
              </p>
            </div>
            <footer className="form-footer">
              <Button secondary onClick={() => setPendingImport(null)}>
                取消
              </Button>
              <Button
                onClick={() => {
                  const items = pendingImport;
                  const next =
                    items.find((r) => r.kind === "system" && !r.deleted)
                      ?.payload || migrateLegacy(items);
                  const version = cloud.document.version;
                  const key = JSON.stringify({ version, next, items });
                  if (pendingMutation.current?.key !== key)
                    pendingMutation.current = { key, id: crypto.randomUUID() };
                  void send<CloudDocument>(
                    "/api/spaces/" + cloud.space.id + "/document",
                    {
                      payload: systemSchema.parse(next),
                      version,
                      mutationId: pendingMutation.current.id,
                      action: "导入原浏览器备份",
                      legacy: items.filter((r) => r.kind !== "system"),
                    },
                    "PUT",
                  )
                    .then((result) => {
                      cloud.onSaved({
                        ...result,
                        legacy: items.filter((r) => r.kind !== "system"),
                      });
                      setPendingImport(null);
                      setNotice("备份已导入云端，手机和电脑登录此账号即可查看");
                    })
                    .catch((e) => setNotice(e.message));
                }}
              >
                确认替换并导入
              </Button>
            </footer>
          </Modal>
        )}
        {leave && (
          <Modal title="保留尚未保存的修改？" onClose={() => setLeave(null)}>
            <div className="form-content">
              <p>
                当前内容尚未提交。填写内容会保存在本设备草稿中，稍后回到该窗口可恢复；请留意草稿保存失败提示。
              </p>
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
                保留草稿并离开
              </Button>
            </footer>
          </Modal>
        )}
      </div>
    </EditorNavigationContext.Provider>
  );
}
