import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  FileText,
  Plus,
  ChevronLeft,
  ChevronRight,
  Activity,
  AlertTriangle,
  Watch,
  Smartphone,
  Pencil,
  CheckCircle2,
} from "lucide-react";
import {
  assessmentFields,
  readiness,
  today,
  shiftDate,
  type System,
  type Session,
  type Plan,
} from "./domain";
import { Badge, Button, Empty, LinkButton, Section, weekdays } from "./ui";
export type Edit =
  | { type: "profile" }
  | { type: "assessment" }
  | { type: "problem"; id?: string }
  | { type: "plan"; id?: string; adjust?: boolean; reviewId?: string }
  | { type: "session"; id: string }
  | { type: "daily"; id?: string }
  | { type: "review" };
export type ScreenProps = {
  s: System;
  edit: (v: Edit) => void;
  go: (v: string) => void;
};
export function Flow({ s, go }: Pick<ScreenProps, "s" | "go">) {
  const steps = [
    ["完整评估", "全面了解身体状况", "训练前评估"],
    ["教练制定", "基于评估制定个人方案", "教练方案"],
    ["日历执行", "按计划训练与记录", "训练日历"],
    ["复查调整", "复评问题，调整后续计划", "复查与调整"],
  ];
  const stage = !s.assessment.confirmed
    ? 0
    : !s.plans.some((p) => p.status === "已发布")
      ? 1
      : !s.reviews.length
        ? 2
        : 3;
  return (
    <div className="flow">
      {steps.map(([title, desc, target], i) => (
        <button
          key={title}
          onClick={() => go(target!)}
          className={i === stage ? "current" : ""}
        >
          <span className="step-no">
            {i < stage ? (
              <CheckCircle2 size={23} />
            ) : (
              String(i + 1).padStart(2, "0")
            )}
          </span>
          <span>
            <strong>{title}</strong>
            <small>{desc}</small>
          </span>
          {i < 3 && <ChevronRight size={20} />}
        </button>
      ))}
    </div>
  );
}
export function Overview({ s, edit, go }: ScreenProps) {
  const ready = readiness(s),
    sessions = s.sessions.filter(
      (x) => x.date === today() && x.status !== "已取消",
    );
  const last = s.adjustments[0];
  return (
    <>
      <Flow s={s} go={go} />
      <div className="dashboard">
        <div className="primary-column">
          <Section title="今天的安排" action={<time>{today()}</time>}>
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
              <Empty
                title="尚未安排训练"
                description={
                  s.plans.some((p) => p.status === "已发布")
                    ? "今天没有排课。可以查看日历，继续记录身体和恢复情况。"
                    : "先完成评估并获取教练方案，再按照日历执行。"
                }
                action={
                  <Button
                    onClick={() =>
                      go(s.assessment.confirmed ? "教练方案" : "训练前评估")
                    }
                  >
                    {s.assessment.confirmed
                      ? "制定第一份方案"
                      : "完善训练前评估"}
                    <ArrowRight size={17} />
                  </Button>
                }
              />
            )}
          </Section>
          <Week s={s} edit={edit} go={go} />
          <Metrics s={s} edit={edit} />
        </div>
        <div className="secondary-column">
          <Section title="训练准备">
            <div className="preparation">
              {[
                {
                  icon: FileText,
                  title: "完整评估",
                  desc: `已填写 ${ready.fields}/${ready.total} 项基本信息`,
                  status: ready.confirmed ? "已确认" : "待完成",
                  target: "训练前评估",
                },
                {
                  icon: AlertTriangle,
                  title: "问题分级",
                  desc: s.problems.length
                    ? `${s.problems.length} 个问题，${ready.graded} 个已有分级依据`
                    : "逐项明确程度、依据与改善目标",
                  status:
                    s.problems.length === 0
                      ? "待评估"
                      : ready.graded === s.problems.length
                        ? "已分级"
                        : "待补充",
                  target: "训练前评估",
                },
                {
                  icon: ClipboardCheck,
                  title: "教练方案",
                  desc: "教练填写动作方法与个人剂量",
                  status: s.plans.some((p) => p.status === "已发布")
                    ? "已发布"
                    : "待制定",
                  target: "教练方案",
                },
              ].map(({ icon: Icon, title, desc, status, target }) => (
                <button
                  className="ready-row"
                  key={title}
                  onClick={() => go(target)}
                >
                  <span className="ready-icon">
                    <Icon size={22} />
                  </span>
                  <span className="ready-copy">
                    <strong>{title}</strong>
                    <small>{desc}</small>
                  </span>
                  <Badge tone={status.startsWith("已") ? "blue" : "amber"}>
                    {status}
                  </Badge>
                </button>
              ))}
            </div>
            <LinkButton onClick={() => go("训练前评估")}>
              完善训练前评估
            </LinkButton>
          </Section>
          <Section title="下次复查">
            {(() => {
              const next =
                s.reviews[0]?.nextDate ||
                s.plans.find((p) => p.status === "已发布")?.nextReview;
              return next ? (
                <div className="next-review">
                  <strong>{next}</strong>
                  <p>
                    {next < today()
                      ? "复查日期已到，请联系教练完成复查。"
                      : "按相同方法复测问题、力量与身体指标。"}
                  </p>
                  <LinkButton onClick={() => go("复查与调整")}>
                    查看复查计划
                  </LinkButton>
                </div>
              ) : (
                <Empty
                  title="尚未约定复查日期"
                  description="发布方案时，由教练填写本周期的复查日期。"
                />
              );
            })()}
          </Section>
          <Section title="最近调整">
            {last ? (
              <div className="adjustment-mini">
                <Badge tone="blue">{last.effective} 生效</Badge>
                <p>{last.reason}</p>
                <small>
                  取消 {last.cancelled} 次待完成训练，重新安排 {last.scheduled}{" "}
                  次。
                </small>
                <LinkButton onClick={() => go("复查与调整")}>
                  查看调整记录
                </LinkButton>
              </div>
            ) : (
              <Empty
                title="暂无调整记录"
                description="复查后在这里查看方案版本与排程变化。"
                action={
                  <LinkButton onClick={() => go("复查与调整")}>
                    查看复查计划
                  </LinkButton>
                }
              />
            )}
          </Section>
        </div>
      </div>
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
function Week({ s, edit, go }: ScreenProps) {
  const offset = (new Date(today() + "T00:00:00Z").getUTCDay() + 6) % 7;
  const monday = shiftDate(today(), -offset);
  return (
    <Section
      title="本周训练"
      action={<LinkButton onClick={() => go("训练日历")}>完整日历</LinkButton>}
    >
      <div className="week-grid">
        {Array.from({ length: 7 }, (_, i) => {
          const date = shiftDate(monday, i),
            items = s.sessions.filter(
              (x) => x.date === date && x.status !== "已取消",
            );
          return (
            <button
              key={date}
              className={"week-day " + (date === today() ? "today" : "")}
              onClick={() =>
                items[0]
                  ? edit({ type: "session", id: items[0].id })
                  : go("训练日历")
              }
            >
              <span>周{weekdays[(i + 1) % 7]}</span>
              <small>{date.slice(5).replace("-", "/")}</small>
              {items.length ? (
                <>
                  <strong>
                    {items.filter((x) => x.status === "已完成").length}/
                    {items.length}
                  </strong>
                  <small>
                    {items.every((x) => x.status === "已完成")
                      ? "已完成"
                      : "有训练"}
                  </small>
                </>
              ) : (
                <>
                  <CalendarDays size={24} />
                  <small>未排课</small>
                </>
              )}
            </button>
          );
        })}
      </div>
    </Section>
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
export function Metrics({ s, edit }: { s: System; edit: ScreenProps["edit"] }) {
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
        <LinkButton onClick={() => edit({ type: "daily" })}>
          添加记录
        </LinkButton>
      }
    >
      <div className="chart-controls">
        <div className="segmented">
          {metrics.map(([k, label]) => (
            <button
              key={k}
              className={k === key ? "selected" : ""}
              onClick={() => setKey(k)}
            >
              {label}
            </button>
          ))}
        </div>
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
export function AssessmentScreen({ s, edit }: ScreenProps) {
  const r = readiness(s);
  return (
    <>
      <Section
        title="训练前完整评估"
        description="先了解这个人，再确定要解决的问题和训练边界。"
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
        description="可添加多个问题。程度必须配合评估依据，复查时使用相同方法比较。"
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
                  <button
                    className="icon"
                    aria-label={`编辑${p.name}`}
                    onClick={() => edit({ type: "problem", id: p.id })}
                  >
                    <Pencil size={17} />
                  </button>
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
            action={
              <Button secondary onClick={() => edit({ type: "problem" })}>
                添加第一个问题
              </Button>
            }
          />
        )}
      </Section>
      <Section
        title="这个人健身时，需要特别注意什么"
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
export function PlanScreen({ s, edit, go }: ScreenProps) {
  return (
    <>
      <div className="page-command">
        <p>教练根据评估结果填写，发布后自动生成日历课次。</p>
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
            action={
              <Button onClick={() => edit({ type: "plan" })}>
                制定第一份方案
              </Button>
            }
          />
        </Section>
      )}
    </>
  );
}
export function CalendarScreen({ s, edit, go }: ScreenProps) {
  const [month, setMonth] = useState(today().slice(0, 7)),
    [selected, setSelected] = useState(today()),
    [showCancelled, setShow] = useState(false);
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
                setMonth(today().slice(0, 7));
                setSelected(today());
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
                  {v.title} v{v.planVersion} · 已因调整取消
                </div>
              ) : (
                <SessionRow
                  key={v.id}
                  v={v}
                  onClick={() => edit({ type: "session", id: v.id })}
                />
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
export function DailyScreen({ s, edit }: ScreenProps) {
  return (
    <>
      <div className="page-command">
        <p>记录身体变化与恢复，给下次复查提供依据。</p>
        <Button
          onClick={() =>
            edit({
              type: "daily",
              id: s.daily.find((x) => x.date === today())?.id,
            })
          }
        >
          <Plus size={17} />
          记录今天
        </Button>
      </div>
      <Metrics s={s} edit={edit} />
      <Section
        title="每日记录"
        description="同一天保留一条完整记录，可随时补充未测指标。"
      >
        {s.daily.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "日期",
                    "体重 kg",
                    "体脂 %",
                    "腰围 cm",
                    "睡眠 h",
                    "静息心率",
                    "步数",
                    "操作",
                  ].map((k) => (
                    <th key={k}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...s.daily]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((r) => (
                    <tr key={r.id}>
                      <td>{r.date}</td>
                      {(
                        [
                          "weight",
                          "bodyFat",
                          "waist",
                          "sleep",
                          "heartRate",
                          "steps",
                        ] as const
                      ).map((k) => (
                        <td key={k}>{r[k] ?? "—"}</td>
                      ))}
                      <td>
                        <button
                          className="link"
                          onClick={() => edit({ type: "daily", id: r.id })}
                        >
                          编辑记录
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="从第一条真实记录开始"
            description="体重、体脂率、腰围、睡眠、静息心率、步数都可以记录，未测项目留空。"
          />
        )}
      </Section>
      <Section
        title="设备与数据来源"
        description="目前支持手动记录；设备接入是后续扩展，尚未连接或自动读取数据。"
      >
        <div className="device-grid">
          {[
            {
              icon: Smartphone,
              name: "米家／智能体脂秤",
              desc: "后续接入体重、体脂率等测量指标",
            },
            {
              icon: Watch,
              name: "Apple Watch／健康",
              desc: "后续接入步数、心率、睡眠等记录",
            },
          ].map(({ icon: Icon, name, desc }) => (
            <div className="device" key={name}>
              <Icon size={26} />
              <div>
                <strong>{name}</strong>
                <p>{desc}</p>
              </div>
              <Badge>未接入</Badge>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
export function ReviewScreen({ s, edit, go }: ScreenProps) {
  const plan = s.plans.find((x) => x.status === "已发布"),
    next = s.reviews[0]?.nextDate || plan?.nextReview;
  return (
    <>
      <div className="page-command">
        <p>
          {next ? `下次复查：${next}。` : "先在教练方案中约定复查日期。"}
          复查问题程度、训练反应与指标趋势，再决定如何调整。
        </p>
        <Button onClick={() => edit({ type: "review" })}>
          <Plus size={17} />
          新增复查
        </Button>
      </div>
      <Section title="复查记录与后续处理">
        {s.reviews.length ? (
          s.reviews.map((r) => {
            const adjusted = s.adjustments.some((a) => a.reviewId === r.id);
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
                  (plan ? (
                    <Button
                      onClick={() =>
                        edit({
                          type: "plan",
                          id: plan.id,
                          adjust: true,
                          reviewId: r.id,
                        })
                      }
                    >
                      根据本次复查调整方案与日历
                      <ArrowRight size={17} />
                    </Button>
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
            action={
              <Button secondary onClick={() => edit({ type: "review" })}>
                填写第一次复查
              </Button>
            }
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
