import { coachName } from "./phone-flow";
import { RecordMenu } from "./record-menu";
import { useEffect, useState } from "react";
import {
  type System,
  type Measurement,
  type PlanTemplate,
  uid,
  today,
  systemSchema,
} from "./domain";
import {
  collections,
  labels,
  archiveRecord,
  restoreTrash,
  measurementGroups,
  recordTitle,
  templateFromPlan,
  planFromTemplate,
  differences,
  recoverHistory,
  type HistorySelection,
  type Kind,
} from "./lifecycle";
import {
  Button,
  Section,
  Empty,
  Input,
  Select,
  TextArea,
  numberValue,
} from "./ui";
import { Editor } from "./editors";
import { useDraftState, useDraft } from "./drafts";
import { request, send, type CloudConnection } from "../cloud/client";
import type { Edit } from "./routes";
type Props = { s: System; edit: (e: Edit) => void; owner?: boolean };
type SaveProps = {
  s: System;
  save: (s: System, restore?: HistorySelection) => Promise<void>;
  close: () => void;
};
export function RecordsScreen({
  s,
  edit,
  cloud,
}: { cloud?: CloudConnection } & Props) {
  const [history, setHistory] = useState<
      {
        version: number;
        action: string;
        actor_name: string;
        created_at: string;
      }[]
    >([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [more, setMore] = useState(true);
  const owner = !cloud || cloud.space.role === "owner";
  async function load(before?: number) {
    if (!cloud) return;
    setBusy(true);
    try {
      const r = await request<{ history: typeof history }>(
        `/api/spaces/${cloud.space.id}/history${before ? "?before=" + before : ""}`,
      );
      setHistory((v) => (before ? [...v, ...r.history] : r.history));
      setMore(r.history.length === 50);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [cloud?.space.id, cloud?.document.version]);
  return (
    <>
      <Section
        title="回收站"
        description="方案恢复为草稿；归档方案时，未完成课次会取消，已完成记录保留。"
      >
        {(s.trash ?? []).length ? (
          (s.trash ?? []).map((row) => (
            <div className="access-row" key={row.id}>
              <span>
                <strong>
                  {labels[row.kind]} · {recordTitle(row.kind, row.item)}
                </strong>
                <small>
                  {row.reason} · {new Date(row.at).toLocaleString("zh-CN")}
                </small>
              </span>
              {owner && (
                <Button
                  secondary
                  onClick={() =>
                    edit({ type: "archive", kind: "restore", id: row.id })
                  }
                >
                  恢复记录
                </Button>
              )}
            </div>
          ))
        ) : (
          <p className="muted">回收站为空</p>
        )}
      </Section>
      {cloud && (
        <Section
          title="云端历史版本"
          description="查看每次保存的差异，选择一条记录恢复；不会覆盖其他记录。"
        >
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {history.map((h) => (
            <div className="access-row" key={h.version}>
              <span>
                <strong>
                  v{h.version} · {h.action}
                </strong>
                <small>
                  {h.actor_name} ·{" "}
                  {new Date(h.created_at).toLocaleString("zh-CN")}
                </small>
              </span>
              <Button
                secondary
                onClick={() => edit({ type: "history", id: String(h.version) })}
              >
                对比与恢复
              </Button>
            </div>
          ))}
          {more && (
            <Button
              disabled={busy}
              secondary
              onClick={() => void load(history.at(-1)?.version)}
            >
              {busy ? "读取中…" : "更早版本"}
            </Button>
          )}
        </Section>
      )}
    </>
  );
}
export function ArchiveEditor({
  s,
  save,
  close,
  kind,
  id,
}: SaveProps & { kind: string; id: string }) {
  const [reason, setReason] = useDraftState("reason", "");
  const restore = kind === "restore";
  return (
    <Editor
      title={restore ? "恢复归档记录" : "归档记录"}
      onClose={close}
      label={restore ? "确认恢复" : "确认归档"}
      onSave={() =>
        save(
          restore
            ? restoreTrash(s, id)
            : archiveRecord(s, kind as Kind, id, reason),
        )
      }
    >
      {restore ? (
        <p>
          将恢复该条记录。恢复方案先作为草稿，不会自动重排日历；课次恢复会重新检查时间冲突。
        </p>
      ) : (
        <>
          <p>归档后可在回收站恢复。历史版本继续保留。</p>
          <TextArea
            label="归档原因"
            required
            value={reason}
            onChange={setReason}
          />
        </>
      )}
    </Editor>
  );
}
const fieldNames: Record<string, string> = {
  id: "编号",
  birthYear: "出生年份",
  height: "身高",
  baselineWeight: "起始体重",
  gainKg: "增重目标",
  coach: "教练",
  timeZone: "时区",
  assessor: "评估人",
  stopRules: "停止条件",
  metric: "指标",
  target: "目标值",
  photo: "照片",
  problemId: "关联问题",
  measurement: "测量描述",
  basis: "分级依据",
  priority: "优先级",
  retest: "复测方法",
  start: "开始日期",
  end: "结束日期",
  weekdays: "每周训练日",
  time: "时间",
  minutes: "时长",
  nextReview: "下次复查",
  progression: "进阶标准",
  exercises: "动作",
  purpose: "目的",
  sets: "组数",
  reps: "次数",
  load: "负荷",
  rest: "休息",
  tempo: "节奏",
  alternative: "替代动作",
  video: "示范链接",
  setLogs: "逐组记录",
  exerciseId: "动作编号",
  exerciseName: "动作名称",
  seconds: "秒数",
  done: "完成",
  actual: "实际完成",
  effort: "费力程度",
  symptoms: "症状",
  nextDay: "次日恢复",
  completedAt: "完成时间",
  planId: "方案编号",
  planVersion: "方案版本",
  waist: "腰围",
  sleep: "睡眠",
  heartRate: "心率",
  steps: "步数",
  energy: "精力",
  source: "来源",
  changes: "问题复评",
  action: "后续决策",
  planIds: "关联方案",
  nextDate: "下次复查日期",
  before: "原程度",
  after: "复查程度",
  profile: "个人资料",
  assessment: "训练前评估",
  daily: "每日记录",
  sessions: "训练课次",
  problems: "问题",
  plans: "方案",
  reviews: "复查",
  measurements: "量化测量",
  trash: "回收站",
  name: "名称",
  date: "日期",
  weight: "体重",
  bodyFat: "体脂",
  value: "测量值",
  unit: "单位",
  side: "侧别",
  method: "方法",
  goal: "目标",
  confirmed: "评估确认",
  cautions: "注意事项",
  notes: "备注",
  severity: "程度",
  status: "状态",
  conclusion: "结论",
  fields: "评估项目",
};
const pretty = (v: unknown): string =>
  v === undefined
    ? "无"
    : v === null
      ? "未填"
      : typeof v === "boolean"
        ? v
          ? "是"
          : "否"
        : Array.isArray(v)
          ? v
              .map((x) =>
                typeof x === "object" && x
                  ? recordTitle("daily", x as Record<string, unknown>)
                  : String(x),
              )
              .join("、")
          : typeof v === "object"
            ? JSON.stringify(v)
            : String(v).startsWith("data:image/")
              ? "评估照片"
              : String(v);
export function HistoryEditor({
  s,
  save,
  close,
  cloud,
  version,
}: SaveProps & { cloud?: CloudConnection; version: string }) {
  const [past, setPast] = useState<System | null>(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useDraftState("selection", ""),
    [ack, setAck] = useDraftState("ack", false);
  useEffect(() => {
    if (!cloud) return;
    void request<{ payload: System }>(
      `/api/spaces/${cloud.space.id}/history/${version}`,
    )
      .then((r) => setPast(systemSchema.parse(r.payload)))
      .catch((e) => setError(e.message));
  }, [cloud?.space.id, version]);
  const options = past
    ? [
        { key: "profile", label: "个人资料" },
        { key: "assessment", label: "训练前评估" },
        ...Object.entries(collections).flatMap(([kind, key]) =>
          (past[key] ?? []).map((row) => ({
            key: kind + ":" + row.id,
            label:
              labels[kind as Kind] + " · " + recordTitle(kind as Kind, row),
          })),
        ),
      ]
    : [];
  function value(state: System) {
    if (selected === "profile" || selected === "assessment")
      return state[selected];
    const [kind, id] = selected.split(":");
    return (state[collections[kind as Kind]] ?? []).find((x) => x.id === id);
  }
  const diff = past && selected ? differences(value(s), value(past)) : [];
  return (
    <Editor
      title={`历史版本 v${version} · 对比与恢复`}
      onClose={close}
      label="恢复所选记录"
      onSave={async () => {
        if (!past || !selected || !ack)
          throw new Error("请选择记录并确认已核对差异");
        if (cloud?.space.role !== "owner")
          throw new Error("只有本人可以恢复历史记录");
        const next = recoverHistory(s, past, selected);
        await save(next, { version: Number(version), key: selected });
      }}
    >
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : !past ? (
        <p>正在读取历史版本…</p>
      ) : (
        <>
          <label className="field">
            选择需要恢复的记录
            <select
              aria-label="历史记录"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setAck(false);
              }}
            >
              <option value="">请选择</option>
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <>
              <p className="muted">
                左侧是当前内容，右侧是历史内容。只恢复所选记录，方案恢复为草稿；复查恢复不追溯改写最新分级或排期。
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>字段</th>
                      <th>当前</th>
                      <th>历史</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.slice(0, 200).map((d) => (
                      <tr key={d.path}>
                        <td>
                          {d.path
                            .split(".")
                            .map((k) => fieldNames[k] ?? k)
                            .join(" / ") || "整条记录"}
                        </td>
                        <td className="diff-cell">{pretty(d.before)}</td>
                        <td className="diff-cell">{pretty(d.after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {diff.length > 200 && (
                <p>
                  共 {diff.length}{" "}
                  处差异，当前显示前200处，请缩小到具体记录核对。
                </p>
              )}
              {!diff.length && <p>该记录与当前内容相同。</p>}
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                我已核对差异，确认恢复这条记录
              </label>
            </>
          )}
        </>
      )}
    </Editor>
  );
}
export function MeasurementEditor({
  s,
  save,
  close,
  id,
  preferredCoach = "",
}: SaveProps & { id?: string; preferredCoach?: string }) {
  const [m, set] = useDraftState<Measurement>(
    "measurement",
    s.measurements?.find((x) => x.id === id) ?? {
      id: uid(),
      problemId: "",
      date: today(),
      metric: "",
      value: 0,
      unit: "",
      side: "整体",
      method: "",
      assessor: coachName(s, preferredCoach),
      target: null,
      notes: "",
      photo: "",
    },
  );
  const [error, setError] = useState("");
  const put = (k: keyof Measurement, v: unknown) =>
    set((x) => ({ ...x, [k]: v }));
  return (
    <Editor
      title={id ? "纠正量化测量" : "添加量化测量"}
      onClose={close}
      onSave={async () => {
        if (m.date > today(s.profile.timeZone))
          throw new Error("不能记录未来的测量");
        await save({
          ...s,
          measurements: (s.measurements ?? []).some((x) => x.id === m.id)
            ? s.measurements!.map((x) => (x.id === m.id ? m : x))
            : [...(s.measurements ?? []), m],
        });
      }}
    >
      <div className="form-grid">
        <Input
          label="测量日期"
          type="date"
          value={m.date}
          required
          onChange={(v) => put("date", v)}
        />
        <label className="field">
          关联问题
          <select
            aria-label="关联问题"
            value={m.problemId}
            onChange={(e) => put("problemId", e.target.value)}
          >
            <option value="">身体通用指标</option>
            {s.problems.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="指标名称"
          value={m.metric}
          required
          onChange={(v) => put("metric", v)}
        />
        <Input
          label="测量值"
          type="number"
          step="any"
          value={m.value}
          required
          onChange={(v) => put("value", numberValue(v))}
        />
        <Input
          label="单位"
          value={m.unit}
          required
          onChange={(v) => put("unit", v)}
        />
        <Select
          label="侧别"
          value={m.side}
          options={["整体", "左侧", "右侧"]}
          onChange={(v) => put("side", v)}
        />
        <Input
          label="目标值（可选）"
          type="number"
          step="any"
          value={m.target}
          onChange={(v) => put("target", numberValue(v))}
        />
        <Input
          label="评估人"
          value={m.assessor}
          required
          onChange={(v) => put("assessor", v)}
        />
      </div>
      <TextArea
        label="测量方法与条件"
        required
        value={m.method}
        onChange={(v) => put("method", v)}
        hint="同一方法、单位和侧别才能直接比较；程度由教练根据依据判断。"
      />
      <TextArea
        label="备注"
        value={m.notes}
        onChange={(v) => put("notes", v)}
      />
      <label className="field">
        评估照片（可选，PNG/JPEG/WebP，最多300KB）
        <input
          aria-label="评估照片"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (
              f.size > 300000 ||
              !["image/png", "image/jpeg", "image/webp"].includes(f.type)
            ) {
              setError("请选择300KB以内的PNG/JPEG/WebP照片");
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              put("photo", String(reader.result));
              setError("");
            };
            reader.onerror = () => setError("照片读取失败");
            reader.readAsDataURL(f);
          }}
        />
      </label>
      {m.photo && (
        <>
          <img className="assessment-photo" src={m.photo} alt="本次评估照片" />
          <Button secondary onClick={() => put("photo", "")}>
            移除照片
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </Editor>
  );
}
function MeasurementChart({ rows }: { rows: Measurement[] }) {
  const values = rows.map((x) => x.value),
    min = Math.min(...values),
    max = Math.max(...values),
    span = max - min || 1;
  const points = rows.map(
    (x, i) =>
      `${30 + (i / Math.max(1, rows.length - 1)) * 520},${150 - ((x.value - min) / span) * 120}`,
  );
  return (
    <svg
      viewBox="0 0 580 190"
      role="img"
      aria-label={`${rows[0]!.metric}测量趋势`}
      className="measure-chart"
    >
      <path d="M30 20V150H550" fill="none" stroke="#d6dce6" />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="#2563eb"
        strokeWidth="3"
      />
      {rows.map((m, i) => (
        <circle
          key={m.id}
          cx={points[i]!.split(",")[0]}
          cy={points[i]!.split(",")[1]}
          r="4"
          fill="#2563eb"
        >
          <title>
            {m.date}：{m.value}
            {m.unit}
          </title>
        </circle>
      ))}
      <text x="30" y="180" fontSize="13">
        {rows[0]!.date}
      </text>
      <text x="550" y="180" textAnchor="end" fontSize="13">
        {rows.at(-1)!.date}
      </text>
      <text x="30" y="14" fontSize="13">
        {min}–{max} {rows[0]!.unit}
      </text>
    </svg>
  );
}
export function MeasurementsScreen({ s, edit, owner = true }: Props) {
  const groups = measurementGroups(s);
  return (
    <>
      <Section
        title="测量记录"
        action={
          <Button onClick={() => edit({ type: "measurement" })}>
            添加测量
          </Button>
        }
      >
        {!groups.length && (
          <Empty
            title="还没有量化测量"
            description="记录基线、复查值和目标，开始追踪改善。"
          />
        )}
        {groups.map((rows) => {
          const a = rows[0]!,
            b = rows.at(-1)!;
          return (
            <article className="problem" key={a.id}>
              <h3>
                {a.metric} · {a.side}
              </h3>
              {a.problemId && (
                <p className="muted">
                  {s.problems.find((p) => p.id === a.problemId)?.name}
                </p>
              )}
              <dl className="measurement-summary">
                <div>
                  <dt>基线</dt>
                  <dd>
                    {a.value} {a.unit}
                  </dd>
                </div>
                <div>
                  <dt>最新</dt>
                  <dd>
                    {b.value} {b.unit}
                  </dd>
                </div>
                <div>
                  <dt>变化</dt>
                  <dd>
                    {(b.value - a.value).toFixed(2)} {a.unit}
                  </dd>
                </div>
                {b.target !== null && (
                  <div>
                    <dt>目标</dt>
                    <dd>
                      {b.target} {b.unit}
                    </dd>
                  </div>
                )}
              </dl>
              <details className="measure-method">
                <summary>测量方法</summary>
                <p>{a.method}</p>
              </details>
              <MeasurementChart rows={rows} />
              <details className="measurement-history">
                <summary>测量记录（{rows.length}）</summary>
                <div className="measurement-records">
                  {rows.map((m) => (
                    <div className="measurement-row" key={m.id}>
                      <div>
                        <strong>
                          {m.value} {m.unit}
                        </strong>
                        <small>
                          {m.date} · {m.assessor}
                        </small>
                      </div>
                      <RecordMenu
                        id={m.id}
                        kind="measurement"
                        name={m.metric + " " + m.date}
                        edit={edit}
                        owner={owner}
                        correction={{ type: "measurement", id: m.id }}
                      />
                    </div>
                  ))}
                </div>
              </details>
              {rows.filter((m) => m.photo).length > 0 && (
                <details>
                  <summary>对比评估照片</summary>
                  <div className="photo-comparison">
                    {rows
                      .filter((m) => m.photo)
                      .map((m) => (
                        <figure key={m.id}>
                          <img
                            className="assessment-photo"
                            src={m.photo}
                            alt={`${m.date} ${m.metric}评估照片`}
                          />
                          <figcaption>
                            {m.date} · {m.value}
                            {m.unit}
                          </figcaption>
                        </figure>
                      ))}
                  </div>
                </details>
              )}
            </article>
          );
        })}
      </Section>
    </>
  );
}
export function TemplateScreen({
  s,
  edit,
  cloud,
}: { cloud?: CloudConnection } & Props) {
  const [items, setItems] = useState<PlanTemplate[]>(s.templates ?? []),
    [error, setError] = useState("");
  useEffect(() => {
    if (cloud)
      void request<{ templates: PlanTemplate[] }>("/api/templates")
        .then((r) => setItems(r.templates))
        .catch((e) => setError(e.message));
  }, [cloud?.user.id]);
  return (
    <>
      <Section
        title="我的方案模板"
        description="选择模板创建独立草稿，核对后发布。"
      >
        {error && <p className="error">{error}</p>}
        {items.length ? (
          items.map((t) => (
            <article className="problem" key={t.id}>
              <h3>{t.name}</h3>
              <p>
                {t.weeks} 周 · {t.exercises.length} 个动作 · 每次 {t.minutes}{" "}
                分钟
              </p>
              <p>{t.goal}</p>
              <Button onClick={() => edit({ type: "template", id: t.id })}>
                套用并核对排期
              </Button>
            </article>
          ))
        ) : (
          <Empty
            title="还没有保存模板"
            description="在当前方案的“更多”中保存模板。"
          />
        )}
      </Section>
    </>
  );
}
export function TemplateEditor({
  s,
  save,
  close,
  cloud,
  id,
}: SaveProps & { cloud?: CloudConnection; id: string }) {
  const draft = useDraft();
  const saving = id.startsWith("save_"),
    plan = s.plans.find((x) => x.id === id.slice(5));
  const [t, set] = useDraftState<PlanTemplate | null>(
      "template",
      saving && plan ? templateFromPlan(plan) : null,
    ),
    [start, setStart] = useDraftState("start", today()),
    [error, setError] = useState("");
  useEffect(() => {
    if (!saving && !t && !draft?.pending) {
      if (cloud)
        void request<{ templates: PlanTemplate[] }>("/api/templates")
          .then((r) => set(r.templates.find((x) => x.id === id) ?? null))
          .catch((e) => setError(e.message));
      else set(s.templates?.find((x) => x.id === id) ?? null);
    }
  }, [id]);
  return (
    <Editor
      title={saving ? "保存为私人模板" : "套用方案模板"}
      onClose={close}
      label={saving ? "保存模板" : "创建方案草稿"}
      onSave={async () => {
        if (!t) throw new Error("模板不存在");
        if (saving) {
          if (cloud) await send("/api/templates", t, "PUT");
          else await save({ ...s, templates: [...(s.templates ?? []), t] });
        } else
          await save({
            ...s,
            plans: [...s.plans, planFromTemplate(t, start, s.profile.coach)],
          });
      }}
    >
      {error && <p className="error">{error}</p>}
      {t ? (
        <>
          <Input
            label="模板名称"
            required
            value={t.name}
            onChange={(v) => set({ ...t, name: v })}
          />
          <p>
            {t.exercises.length} 个动作 · {t.weeks} 周
          </p>
          {saving ? (
            <p>
              请核对动作说明和注意事项，移除仅适用于当前学员的个人信息后保存。
            </p>
          ) : (
            <Input
              label="新周期开始日期"
              type="date"
              required
              value={start}
              onChange={setStart}
            />
          )}
          <TextArea
            label="训练目标"
            value={t.goal}
            onChange={(v) => set({ ...t, goal: v })}
          />
          <TextArea
            label="注意事项"
            value={t.cautions}
            onChange={(v) => set({ ...t, cautions: v })}
          />
          <div className="form-grid">
            <Input
              label="周期周数"
              type="number"
              min={1}
              max={52}
              value={t.weeks}
              required
              onChange={(v) => set({ ...t, weeks: Number(v) })}
            />
            <Input
              label="每次分钟数"
              type="number"
              min={5}
              max={300}
              value={t.minutes}
              required
              onChange={(v) => set({ ...t, minutes: Number(v) })}
            />
            <Input
              label="训练时间"
              type="time"
              value={t.time}
              required
              onChange={(v) => set({ ...t, time: v })}
            />
          </div>
          <TextArea
            label="进阶与退阶标准"
            value={t.progression}
            onChange={(v) => set({ ...t, progression: v })}
          />
          {t.exercises.map((e, i) => (
            <details className="review-problem" key={e.id}>
              <summary>
                {i + 1}. {e.name} · {e.sets} 组 · {e.reps} · {e.load}
              </summary>
              {(
                [
                  ["name", "动作名称"],
                  ["purpose", "动作目的"],
                  ["method", "动作方法"],
                  ["sets", "组数"],
                  ["reps", "次数或时长"],
                  ["load", "负荷"],
                  ["rest", "组间休息"],
                  ["tempo", "节奏"],
                  ["cautions", "动作注意事项"],
                  ["alternative", "替代动作"],
                  ["video", "示范链接"],
                ] as const
              ).map(([key, label]) => (
                <TextArea
                  key={key}
                  label={`${label} · 动作${i + 1}`}
                  value={e[key]}
                  onChange={(v) =>
                    set({
                      ...t,
                      exercises: t.exercises.map((x, j) =>
                        j === i ? { ...x, [key]: v } : x,
                      ),
                    })
                  }
                />
              ))}
            </details>
          ))}
          {!saving && (
            <p>
              将创建独立草稿。请到“教练方案”核对个人问题关联、负荷、日期和复查，再发布到日历。
            </p>
          )}
        </>
      ) : (
        <p>正在读取模板…</p>
      )}
    </Editor>
  );
}
type Student = {
  id: string;
  name: string;
  assessmentNeeded: boolean;
  hold: boolean;
  reviewDue: boolean;
  adjustmentsNeeded: number;
  todaySessions: number;
  overdue: number;
  completed: number;
  updated_at: string;
};
export function CoachScreen({
  cloud,
  go,
}: {
  cloud?: CloudConnection;
  go?: (view: string) => void;
}) {
  const [rows, set] = useState<Student[]>([]),
    [filter, setFilter] = useState("全部"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    try {
      const r = await request<{ students: Student[] }>("/api/coach-dashboard");
      set(r.students);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (cloud) void load();
  }, [cloud?.user.id]);
  const shown = rows.filter(
    (r) =>
      filter === "全部" ||
      (filter === "待评估" && (r.assessmentNeeded || r.hold)) ||
      (filter === "待复查" && r.reviewDue) ||
      (filter === "待调整" && r.adjustmentsNeeded > 0),
  );
  return (
    <Section
      title="学员待办"
      action={
        cloud && (
          <div className="row-actions">
            {cloud.space.role === "coach" && (
              <Button
                secondary
                onClick={() => {
                  const own = cloud.spaces.find((x) => x.role === "owner");
                  if (own) {
                    go?.("我的总览");
                    cloud.select(own.id);
                  }
                }}
              >
                我的空间
              </Button>
            )}
            <Button secondary disabled={busy} onClick={() => void load()}>
              {busy ? "更新中…" : "刷新待办"}
            </Button>
          </div>
        )
      }
    >
      {!cloud ? (
        <p>登录云端账号后可使用教练工作台。</p>
      ) : (
        <>
          <Select
            label="待办筛选"
            value={filter}
            options={["全部", "待评估", "待复查", "待调整"]}
            onChange={setFilter}
          />
          {error && <p className="error">{error}</p>}
          <p className="muted">已授权学员 {rows.length} 人</p>
          {shown.map((r) => (
            <article className="problem" key={r.id}>
              <h3>{r.name}</h3>
              <p>
                {[
                  r.assessmentNeeded ? "待评估" : "",
                  r.hold ? "训练暂停" : "",
                  r.reviewDue ? "复查已到期" : "",
                  r.adjustmentsNeeded
                    ? `待调整 ${r.adjustmentsNeeded} 个方案`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ") || "按计划执行"}
              </p>
              <p>
                今日待练 {r.todaySessions} · 逾期未完成 {r.overdue} · 累计完成{" "}
                {r.completed}
              </p>
              <div className="backup-actions">
                {[
                  ["打开评估", "assessment"],
                  ["打开复查", "reviews"],
                  ["打开日历", "calendar"],
                ].map(([label, page]) => (
                  <Button
                    key={page}
                    secondary
                    onClick={() => {
                      location.hash = "#" + page;
                      cloud.select(r.id);
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </article>
          ))}
          {!shown.length && (
            <Empty
              title={rows.length ? "当前筛选下暂无待办" : "暂无授权学员"}
              description="学员在“设置 → 教练协作”邀请并确认授权后，会出现在这里。"
            />
          )}
        </>
      )}
    </Section>
  );
}
