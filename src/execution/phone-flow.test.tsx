import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  emptySystem,
  assessmentFields,
  reconcileSystem,
  today,
  type Exercise,
  type Session,
} from "./domain";
import {
  profileBaseline,
  coachName,
  confirmAssessment,
  nextSet,
  recordSession,
} from "./phone-flow";
import { AssessmentEditor, PlanEditor, Editor, SessionEditor } from "./editors";
const e: Exercise = {
  id: "e",
  name: "深蹲",
  problemId: "",
  purpose: "力量",
  method: "控制动作",
  sets: "2",
  reps: "8次",
  load: "20kg",
  rest: "60秒",
  tempo: "",
  alternative: "",
  cautions: "",
  video: "",
};
const session = (): Session => ({
  id: "s",
  planId: "p",
  planVersion: 1,
  title: "力量",
  date: today(),
  time: "18:00",
  minutes: 30,
  status: "待完成",
  exercises: [e],
  actual: "",
  effort: null,
  symptoms: "",
  nextDay: "",
  completedAt: "",
  cautions: "",
});
const ready = () => {
  const s = emptySystem();
  s.assessment = {
    fields: Object.fromEntries(
      assessmentFields.map(([key]) => [key, "已核实"]),
    ),
    assessor: "教练",
    date: today(),
    confirmed: false,
    cautions: "注意",
    stopRules: "暂停条件",
  };
  return s;
};
describe("手机完整执行流程", () => {
  it("已有个人事实带入评估供核对，不凭空补充健康结论", () => {
    const s = emptySystem();
    s.profile = {
      ...s.profile,
      height: 175,
      baselineWeight: 65,
      gainKg: 3,
      goal: "提升力量",
    };
    expect(profileBaseline(s)).toBe(
      "身高 175 cm；起始体重 65 kg；增重目标 3 kg；目标：提升力量",
    );
    expect(profileBaseline(emptySystem())).not.toContain("尚未设置");
    const html = renderToStaticMarkup(
      <AssessmentEditor
        s={s}
        preferredCoach="当前教练"
        save={async () => {}}
        close={() => {}}
      />,
    );
    expect(html).toContain("当前教练");
    expect(html).toContain("身高 175 cm");
  });
  it("新方案沿用已知教练和目标，旧评估人的姓名保持不变", () => {
    const s = emptySystem();
    s.profile.goal = "增肌";
    s.assessment.assessor = "原评估人";
    expect(coachName(s, "当前教练")).toBe("当前教练");
    expect(coachName(s)).toBe("原评估人");
    s.assessment.fields.baseline = "实测基线";
    const html = renderToStaticMarkup(
      <AssessmentEditor
        s={s}
        preferredCoach="当前教练"
        save={async () => {}}
        close={() => {}}
      />,
    );
    expect(html).toContain("原评估人");
    expect(html).toContain("实测基线");
    const plan = renderToStaticMarkup(
      <PlanEditor
        s={s}
        preferredCoach="当前教练"
        save={async () => {}}
        close={() => {}}
      />,
    );
    expect(plan).toContain('value="当前教练"');
    expect(plan).toContain("增肌");
  });
  it("简短确认与完整评估执行相同门槛，暂停状态通过确认才能恢复", () => {
    expect(() => confirmAssessment(emptySystem())).toThrow();
    const s = ready();
    s.trainingHold = { active: true, reason: "需核对", since: today() };
    expect(reconcileSystem(s, confirmAssessment(s)).trainingHold?.active).toBe(
      false,
    );
    expect(s.assessment.confirmed).toBe(false);
    s.problems = [
      {
        id: "p",
        name: "待补充问题",
        severity: "待评估",
        priority: "本阶段重点",
        basis: "",
        measurement: "",
        goal: "",
        retest: "",
        cautions: "",
      },
    ];
    expect(() => confirmAssessment(s)).toThrow("每个问题");
  });
  it("下一组沿用上一组实际数值，但不自动勾选完成", () => {
    const first = nextSet(e, []);
    expect(first.reps).toBe(null);
    const last = { ...first, reps: 8, weight: 20, seconds: null, done: true };
    const next = nextSet(e, [last]);
    expect(next.id).not.toBe(last.id);
    expect(next).toMatchObject({
      reps: 8,
      weight: 20,
      seconds: null,
      done: false,
      exerciseId: "e",
    });
    expect(last.done).toBe(true);
  });
  it("完成组可以直接完成课次，无须重复填写文字；保存进度不算已完成", () => {
    const s = ready();
    s.assessment.confirmed = true;
    const v = session();
    v.setLogs = [{ ...nextSet(e, []), reps: 8, weight: 20, done: true }];
    s.sessions = [v];
    const complete = reconcileSystem(s, recordSession(s, v, "已完成"));
    expect(complete.sessions[0]!.status).toBe("已完成");
    expect(complete.sessions[0]!.completedAt).not.toBe("");
    expect(recordSession(s, v, "待完成").sessions[0]!.completedAt).toBe("");
    expect(s.sessions[0]!.status).toBe("待完成");
  });
  it("仍阻止空记录、未来课次和缺少跳过原因", () => {
    const s = ready(),
      v = session();
    s.sessions = [v];
    expect(() => recordSession(s, v, "已完成")).toThrow("完成组");
    expect(() =>
      recordSession(s, { ...v, date: "2099-01-01", actual: "测试" }, "已完成"),
    ).toThrow("未来");
    expect(() => recordSession(s, v, "已跳过")).toThrow("跳过原因");
  });
  it("进度保存与完成操作均位于表单提交区", () => {
    const html = renderToStaticMarkup(
      <Editor
        title="训练"
        onClose={() => {}}
        onSave={async () => {}}
        label="完成训练"
        secondaryLabel="保存进度"
        onSecondarySave={async () => {}}
      >
        <p>实际记录</p>
      </Editor>,
    );
    expect(html).toContain('value="secondary"');
    expect(html).toContain("保存进度");
    expect(html).toContain("完成训练");
  });
});

it("训练方法与记录按动作放在一起，正常训练不再重复选择完成状态", () => {
  const v = session();
  v.exercises.push({ ...e, id: "second", name: "划船", method: "划船方法" });
  const html = renderToStaticMarkup(
    <SessionEditor
      s={ready()}
      session={v}
      save={async () => {}}
      close={() => {}}
    />,
  );
  expect(html).toMatch(
    /控制动作[\s\S]*添加第一组[\s\S]*划船方法[\s\S]*添加第一组/,
  );
  expect(html).not.toContain('aria-label="完成情况"');
  expect(html).toContain("跳过本次训练");
  const completed = renderToStaticMarkup(
    <SessionEditor
      s={ready()}
      session={{ ...v, status: "已完成" }}
      save={async () => {}}
      close={() => {}}
    />,
  );
  expect(completed).toContain('aria-label="完成情况"');
});
