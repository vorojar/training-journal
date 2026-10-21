import { nextSet } from "./phone-flow";
import { useState } from "react";
import { Button, Input, Section } from "./ui";
import {
  strengthSeries,
  type Session,
  type Exercise,
  type System,
  type SetLog,
} from "./domain";
export function SetRecorder({
  session,
  onChange,
  readOnly = false,
  exercise,
}: {
  session: Session;
  onChange?: (logs: SetLog[]) => void;
  readOnly?: boolean;
  exercise: Exercise;
}) {
  const logs = session.setLogs ?? [];
  function update(id: string, patch: Partial<SetLog>) {
    onChange?.(logs.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }
  const e = exercise;
  const rows = logs.filter((x) => x.exerciseId === e.id);
  if (readOnly && !rows.length) return null;
  return (
    <section className="set-recorder">
      {rows.map((row, index) => (
        <div key={row.id} className="set-row">
          <strong>第{index + 1}组</strong>
          {readOnly ? (
            <span>
              {row.reps !== null
                ? `${row.reps}次 · ${row.weight ?? "未填"}kg`
                : ""}
              {row.seconds !== null ? ` ${row.seconds}秒` : ""} ·{" "}
              {row.done ? "已完成" : "未完成"}
            </span>
          ) : (
            <>
              <Input
                label="次数"
                ariaLabel={`${e.name}第${index + 1}组次数`}
                type="number"
                min={1}
                max={1000}
                step="1"
                value={row.reps}
                onChange={(v) =>
                  update(row.id, { reps: v === "" ? null : Number(v) })
                }
              />
              <Input
                label="负重（kg）"
                ariaLabel={`${e.name}第${index + 1}组负重kg`}
                type="number"
                min={0}
                max={2000}
                step="0.5"
                value={row.weight}
                onChange={(v) =>
                  update(row.id, { weight: v === "" ? null : Number(v) })
                }
              />
              <Input
                label="时长（秒）"
                ariaLabel={`${e.name}第${index + 1}组时长秒`}
                type="number"
                min={1}
                max={86400}
                step="1"
                value={row.seconds}
                onChange={(v) =>
                  update(row.id, { seconds: v === "" ? null : Number(v) })
                }
              />
              <label className="set-check">
                <input
                  type="checkbox"
                  checked={row.done}
                  onChange={(event) =>
                    update(row.id, { done: event.target.checked })
                  }
                />
                完成
              </label>
              <button
                type="button"
                className="link"
                aria-label={`删除${e.name}第${index + 1}组`}
                onClick={() => onChange?.(logs.filter((x) => x.id !== row.id))}
              >
                删除
              </button>
            </>
          )}
        </div>
      ))}
      {!readOnly && (
        <Button
          secondary
          onClick={() => onChange?.([...logs, nextSet(e, rows)])}
        >
          {rows.length ? "再加一组" : "添加第一组"}
        </Button>
      )}
    </section>
  );
}
export function StrengthProgress({ s }: { s: System }) {
  const names = [
    ...new Set(
      s.sessions
        .filter((x) => x.status === "已完成")
        .flatMap((x) =>
          (x.setLogs ?? [])
            .filter((r) => r.done)
            .map((r) => r.exerciseName.trim()),
        ),
    ),
  ].sort();
  const [chosen, setChosen] = useState("");
  const name = names.includes(chosen) ? chosen : (names[0] ?? "");
  const points = strengthSeries(s, name);
  const max = Math.max(1, ...points.map((p) => p.load));
  return (
    <Section title="力量进步" description="同名动作合并统计，负重指外加重量。">
      {!names.length ? (
        <p className="muted">完成训练并保存逐组记录后显示趋势。</p>
      ) : (
        <>
          <label className="field">
            <span>选择动作</span>
            <select
              aria-label="力量统计动作"
              value={name}
              onChange={(e) => setChosen(e.target.value)}
            >
              {names.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          {points.length > 0 ? (
            <>
              <svg
                viewBox="0 0 680 180"
                className="chart"
                role="img"
                aria-label={`${name}最大完成负重趋势`}
              >
                {points.map((p, i) => {
                  const x =
                      40 +
                      (points.length === 1
                        ? 300
                        : (i / (points.length - 1)) * 590),
                    y = 145 - (p.load / max) * 110;
                  return (
                    <g key={p.date}>
                      <circle cx={x} cy={y} r="5" fill="#2463eb">
                        <title>
                          {p.date}：{p.load}kg
                        </title>
                      </circle>
                      {i > 0 && (
                        <line
                          x1={40 + ((i - 1) / (points.length - 1)) * 590}
                          y1={145 - (points[i - 1]!.load / max) * 110}
                          x2={x}
                          y2={y}
                          stroke="#2463eb"
                          strokeWidth="2"
                        />
                      )}
                      <text x={x - 15} y="170">
                        {p.date.slice(5)}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>完成组</th>
                      <th>次数</th>
                      <th>最大负重kg</th>
                      <th>外加负重训练量kg×次</th>
                      <th>估算1RM kg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...points].reverse().map((p) => (
                      <tr key={p.date}>
                        <td>{p.date}</td>
                        <td>{p.sets}</td>
                        <td>{p.reps}</td>
                        <td>{p.load}</td>
                        <td>{p.volume.toFixed(1)}</td>
                        <td>{p.estimatedMax?.toFixed(1) ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <small className="muted">
                1RM按1–10次负重组估算，仅供趋势参考；计时组不计入。
              </small>
            </>
          ) : (
            <p className="muted">
              该动作目前只有计时记录，没有次数与负重数据。
            </p>
          )}
        </>
      )}
    </Section>
  );
}
