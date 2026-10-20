import { useContext, useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  assessmentFields,
  severity,
  today,
  shiftDate,
  uid,
  generateSessions,
  publishPlan,
  applyAdjustment,
  type System,
  type Problem,
  type Plan,
  type Session,
  type Daily,
  type Review,
} from "./domain";
import {
  Button,
  Field,
  Input,
  Modal,
  Select,
  TextArea,
  numberValue,
  weekdays,
} from "./ui";
import { EditorNavigationContext } from "./hash-navigation";
type Save = (s: System) => Promise<void>;
function Editor({
  title,
  children,
  onClose,
  onSave,
  label = "保存",
  extra,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSave: () => Promise<void>;
  label?: string;
  extra?: ReactNode;
}) {
  const guard = useContext(EditorNavigationContext);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onChangeCapture={() => guard.setDirty(true)}
        onClickCapture={(e) => {
          if ((e.target as Element).closest('button[type="button"]'))
            guard.setDirty(true);
        }}
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          guard.setSaving(true);
          setError("");
          void onSave()
            .then(() => {
              guard.setDirty(false);
              guard.setSaving(false);
              onClose();
            })
            .catch((e) => setError(e.message || "保存失败，填写内容仍保留"))
            .finally(() => {
              guard.setSaving(false);
              setBusy(false);
            });
        }}
      >
        <div className="form-content">
          {children}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="form-footer">
          {extra}
          <Button type="submit" disabled={busy}>
            {busy ? "正在保存…" : label}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
export function ProfileEditor({
  s,
  save,
  close,
}: {
  s: System;
  save: Save;
  close: () => void;
}) {
  const [p, set] = useState({ ...s.profile });
  const put = (key: keyof typeof p, value: string | number | null) =>
    set((x) => ({ ...x, [key]: value }));
  return (
    <Editor
      title="个人资料与目标"
      onClose={close}
      onSave={() => save({ ...s, profile: p })}
    >
      <div className="form-grid">
        <Input
          label="姓名／称呼"
          value={p.name}
          onChange={(v) => put("name", v)}
        />
        <Input
          label="出生年份"
          type="number"
          min={1900}
          max={2100}
          value={p.birthYear}
          onChange={(v) => put("birthYear", numberValue(v))}
        />
        <Input
          label="身高（cm）"
          type="number"
          min={50}
          max={250}
          value={p.height}
          onChange={(v) => put("height", numberValue(v))}
        />
        <Input
          label="起始体重（kg）"
          type="number"
          step="0.1"
          min={15}
          max={350}
          value={p.baselineWeight}
          onChange={(v) => put("baselineWeight", numberValue(v))}
        />
        <Input
          label="希望增重（kg）"
          type="number"
          step="0.1"
          min={0}
          max={100}
          value={p.gainKg}
          onChange={(v) => put("gainKg", numberValue(v))}
        />
        <Input
          label="负责教练"
          value={p.coach}
          onChange={(v) => put("coach", v)}
        />
        <TextArea
          label="训练目标与期望"
          value={p.goal}
          onChange={(v) => put("goal", v)}
        />
      </div>
    </Editor>
  );
}
export function AssessmentEditor({
  s,
  save,
  close,
}: {
  s: System;
  save: Save;
  close: () => void;
}) {
  const [a, set] = useState({
    ...structuredClone(s.assessment),
    date: s.assessment.date || today(),
  });
  return (
    <Editor
      title="完整训练前评估"
      onClose={close}
      onSave={async () => {
        if (
          a.confirmed &&
          (assessmentFields.some(([k]) => !a.fields[k]?.trim()) ||
            !a.assessor.trim() ||
            !a.date ||
            !a.cautions.trim() ||
            !a.stopRules.trim())
        )
          throw new Error(
            "确认完成前，请填写全部8项、评估人、日期、个人注意事项与停止条件。",
          );
        await save({ ...s, assessment: a });
      }}
    >
      <p className="muted">
        不适用的项目请明确写“无／不适用”。尚未核实的信息可先保存，核实后再确认完成。
      </p>
      <div className="form-grid">
        <Input
          label="评估日期"
          type="date"
          value={a.date}
          onChange={(v) => set({ ...a, date: v })}
        />
        <Input
          label="评估人"
          value={a.assessor}
          onChange={(v) => set({ ...a, assessor: v })}
        />
        {assessmentFields.map(([key, label, hint]) => (
          <TextArea
            key={key}
            label={label}
            hint={hint}
            value={a.fields[key] || ""}
            onChange={(v) =>
              set({ ...a, confirmed: false, fields: { ...a.fields, [key]: v } })
            }
          />
        ))}
        <TextArea
          label="此人的健身注意事项"
          hint="请写个人限制、需避免／替代的动作、强度与呼吸要求、陪同或监测要求"
          value={a.cautions}
          onChange={(v) => set({ ...a, cautions: v, confirmed: false })}
        />
        <TextArea
          label="暂停训练与求助条件"
          hint="由教练结合专业意见明确：什么情况停止、如何处理、联系谁"
          value={a.stopRules}
          onChange={(v) => set({ ...a, stopRules: v, confirmed: false })}
        />
      </div>
      <label className="checkline">
        <input
          type="checkbox"
          checked={a.confirmed}
          onChange={(e) => set({ ...a, confirmed: e.target.checked })}
        />
        评估人已核实上述信息，训练边界已明确
      </label>
    </Editor>
  );
}
export function ProblemEditor({
  s,
  problem,
  save,
  close,
}: {
  s: System;
  problem?: Problem;
  save: Save;
  close: () => void;
}) {
  const [p, set] = useState<Problem>(
    problem
      ? structuredClone(problem)
      : {
          id: uid(),
          name: "",
          severity: "待评估",
          priority: "本阶段重点",
          basis: "",
          measurement: "",
          goal: "",
          retest: "",
          cautions: "",
        },
  );
  const put = (k: keyof Problem, v: string) => set((x) => ({ ...x, [k]: v }));
  return (
    <Editor
      title={problem ? "编辑问题与分级" : "添加需要解决的问题"}
      onClose={close}
      onSave={async () => {
        if (p.severity !== "待评估" && !p.basis.trim())
          throw new Error("分级必须填写依据，不能只选择程度。");
        await save({
          ...s,
          problems: [...s.problems.filter((x) => x.id !== p.id), p],
          assessment: { ...s.assessment, confirmed: false },
        });
      }}
    >
      <div className="form-grid">
        <Input
          label="问题名称"
          required
          value={p.name}
          onChange={(v) => put("name", v)}
        />
        <Select
          label="程度"
          value={p.severity}
          options={severity}
          onChange={(v) => put("severity", v)}
        />
        <Select
          label="处理优先级"
          value={p.priority}
          options={["优先处理", "本阶段重点", "持续观察"]}
          onChange={(v) => put("priority", v)}
        />
        <TextArea
          label="分级依据"
          hint="评估方法、观察结果和判定标准；不能凭外观随意给出医学诊断"
          value={p.basis}
          onChange={(v) => put("basis", v)}
        />
        <TextArea
          label="基线测量与单位"
          hint="例如同一姿势下的测量角度、合格次数、疼痛评分；没有测量时如实填写"
          value={p.measurement}
          onChange={(v) => put("measurement", v)}
        />
        <TextArea
          label="改善目标与达标标准"
          value={p.goal}
          onChange={(v) => put("goal", v)}
        />
        <TextArea
          label="复查方法与频率"
          value={p.retest}
          onChange={(v) => put("retest", v)}
        />
        <TextArea
          label="针对该问题的注意事项"
          value={p.cautions}
          onChange={(v) => put("cautions", v)}
        />
      </div>
    </Editor>
  );
}
export function PlanEditor({
  s,
  plan,
  save,
  close,
  adjust = false,
  reviewId = "",
}: {
  s: System;
  plan?: Plan;
  save: Save;
  close: () => void;
  adjust?: boolean;
  reviewId?: string;
}) {
  const [p, set] = useState<Plan>(
    plan
      ? {
          ...structuredClone(plan),
          nextReview:
            s.reviews.find((r) => r.id === reviewId)?.nextDate ||
            plan.nextReview,
        }
      : {
          id: uid(),
          name: "基础训练方案",
          coach: s.profile.coach,
          version: 1,
          status: "草稿",
          start: today(),
          end: shiftDate(today(), 27),
          weekdays: [1, 3, 5],
          time: "18:00",
          minutes: 45,
          nextReview: shiftDate(today(), 13),
          goal: "",
          progression: "",
          cautions: s.assessment.cautions,
          exercises: [],
        },
  );
  const [mode, setMode] = useState<"draft" | "publish">("draft"),
    [effective, setEffective] = useState(today()),
    [reason, setReason] = useState(
      s.reviews.find((r) => r.id === reviewId)?.conclusion || "",
    );
  const put = (k: keyof Plan, v: unknown) => set((x) => ({ ...x, [k]: v }));
  const count =
    p.end >= p.start &&
    Date.parse(p.end) - Date.parse(p.start) <= 366 * 86400000
      ? generateSessions(p, adjust ? effective : p.start).length
      : 0;
  return (
    <Editor
      title={
        adjust
          ? "调整方案并重排后续训练"
          : plan
            ? "编辑教练方案"
            : "制定教练方案"
      }
      onClose={close}
      label={
        adjust
          ? "确认调整与重排"
          : mode === "publish"
            ? "发布方案与日历"
            : "保存方案草稿"
      }
      extra={
        !adjust && (
          <select
            aria-label="方案保存方式"
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="draft">先保存草稿</option>
            <option value="publish">发布并排入日历</option>
          </select>
        )
      }
      onSave={async () => {
        if (adjust)
          await save(applyAdjustment(s, p, effective, reason, reviewId));
        else if (mode === "publish") await save(publishPlan(s, p));
        else
          await save({
            ...s,
            plans: [
              { ...p, status: "草稿" },
              ...s.plans.filter((x) => x.id !== p.id),
            ],
          });
      }}
    >
      <p className="muted">
        由教练填写个人训练处方。发布后，日历按选择的日期自动生成课次；每次训练保留当时的动作内容。
      </p>
      <div className="form-grid">
        <Input
          label="方案名称"
          required
          value={p.name}
          onChange={(v) => put("name", v)}
        />
        <Input
          label="制定教练"
          value={p.coach}
          onChange={(v) => put("coach", v)}
        />
        <Input
          label="周期开始"
          type="date"
          required
          value={p.start}
          onChange={(v) => put("start", v)}
        />
        <Input
          label="周期结束"
          type="date"
          required
          value={p.end}
          onChange={(v) => put("end", v)}
        />
        <Input
          label="训练时间"
          type="time"
          required
          value={p.time}
          onChange={(v) => put("time", v)}
        />
        <Input
          label="每次时长（分钟）"
          type="number"
          required
          min={5}
          max={300}
          value={p.minutes}
          onChange={(v) => put("minutes", Number(v))}
        />
        <Input
          label="下次复查日期"
          type="date"
          value={p.nextReview}
          onChange={(v) => put("nextReview", v)}
        />
        <Field label="每周训练日" wide>
          <div className="weekday-picker">
            {[1, 2, 3, 4, 5, 6, 0].map((n) => (
              <label key={n} className={p.weekdays.includes(n) ? "chosen" : ""}>
                <input
                  type="checkbox"
                  aria-label={"周" + weekdays[n]}
                  checked={p.weekdays.includes(n)}
                  onChange={(e) =>
                    put(
                      "weekdays",
                      e.target.checked
                        ? [...p.weekdays, n].sort(
                            (a, b) => ((a + 6) % 7) - ((b + 6) % 7),
                          )
                        : p.weekdays.filter((x) => x !== n),
                    )
                  }
                />
                周{weekdays[n]}
              </label>
            ))}
          </div>
        </Field>
        <TextArea
          label="本周期目标"
          value={p.goal}
          onChange={(v) => put("goal", v)}
        />
        <TextArea
          label="加量、减量与进阶条件"
          hint="什么时候增加次数／负荷，何时减量，出现什么反应需复查"
          value={p.progression}
          onChange={(v) => put("progression", v)}
        />
        <TextArea
          label="本方案的个人注意事项"
          value={p.cautions}
          onChange={(v) => put("cautions", v)}
        />
      </div>
      <div className="subheading">
        <h3>详细训练方法 · {p.exercises.length} 个动作</h3>
        <Button
          secondary
          onClick={() =>
            put("exercises", [
              ...p.exercises,
              {
                id: uid(),
                name: "新动作",
                problemId: "",
                purpose: "",
                method: "",
                sets: "",
                reps: "",
                load: "",
                rest: "",
                tempo: "",
                cautions: "",
                alternative: "",
                video: "",
              },
            ])
          }
        >
          <Plus size={16} />
          添加动作
        </Button>
      </div>
      {p.exercises.map((e, i) => (
        <details className="exercise-editor" key={e.id} open>
          <summary>
            <span>
              {String(i + 1).padStart(2, "0")}　{e.name}
            </span>
          </summary>
          <div className="form-grid">
            {(
              [
                "name",
                "purpose",
                "sets",
                "reps",
                "load",
                "rest",
                "tempo",
                "alternative",
                "video",
              ] as const
            ).map((k, j) => (
              <Input
                key={k}
                label={
                  [
                    "动作名称",
                    "训练目的",
                    "组数",
                    "次数／时长（含单位）",
                    "负荷／阻力",
                    "组间休息（含单位）",
                    "动作节奏",
                    "替代／降阶动作",
                    "示范视频链接",
                  ][j]!
                }
                value={e[k]}
                onChange={(v) =>
                  put(
                    "exercises",
                    p.exercises.map((x) =>
                      x.id === e.id ? { ...x, [k]: v } : x,
                    ),
                  )
                }
              />
            ))}
            <Field label="对应问题">
              <select
                aria-label="对应问题"
                value={e.problemId}
                onChange={(ev) =>
                  put(
                    "exercises",
                    p.exercises.map((x) =>
                      x.id === e.id ? { ...x, problemId: ev.target.value } : x,
                    ),
                  )
                }
              >
                <option value="">一般训练目标</option>
                {s.problems.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </Field>
            <TextArea
              label="动作方法与呼吸要点"
              value={e.method}
              onChange={(v) =>
                put(
                  "exercises",
                  p.exercises.map((x) =>
                    x.id === e.id ? { ...x, method: v } : x,
                  ),
                )
              }
            />
            <TextArea
              label="动作注意事项与停止条件"
              value={e.cautions}
              onChange={(v) =>
                put(
                  "exercises",
                  p.exercises.map((x) =>
                    x.id === e.id ? { ...x, cautions: v } : x,
                  ),
                )
              }
            />
          </div>
          <div className="row-actions">
            <Button
              secondary
              onClick={() => {
                const list = [...p.exercises];
                if (i > 0) {
                  [list[i - 1], list[i]] = [list[i]!, list[i - 1]!];
                  put("exercises", list);
                }
              }}
              disabled={i === 0}
            >
              上移
            </Button>
            <Button
              secondary
              onClick={() =>
                put(
                  "exercises",
                  p.exercises.filter((x) => x.id !== e.id),
                )
              }
            >
              <Trash2 size={16} />
              移除此动作
            </Button>
          </div>
        </details>
      ))}
      {adjust && (
        <div className="adjust-fields">
          <Input
            label="调整生效日期"
            required
            type="date"
            value={effective}
            onChange={setEffective}
          />
          <TextArea
            label="调整原因与复查结论"
            required
            value={reason}
            onChange={setReason}
          />
        </div>
      )}
      <div className="callout">
        <strong>排程预览：{count} 次候选训练</strong>
        <p>
          {p.start} 至 {p.end}，每周{" "}
          {p.weekdays.map((n) => "周" + weekdays[n]).join("、") || "尚未选择"}，
          {p.time}，每次 {p.minutes} 分钟。
          {adjust
            ? "仅替换生效日起尚未完成的课次；已完成、已跳过和更早的记录保留。"
            : ""}
        </p>
      </div>
    </Editor>
  );
}
export function SessionEditor({
  s,
  session,
  save,
  close,
  coachMode = false,
}: {
  s: System;
  session: Session;
  coachMode?: boolean;
  save: Save;
  close: () => void;
}) {
  const [v, set] = useState(structuredClone(session));
  const [error, setError] = useState("");
  const details = (
    <>
      <div className="callout">
        方案 v{v.planVersion} · {v.time} · {v.minutes} 分钟
        <p>{v.cautions || "教练尚未补充专属注意事项"}</p>
      </div>
      {v.exercises.map((e, i) => (
        <article className="action-detail" key={e.id}>
          <h3>
            {i + 1}. {e.name}
          </h3>
          <div className="dose">
            {e.sets} 组 · {e.reps} · {e.load} · 休息 {e.rest}
          </div>
          <p>{e.method}</p>
          {e.tempo && <p>节奏：{e.tempo}</p>}
          {e.cautions && <p className="amber-text">注意：{e.cautions}</p>}
          {e.alternative && <p>替代动作：{e.alternative}</p>}
          {e.video && (
            <a href={e.video} target="_blank" rel="noreferrer">
              查看示范视频
            </a>
          )}
        </article>
      ))}
    </>
  );
  if (coachMode) {
    const content = (
      <>
        {details}
        <dl>
          <div>
            <dt>完成情况</dt>
            <dd>{v.status}</dd>
          </div>
          <div>
            <dt>实际完成</dt>
            <dd>{v.actual || "学员尚未填写"}</dd>
          </div>
          <div>
            <dt>费力程度</dt>
            <dd>{v.effort ?? "尚未填写"}</dd>
          </div>
          <div>
            <dt>训练反应</dt>
            <dd>{v.symptoms || "学员尚未填写"}</dd>
          </div>
          <div>
            <dt>次日恢复</dt>
            <dd>{v.nextDay || "学员尚未填写"}</dd>
          </div>
        </dl>
        <p className="muted">
          实际训练情况由学员本人填写。教练可以调整待完成课次的日期和时间；方案内容请通过“复查调整”修改。
        </p>
      </>
    );
    if (v.status !== "待完成")
      return (
        <Modal title={`${v.date} · ${v.title}`} onClose={close}>
          <div className="form-content">{content}</div>
        </Modal>
      );
    return (
      <Editor
        title={`调整课次 · ${v.title}`}
        onClose={close}
        onSave={async () => {
          if (v.date < today()) throw new Error("请将课次安排在今天或未来");
          await save({
            ...s,
            sessions: s.sessions.map((x) => (x.id === v.id ? v : x)),
          });
        }}
      >
        {content}
        <div className="form-grid">
          <Input
            label="训练日期"
            type="date"
            required
            value={v.date}
            onChange={(date) => set({ ...v, date })}
          />
          <Input
            label="训练时间"
            type="time"
            required
            value={v.time}
            onChange={(time) => set({ ...v, time })}
          />
        </div>
      </Editor>
    );
  }
  return (
    <Editor
      title={`${v.date} · ${v.title}`}
      onClose={close}
      onSave={async () => {
        if (v.status === "已完成" && v.date > today())
          throw new Error("未来的训练不能提前标记为已完成，请在训练后记录。");
        if (v.status === "已完成" && !v.actual.trim())
          throw new Error("请填写实际完成的动作、组数、次数与负荷。");
        if (v.status === "已跳过" && !v.symptoms.trim())
          throw new Error("请在身体反应栏填写跳过原因。");
        await save({
          ...s,
          sessions: s.sessions.map((x) =>
            x.id === v.id
              ? {
                  ...v,
                  completedAt:
                    v.status === "已完成"
                      ? v.completedAt || new Date().toISOString()
                      : "",
                }
              : x,
          ),
        });
      }}
    >
      {details}
      <div className="form-grid">
        <Select
          label="完成情况"
          value={v.status}
          options={["待完成", "已完成", "已跳过"]}
          onChange={(value) =>
            set({ ...v, status: value as Session["status"] })
          }
        />
        <Input
          label="训练费力程度（0—10）"
          type="number"
          min={0}
          max={10}
          step="0.5"
          value={v.effort}
          onChange={(value) => set({ ...v, effort: numberValue(value) })}
        />
        <TextArea
          label="实际完成内容"
          hint="逐动作写实际组数、次数／时长、负荷及未完成部分"
          value={v.actual}
          onChange={(value) => set({ ...v, actual: value })}
        />
        <TextArea
          label="训练中身体反应／跳过原因"
          value={v.symptoms}
          onChange={(value) => set({ ...v, symptoms: value })}
        />
        <TextArea
          label="次日恢复与不适"
          value={v.nextDay}
          onChange={(value) => set({ ...v, nextDay: value })}
        />
      </div>
      {error && <p role="alert">{error}</p>}
      <Button
        secondary
        onClick={() => {
          if (v.status === "已完成") setError("已完成记录请保留原训练日期。");
          else set({ ...v, date: shiftDate(v.date, 1) });
        }}
      >
        将待完成训练顺延一天
      </Button>
    </Editor>
  );
}
export function DailyEditor({
  s,
  entry,
  save,
  close,
}: {
  s: System;
  entry?: Daily;
  save: Save;
  close: () => void;
}) {
  const [v, set] = useState<Daily>(
    entry
      ? structuredClone(entry)
      : {
          id: uid(),
          date: today(),
          weight: null,
          bodyFat: null,
          waist: null,
          sleep: null,
          heartRate: null,
          steps: null,
          energy: null,
          notes: "",
          source: "手动记录",
        },
  );
  return (
    <Editor
      title="每日身体记录"
      onClose={close}
      onSave={async () => {
        if (s.daily.some((x) => x.date === v.date && x.id !== v.id))
          throw new Error("这一天已有记录，请在列表中编辑当天记录，避免重复。");
        if (
          [
            v.weight,
            v.bodyFat,
            v.waist,
            v.sleep,
            v.heartRate,
            v.steps,
            v.energy,
          ].every((x) => x === null) &&
          !v.notes.trim()
        )
          throw new Error("请至少填写一项指标或当天备注。");
        await save({
          ...s,
          daily: [v, ...s.daily.filter((x) => x.id !== v.id)],
        });
      }}
    >
      <p className="muted">尽量在相同时间和条件下测量；未测量的项目留空。</p>
      <div className="form-grid">
        <Input
          label="记录日期"
          type="date"
          required
          value={v.date}
          onChange={(value) => set({ ...v, date: value })}
        />
        {(
          [
            ["weight", "体重（kg）", 15, 350],
            ["bodyFat", "体脂率（%）", 1, 75],
            ["waist", "腰围（cm）", 20, 250],
            ["sleep", "睡眠（小时）", 0, 24],
            ["heartRate", "静息心率（次／分）", 20, 250],
            ["steps", "步数", 0, 200000],
            ["energy", "精神／恢复（0—10）", 0, 10],
          ] as const
        ).map(([key, label, min, max]) => (
          <Input
            key={key}
            label={label}
            type="number"
            min={min}
            max={max}
            step="0.1"
            value={v[key]}
            onChange={(value) => set({ ...v, [key]: numberValue(value) })}
          />
        ))}
        <TextArea
          label="饮食、症状与当天备注"
          value={v.notes}
          onChange={(value) => set({ ...v, notes: value })}
        />
      </div>
    </Editor>
  );
}
export function ReviewEditor({
  s,
  save,
  close,
}: {
  s: System;
  save: Save;
  close: () => void;
}) {
  const [r, set] = useState<Review>({
    id: uid(),
    date: today(),
    coach: s.profile.coach,
    conclusion: "",
    nextDate: shiftDate(today(), 14),
    action: "继续原计划",
    changes: s.problems.map((p) => ({
      problemId: p.id,
      name: p.name,
      before: p.severity,
      after: p.severity,
      measurement: p.measurement,
      method: p.retest,
    })),
  });
  return (
    <Editor
      title="定期复查与问题复评"
      onClose={close}
      onSave={async () => {
        if (r.nextDate && r.nextDate <= r.date)
          throw new Error("下次复查日期应晚于本次复查。");
        if (s.reviews.some((x) => x.date > r.date))
          throw new Error("请按时间顺序记录复查，避免旧结果覆盖最新分级。");
        if (!r.conclusion.trim() || !r.coach.trim())
          throw new Error("请填写复查人和复查结论。");
        if (r.changes.some((c) => !c.measurement.trim() || !c.method.trim()))
          throw new Error(
            "请填写每个问题的本次测量及复查方法，未测量可如实注明。",
          );
        await save({
          ...s,
          reviews: [r, ...s.reviews],
          assessment:
            r.action === "进一步评估"
              ? { ...s.assessment, confirmed: false }
              : s.assessment,
          problems: s.problems.map((p) => {
            const c = r.changes.find((x) => x.problemId === p.id);
            return c
              ? {
                  ...p,
                  severity: c.after,
                  measurement: c.measurement,
                  basis: [
                    p.basis,
                    `${r.date} 复查：${c.measurement}；方法：${c.method}`,
                  ]
                    .filter(Boolean)
                    .join("\n"),
                }
              : p;
          }),
        });
      }}
    >
      <div className="form-grid">
        <Input
          label="复查日期"
          required
          type="date"
          value={r.date}
          onChange={(v) => set({ ...r, date: v })}
        />
        <Input
          label="复查教练／评估人"
          required
          value={r.coach}
          onChange={(v) => set({ ...r, coach: v })}
        />
      </div>
      {r.changes.map((c, i) => (
        <div className="review-problem" key={c.problemId}>
          <h3>
            {c.name}
            <small>上次：{c.before}</small>
          </h3>
          <Select
            label={`本次程度 · ${c.name}`}
            value={c.after}
            options={severity}
            onChange={(v) =>
              set({
                ...r,
                changes: r.changes.map((x, j) =>
                  i === j ? { ...x, after: v as typeof c.after } : x,
                ),
              })
            }
          />
          <TextArea
            label={`本次测量 · ${c.name}`}
            value={c.measurement}
            onChange={(v) =>
              set({
                ...r,
                changes: r.changes.map((x, j) =>
                  i === j ? { ...x, measurement: v } : x,
                ),
              })
            }
          />
          <TextArea
            label={`复查方法 · ${c.name}`}
            value={c.method}
            onChange={(v) =>
              set({
                ...r,
                changes: r.changes.map((x, j) =>
                  i === j ? { ...x, method: v } : x,
                ),
              })
            }
          />
        </div>
      ))}
      <TextArea
        label="复查结论与调整建议"
        required
        value={r.conclusion}
        onChange={(v) => set({ ...r, conclusion: v })}
      />
      <div className="form-grid">
        <Select
          label="下一步处理"
          value={r.action}
          options={["继续原计划", "调整后续计划", "进一步评估"]}
          onChange={(v) => set({ ...r, action: v as Review["action"] })}
        />
        <Input
          label="下次复查日期"
          type="date"
          value={r.nextDate}
          onChange={(v) => set({ ...r, nextDate: v })}
        />
      </div>
      <p className="muted">
        保存后会更新问题分级。选择“调整后续计划”时，请继续进入方案调整，预览并确认新的日历排程。
      </p>
    </Editor>
  );
}
