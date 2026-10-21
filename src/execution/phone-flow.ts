import {
  uid,
  today,
  assessmentErrors,
  type System,
  type Session,
  type SetLog,
  type Exercise,
} from "./domain";
export function profileBaseline(s: System) {
  return [
    s.profile.height !== null ? `身高 ${s.profile.height} cm` : "",
    s.profile.baselineWeight !== null
      ? `起始体重 ${s.profile.baselineWeight} kg`
      : "",
    s.profile.gainKg !== null ? `增重目标 ${s.profile.gainKg} kg` : "",
    s.profile.goal && s.profile.goal !== "尚未设置训练目标"
      ? `目标：${s.profile.goal}`
      : "",
  ]
    .filter(Boolean)
    .join("；");
}
export function coachName(s: System, actor = "") {
  return actor || s.profile.coach || s.assessment.assessor;
}
export function confirmAssessment(s: System): System {
  const errors = assessmentErrors(s);
  if (errors.length) throw new Error(errors.join("；"));
  return { ...s, assessment: { ...s.assessment, confirmed: true } };
}
export function nextSet(e: Exercise, rows: SetLog[]): SetLog {
  const last = rows.at(-1);
  return {
    id: uid(),
    exerciseId: e.id,
    exerciseName: e.name,
    reps: last?.reps ?? null,
    weight: last?.weight ?? null,
    seconds: last?.seconds ?? null,
    done: false,
  };
}
export function recordSession(
  s: System,
  v: Session,
  status: Session["status"],
): System {
  if (status === "已完成" && v.date > today(s.profile.timeZone))
    throw new Error("未来的训练不能提前标记为已完成，请在训练后记录。");
  if (
    status === "已完成" &&
    !v.actual.trim() &&
    !v.setLogs?.some((x) => x.done)
  )
    throw new Error("请填写完成组记录或实际训练内容，再完成训练。");
  if (status === "已跳过" && !v.symptoms.trim())
    throw new Error("请在身体反应栏填写跳过原因。");
  return {
    ...s,
    sessions: s.sessions.map((x) =>
      x.id === v.id
        ? {
            ...v,
            status,
            completedAt:
              status === "已完成"
                ? v.completedAt || new Date().toISOString()
                : "",
          }
        : x,
    ),
  };
}
