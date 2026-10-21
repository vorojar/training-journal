import { RecordMenu } from "./record-menu";
import { useState } from "react";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Activity,
  AlertTriangle,
  Pencil,
} from "lucide-react";
import {
  assessmentFields,
  readiness,
  reviewProgress,
  today,
  shiftDate,
  type System,
  type Session,
} from "./domain";
import { Badge, Button, Empty, LinkButton, Section, weekdays } from "./ui";
import type { Edit, CalendarLocation } from "./routes";
export type ScreenProps = {
  s: System;
  edit: (v: Edit) => void;
  go: (v: string) => void;
  owner?: boolean;
};
import { ReminderTasks } from "../cloud/reminders";
import { StrengthProgress } from "./sets";
export function Overview({ s, edit, go, owner = true }: ScreenProps) {
  const day = today(s.profile.timeZone),
    sessions = s.sessions.filter(
      (x) => x.date === day && x.status !== "已取消",
    );
  const published = s.plans.some((p) => p.status === "已发布");
  const next =
    s.reviews[0]?.nextDate ||
    s.plans.find((p) => p.status === "已发布")?.nextReview;
  const entries = [...s.daily].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <>
      <Section title="今天的训练" action={<time>{day}</time>}>
        {sessions.length ? (
          <div className="session-list">
            {sessions.map((v) => (
              <SessionRow
                key={v.id}
                v={v}
                onClick={() => edit({ type: "session", id: v.id })}
              />
            ))}
          </div>
        ) : (
          <div className="compact-empty">
            <p>
              {published
                ? "今天没有训练安排"
                : s.assessment.confirmed
                  ? "评估已确认，等待制定方案"
                  : "先完成评估，再开始训练"}
            </p>
            <Button
              onClick={() =>
                go(
                  published
                    ? "训练日历"
                    : s.assessment.confirmed
                      ? "教练方案"
                      : "训练前评估",
                )
              }
            >
              {published
                ? "查看日历"
                : s.assessment.confirmed
                  ? "制定方案"
                  : "完成训练前评估"}
            </Button>
          </div>
        )}
      </Section>
      <ReminderTasks s={s} go={go} />
      {next && next > day && (
        <Section
          title="下次复查"
          action={
            <LinkButton onClick={() => go("复查与调整")}>查看</LinkButton>
          }
        >
          <strong>{next}</strong>
        </Section>
      )}
      {!!entries.length && (
        <Section
          title="身体趋势"
          action={
            <LinkButton onClick={() => go("每日记录")}>全部趋势</LinkButton>
          }
        >
          <dl className="overview-metrics">
            {(
              [
                ["weight", "体重", "kg"],
                ["bodyFat", "体脂", "%"],
                ["waist", "腰围", "cm"],
              ] as const
            ).map(([key, label, unit]) => {
              const rows = entries.filter((x) => x[key] !== null),
                first = rows[0],
                last = rows.at(-1);
              return last ? (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>
                    <strong>
                      {last[key]} {unit}
                    </strong>
                    {first && rows.length > 1 && (
                      <small>
                        较首条 {(last[key]! - first[key]!).toFixed(1)} {unit}
                      </small>
                    )}
                  </dd>
                </div>
              ) : null;
            })}
          </dl>
        </Section>
      )}
      {owner && (
        <Button
          secondary
          onClick={() =>
            edit({ type: "daily", id: s.daily.find((x) => x.date === day)?.id })
          }
        >
          记录今天的身体状态
        </Button>
      )}
    </>
  );
}
function SessionRow({ v, onClick }: { v: Session; onClick: () => void }) {
  return (
    <button className="session-row" onClick={onClick}>
      <span className="session-time">
        {v.time}
        <small>{v.minutes} 分钟</small>
      </span>
      <span className="session-copy">
        <strong>{v.title}</strong>
        <small>
          {v.exercises.length} 个动作 · 方案 v{v.planVersion}
        </small>
      </span>
      <Badge
        tone={
          v.status === "已完成"
            ? "green"
            : v.status === "已跳过"
              ? "neutral"
              : "blue"
        }
      >
        {v.status}
      </Badge>
      <ChevronRight size={17} />
    </button>
  );
}
const metrics = [
  ["weight", "体重", "kg"],
  ["bodyFat", "体脂率", "%"],
  ["sleep", "睡眠", "小时"],
  ["waist", "腰围", "cm"],
  ["heartRate", "静息心率", "次/分"],
  ["steps", "步数", "步"],
] as const;
export function Metrics({
  s,
  edit,
  showAdd = true,
}: {
  s: System;
  edit: ScreenProps["edit"];
  showAdd?: boolean;
}) {
  const [key, setKey] = useState<(typeof metrics)[number][0]>("weight"),
    [period, setPeriod] = useState("30");
  const metric = metrics.find((x) => x[0] === key)!;
  const entries = s.daily
    .filter(
      (x) =>
        x[key] !== null &&
        (period === "all" || x.date >= shiftDate(today(), -Number(period))) &&
        x.date <= today(),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const values = entries.map((x) => x[key] as number),
    min = Math.min(...values),
    max = Math.max(...values),
    padding =
      max === min ? Math.max(Math.abs(max) * 0.02, 1) : (max - min) * 0.1,
    axisMin = min - padding,
    axisMax = max + padding,
    range = axisMax - axisMin,
    start = entries[0]?.date,
    end = entries.at(-1)?.date;
  const point = (i: number) => {
    const x =
      entries.length === 1
        ? 350
        : 50 +
          ((Date.parse(entries[i]!.date) - Date.parse(start!)) /
            Math.max(86400000, Date.parse(end!) - Date.parse(start!))) *
            590;
    return [x, 145 - ((values[i]! - axisMin) / range) * 100];
  };
  return (
    <Section
      title="关键指标"
      action={
        showAdd ? (
          <LinkButton onClick={() => edit({ type: "daily" })}>
            添加记录
          </LinkButton>
        ) : undefined
      }
    >
      <div className="chart-controls">
        <select
          aria-label="身体指标"
          value={key}
          onChange={(e) => setKey(e.target.value as typeof key)}
        >
          {metrics.map(([k, label, unit]) => (
            <option key={k} value={k}>
              {label}（{unit}）
            </option>
          ))}
        </select>
        <select
          aria-label="曲线时间范围"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="30">近30天</option>
          <option value="90">近90天</option>
          <option value="all">全部记录</option>
        </select>
      </div>
      {entries.length ? (
        <>
          <div className="metric-value">
            <strong>{values.at(-1)}</strong>
            <span>{metric[2]}</span>
            <small>
              {end} 最近记录
              {values.length > 1
                ? ` · 较本期首条 ${values.at(-1)! - values[0]! >= 0 ? "+" : ""}${(values.at(-1)! - values[0]!).toFixed(1)} ${metric[2]}`
                : ""}
            </small>
          </div>
          <svg
            className="chart"
            viewBox="0 0 680 200"
            role="img"
            aria-label={`${metric[1]}曲线，${entries.length}次记录，从${min}到${max}${metric[2]}`}
          >
            <g className="chart-grid">
              {[45, 95, 145].map((y) => (
                <line key={y} x1="45" y1={y} x2="650" y2={y} />
              ))}
            </g>
            <text x="0" y="45">
              {axisMax.toFixed(range < 1 ? 2 : 1)}
            </text>
            <text x="0" y="148">
              {axisMin.toFixed(range < 1 ? 2 : 1)}
            </text>
            {entries.length > 1 && (
              <polyline
                fill="none"
                stroke="#2463eb"
                strokeWidth="2.5"
                points={entries.map((_, i) => point(i).join(",")).join(" ")}
              />
            )}
            {entries.map((r, i) => {
              const [cx, cy] = point(i);
              return (
                <circle key={r.id} cx={cx} cy={cy} r="4" fill="#2463eb">
                  <title>
                    {r.date}：{r[key]} {metric[2]}
                  </title>
                </circle>
              );
            })}
            <text x="45" y="185">
              {start?.slice(5)}
            </text>
            <text x="600" y="185">
              {end?.slice(5)}
            </text>
          </svg>
        </>
      ) : (
        <div className="chart-empty">
          <Activity size={30} />
          <strong>添加每日记录后显示趋势</strong>
          <p>{metric[1]}暂无记录。曲线只使用实际填写的数据。</p>
        </div>
      )}
    </Section>
  );
}
export function AssessmentScreen({ s, edit, owner = true }: ScreenProps) {
  const r = readiness(s);
  return (
    <>
      <Section
        title="训练前完整评估"
        action={
          <Button onClick={() => edit({ type: "assessment" })}>
            <Pencil size={16} />
            填写／更新评估
          </Button>
        }
      >
        <div className="assessment-progress">
          <Badge tone={r.confirmed ? "green" : "amber"}>
            {r.confirmed ? "评估已确认" : "评估待完成"}
          </Badge>
          <span>
            基本信息 {r.fields}/{r.total} 项
          </span>
          <span>
            {s.assessment.assessor
              ? `评估人：${s.assessment.assessor}`
              : "尚未填写评估人"}
          </span>
          <span>{s.assessment.date}</span>
        </div>
        <div className="assessment-list">
          {assessmentFields.map(([k, label]) => (
            <details key={k}>
              <summary>
                <span>{label}</span>
                <Badge tone={s.assessment.fields[k] ? "blue" : "neutral"}>
                  {s.assessment.fields[k] ? "已填写" : "待补充"}
                </Badge>
              </summary>
              <p className="preserve">
                {s.assessment.fields[k] || "尚未填写，由用户与教练共同补充。"}
              </p>
            </details>
          ))}
        </div>
      </Section>
      <Section
        title="问题分级与改善目标"
        action={
          <Button onClick={() => edit({ type: "problem" })}>
            <Plus size={17} />
            添加问题
          </Button>
        }
      >
        {s.problems.length ? (
          <div className="problems">
            {s.problems.map((p) => (
              <article className="problem" key={p.id}>
                <div className="problem-heading">
                  <div>
                    <h3>{p.name}</h3>
                    <span className="muted">{p.priority}</span>
                  </div>
                  <Badge
                    tone={
                      p.severity === "待评估"
                        ? "amber"
                        : p.severity === "重度"
                          ? "red"
                          : "blue"
                    }
                  >
                    {p.severity}
                  </Badge>
                  <RecordMenu
                    id={p.id}
                    kind="problem"
                    name={p.name}
                    edit={edit}
                    owner={owner}
                    correction={{ type: "problem", id: p.id }}
                  />
                </div>
                <dl>
                  <div>
                    <dt>分级依据</dt>
                    <dd>{p.basis || "待评估人补充"}</dd>
                  </div>
                  <div>
                    <dt>基线测量</dt>
                    <dd>{p.measurement || "尚未测量"}</dd>
                  </div>
                  <div>
                    <dt>改善目标</dt>
                    <dd>{p.goal || "待教练填写达标标准"}</dd>
                  </div>
                  <div>
                    <dt>如何复查</dt>
                    <dd>{p.retest || "待填写方法与频率"}</dd>
                  </div>
                  {p.cautions && (
                    <div>
                      <dt>特别注意</dt>
                      <dd>{p.cautions}</dd>
                    </div>
                  )}
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="还没有建立问题清单"
            description="例如头颈姿态、动作控制、平衡或力量基础，由评估结果决定。"
          />
        )}
      </Section>
      <Section
        title="训练注意事项"
        action={
          <LinkButton onClick={() => edit({ type: "assessment" })}>
            补充注意事项
          </LinkButton>
        }
      >
        <div className="caution-grid">
          <div>
            <h3>个人注意事项</h3>
            <p className="preserve">
              {s.assessment.cautions ||
                "请填写与个人健康情况、体态及训练基础有关的限制和注意事项。"}
            </p>
          </div>
          <div>
            <h3>暂停训练与求助条件</h3>
            <p className="preserve">
              {s.assessment.stopRules || "请明确停止条件、处理方式和联系人。"}
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}
export function PlanScreen({ s, edit, go, owner = true }: ScreenProps) {
  return (
    <>
      <div className="page-command">
        <Button onClick={() => edit({ type: "plan" })}>
          <Plus size={17} />
          制定新方案
        </Button>
      </div>
      {!s.assessment.confirmed && (
        <div className="callout inline">
          <AlertTriangle size={20} />
          <span>
            训练前评估尚未确认。可以先编写草稿，完成评估与问题分级后再发布。
          </span>
          <LinkButton onClick={() => go("训练前评估")}>去完成评估</LinkButton>
        </div>
      )}
      {s.plans.length ? (
        s.plans.map((p) => (
          <Section
            key={p.id}
            title={p.name}
            description={`${p.start} — ${p.end} · 每周 ${p.weekdays.map((n) => "周" + weekdays[n]).join("、")} · ${p.minutes}分钟`}
            action={
              <div className="row-actions">
                <Badge tone={p.status === "已发布" ? "green" : "amber"}>
                  {p.status} · v{p.version}
                </Badge>
                <Button
                  secondary
                  onClick={() =>
                    edit({
                      type: "plan",
                      id: p.id,
                      adjust: p.status === "已发布",
                    })
                  }
                >
                  {p.status === "已发布" ? "调整后续方案" : "编辑草稿"}
                </Button>
                <RecordMenu
                  id={p.id}
                  kind="plan"
                  name={p.name}
                  edit={edit}
                  owner={owner}
                  template
                />
              </div>
            }
          >
            <div className="plan-meta">
              <span>教练：{p.coach || "待填写"}</span>
              <span>复查：{p.nextReview || "待约定"}</span>
              <span>训练时间：{p.time}</span>
            </div>
            <dl className="plan-objectives">
              <div>
                <dt>周期目标</dt>
                <dd>{p.goal || "待制定"}</dd>
              </div>
              <div>
                <dt>进阶与减量</dt>
                <dd>{p.progression || "待填写"}</dd>
              </div>
              <div>
                <dt>个人注意</dt>
                <dd>{p.cautions || "待填写"}</dd>
              </div>
            </dl>
            {p.exercises.length ? (
              <div className="exercise-list">
                {p.exercises.map((e, i) => (
                  <details key={e.id}>
                    <summary>
                      <span className="order">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>
                        <strong>{e.name}</strong>
                        <small>
                          {e.sets || "待定"} 组 · {e.reps || "次数待定"} ·{" "}
                          {e.load || "负荷待定"} · 休息 {e.rest || "待定"}
                        </small>
                      </span>
                      <ChevronRight size={17} />
                    </summary>
                    <div className="exercise-body">
                      <p>
                        <b>训练目的：</b>
                        {e.purpose || "待补充"}
                        {e.problemId &&
                          ` · ${s.problems.find((x) => x.id === e.problemId)?.name || ""}`}
                      </p>
                      <p className="preserve">
                        <b>方法与呼吸：</b>
                        {e.method || "待教练填写"}
                      </p>
                      <p>
                        <b>节奏：</b>
                        {e.tempo || "待补充"}
                      </p>
                      <p>
                        <b>注意事项：</b>
                        {e.cautions || "参照个人训练边界"}
                      </p>
                      <p>
                        <b>替代动作：</b>
                        {e.alternative || "待教练补充"}
                      </p>
                      {e.video && (
                        <a href={e.video} target="_blank" rel="noreferrer">
                          观看动作示范
                        </a>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <Empty
                title="尚未添加训练动作"
                description="点击编辑草稿，由教练逐项填写。"
              />
            )}
            {p.status === "已发布" && (
              <LinkButton onClick={() => go("训练日历")}>
                查看这个周期的日历与完成情况
              </LinkButton>
            )}
          </Section>
        ))
      ) : (
        <Section title="教练制定的个人训练方案">
          <Empty
            title="尚未制定训练方案"
            description="不会自动套用通用处方。由教练根据你的评估，填写每个动作的方法与剂量。"
          />
        </Section>
      )}
    </>
  );
}
export function CalendarScreen({
  s,
  edit,
  go,
  calendar,
  setCalendar,
  owner = true,
}: ScreenProps & {
  calendar: CalendarLocation;
  setCalendar: (value: CalendarLocation) => void;
}) {
  const { month, date: selected } = calendar;
  const [showCancelled, setShow] = useState(false);
  const setMonth = (month: string) => setCalendar({ ...calendar, month });
  const setSelected = (date: string) => setCalendar({ ...calendar, date });
  const start = month + "-01",
    offset = (new Date(start + "T00:00:00Z").getUTCDay() + 6) % 7;
  const visible = s.sessions.filter(
    (x) => showCancelled || x.status !== "已取消",
  );
  const monthItems = visible.filter((x) => x.date.startsWith(month));
  const selectedItems = visible.filter((x) => x.date === selected);
  const navigate = (n: number) => {
    const d = new Date(start + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };
  return (
    <>
      <Section
        title="训练周期日历"
        description="点击日期查看课次，点击课次填写完成情况。"
        action={<Button onClick={() => go("教练方案")}>管理训练方案</Button>}
      >
        <div className="calendar-toolbar">
          <div>
            <button
              className="icon"
              aria-label="上个月"
              onClick={() => navigate(-1)}
            >
              <ChevronLeft size={20} />
            </button>
            <strong>{month.replace("-", "年")}月</strong>
            <button
              className="icon"
              aria-label="下个月"
              onClick={() => navigate(1)}
            >
              <ChevronRight size={20} />
            </button>
            <Button
              secondary
              onClick={() => {
                setCalendar({ month: today().slice(0, 7), date: today() });
              }}
            >
              今天
            </Button>
          </div>
          <span>
            {monthItems.filter((x) => x.status === "已完成").length} 已完成 /{" "}
            {monthItems.filter((x) => x.status !== "已取消").length} 次排课
          </span>
        </div>
        <div className="calendar-scroll">
          <div className="month-grid">
            {[1, 2, 3, 4, 5, 6, 0].map((n) => (
              <div className="day-label" key={n}>
                周{weekdays[n]}
              </div>
            ))}
            {Array.from({ length: 42 }, (_, i) => {
              const d = shiftDate(start, i - offset),
                items = visible.filter((x) => x.date === d);
              return (
                <button
                  key={d}
                  aria-label={`${d}${items.length ? `，${items.length}次训练` : ""}`}
                  onClick={() => setSelected(d)}
                  className={
                    "month-day " +
                    (!d.startsWith(month) ? "outside " : "") +
                    (selected === d ? "selected " : "") +
                    (d === today() ? "is-today" : "")
                  }
                >
                  <time>{Number(d.slice(-2))}</time>
                  {items.slice(0, 2).map((x) => (
                    <span
                      key={x.id}
                      className={
                        "calendar-event " +
                        (x.status === "已完成"
                          ? "done"
                          : x.status === "已取消"
                            ? "cancelled"
                            : x.status === "已暂停"
                              ? "paused"
                              : x.status === "已跳过"
                                ? "skipped"
                                : "")
                      }
                    >
                      {x.time} {x.title}
                      <small>{x.status}</small>
                    </span>
                  ))}
                  {items.length > 2 && (
                    <small>另有 {items.length - 2} 次</small>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="calendar-legend">
          <span>
            <i />
            待完成
          </span>
          <span>
            <i className="green-dot" />
            已完成
          </span>
          <span>
            <i className="gray-dot" />
            跳过／取消
          </span>
          <label>
            <input
              type="checkbox"
              checked={showCancelled}
              onChange={(e) => setShow(e.target.checked)}
            />
            显示调整前取消的课次
          </label>
        </div>
      </Section>
      <Section title={`${selected} 的训练`}>
        {selectedItems.length ? (
          <div className="session-list">
            {selectedItems.map((v) =>
              v.status === "已取消" ? (
                <div className="cancelled-session" key={v.id}>
                  {v.title} v{v.planVersion} · 已取消
                  {owner && (
                    <RecordMenu
                      id={v.id}
                      kind="session"
                      name={v.title}
                      edit={edit}
                    />
                  )}
                </div>
              ) : (
                <div className="session-with-actions" key={v.id}>
                  <SessionRow
                    v={v}
                    onClick={() => edit({ type: "session", id: v.id })}
                  />
                  {owner && (
                    <RecordMenu
                      id={v.id}
                      kind="session"
                      name={v.title}
                      edit={edit}
                    />
                  )}
                </div>
              ),
            )}
          </div>
        ) : (
          <Empty
            title="当天没有安排训练"
            description="训练安排由已发布方案生成，周期调整后这里会同步更新。"
          />
        )}
      </Section>
    </>
  );
}
export function DailyScreen({ s, edit, owner = true }: ScreenProps) {
  return (
    <>
      <div className="page-command">
        <Button
          disabled={!owner}
          onClick={() =>
            edit({
              type: "daily",
              id: s.daily.find((x) => x.date === today(s.profile.timeZone))?.id,
            })
          }
        >
          <Plus size={17} />
          记录今天
        </Button>
      </div>
      {s.daily.some((r) =>
        [r.weight, r.bodyFat, r.waist, r.sleep, r.heartRate, r.steps].some(
          (v) => v !== null,
        ),
      ) && <Metrics s={s} edit={edit} showAdd={false} />}
      {s.sessions.some(
        (r) => r.status === "已完成" && r.setLogs?.some((x) => x.done),
      ) && (
        <details className="section disclosure">
          <summary>力量进步</summary>
          <StrengthProgress s={s} />
        </details>
      )}
      <Section title="每日记录">
        {s.daily.length ? (
          <div className="daily-list">
            {[...s.daily]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((r) => (
                <article className="daily-card" key={r.id}>
                  <header>
                    <strong>{r.date}</strong>
                    {owner && (
                      <RecordMenu
                        kind="daily"
                        id={r.id}
                        name={r.date + "每日记录"}
                        edit={edit}
                        correction={{ type: "daily", id: r.id }}
                      />
                    )}
                  </header>
                  <dl>
                    {(
                      [
                        ["weight", "体重", "kg"],
                        ["bodyFat", "体脂", "%"],
                        ["waist", "腰围", "cm"],
                        ["sleep", "睡眠", "h"],
                        ["heartRate", "静息心率", "次/分"],
                        ["steps", "步数", "步"],
                        ["energy", "精力", "/10"],
                      ] as const
                    ).map(([key, label, unit]) =>
                      r[key] !== null ? (
                        <div key={key}>
                          <dt>{label}</dt>
                          <dd>
                            {r[key]} {unit}
                          </dd>
                        </div>
                      ) : null,
                    )}
                  </dl>
                  {r.notes && <p>{r.notes}</p>}
                </article>
              ))}
          </div>
        ) : (
          <p className="muted">还没有每日记录，未测指标可留空。</p>
        )}
      </Section>
    </>
  );
}
export function ReviewScreen({ s, edit, go, owner = true }: ScreenProps) {
  const plan = s.plans.find((x) => x.status === "已发布"),
    next = s.reviews[0]?.nextDate || plan?.nextReview;
  return (
    <>
      <div className="page-command">
        <p>{next ? `下次复查：${next}` : "尚未约定复查日期"}</p>
        <Button onClick={() => edit({ type: "review" })}>
          <Plus size={17} />
          新增复查
        </Button>
      </div>
      <Section title="复查记录与后续处理">
        {s.reviews.length ? (
          s.reviews.map((r) => {
            const progress = reviewProgress(s, r);
            const adjusted =
              progress.plans.length > 0 && progress.remaining.length === 0;
            return (
              <article className="review-entry" key={r.id}>
                <header>
                  <div>
                    <h3>
                      {r.date} · {r.coach}
                    </h3>
                    <p>下次：{r.nextDate || "尚未约定"}</p>
                  </div>
                  <Badge
                    tone={
                      r.action === "调整后续计划" && !adjusted
                        ? "amber"
                        : "blue"
                    }
                  >
                    {adjusted ? "已调整排程" : r.action}
                  </Badge>
                  <RecordMenu
                    kind="review"
                    id={r.id}
                    name={r.date + "复查"}
                    edit={edit}
                    owner={owner}
                    correction={{ type: "review", id: r.id }}
                  />
                </header>
                <p className="preserve">{r.conclusion}</p>
                {r.changes.map((c) => (
                  <div className="review-change" key={c.problemId}>
                    <strong>{c.name}</strong>
                    <span>
                      {c.before} → {c.after}
                    </span>
                    <p>{c.measurement}</p>
                    <small>方法：{c.method}</small>
                  </div>
                ))}
                {r.action === "调整后续计划" &&
                  !adjusted &&
                  (progress.plans.length ? (
                    <div className="review-plan-list">
                      {progress.plans.map((p) => {
                        const done = !progress.remaining.some(
                          (x) => x.id === p.id,
                        );
                        return (
                          <div key={p.id}>
                            <strong>{p.name}</strong>
                            {done ? (
                              <Badge tone="green">已调整</Badge>
                            ) : (
                              <Button
                                onClick={() =>
                                  edit({
                                    type: "plan",
                                    id: p.id,
                                    adjust: true,
                                    reviewId: r.id,
                                  })
                                }
                              >
                                调整此方案与日历
                              </Button>
                            )}
                          </div>
                        );
                      })}
                      <p className="muted">
                        待处理 {progress.remaining.length}/
                        {progress.plans.length}{" "}
                        份方案；全部处理后才完成本次复查排期。
                      </p>
                    </div>
                  ) : (
                    <LinkButton onClick={() => go("教练方案")}>
                      先制定训练方案
                    </LinkButton>
                  ))}
              </article>
            );
          })
        ) : (
          <Empty
            title="还没有复查记录"
            description="复查需要记录同条件测量、程度变化、训练反应、下一步处理与下次日期。"
          />
        )}
      </Section>
      <Section
        title="方案调整与日历变更"
        description="只更新生效日起尚未完成的训练；已完成的内容和旧版本记录保留。"
        action={
          plan ? (
            <Button
              secondary
              onClick={() => edit({ type: "plan", id: plan.id, adjust: true })}
            >
              主动调整后续计划
            </Button>
          ) : undefined
        }
      >
        {s.adjustments.length ? (
          s.adjustments.map((a) => (
            <article className="adjustment-entry" key={a.id}>
              <div>
                <Badge tone="blue">{a.effective} 生效</Badge>
                <span>
                  v{a.fromVersion} → v{a.toVersion}
                </span>
              </div>
              <h3>{a.reason}</h3>
              <p>{a.summary}</p>
              <p>
                取消 {a.cancelled} 次待完成课次，重新安排 {a.scheduled} 次训练。
              </p>
            </article>
          ))
        ) : (
          <Empty
            title="暂无调整记录"
            description="调整需要填写原因、生效日期和新方案，确认后才会重排未来日历。"
          />
        )}
      </Section>
    </>
  );
}
