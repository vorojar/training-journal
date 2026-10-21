import {
  createContext,
  useContext,
  useRef,
  useState,
  Fragment,
  type ReactNode,
  type SetStateAction,
  type Dispatch,
} from "react";
export type Draft = {
  version: number;
  updatedAt: string;
  parts: Record<string, unknown>;
};
export const draftKey = (scope: string, route: string) =>
  `fitness-draft-v1:${scope}:${route}`;
export function readDraft(key: string): Draft | null {
  try {
    const text = localStorage.getItem(key);
    if (!text) return null;
    const value = JSON.parse(text);
    if (
      !value ||
      !Number.isInteger(value.version) ||
      typeof value.updatedAt !== "string" ||
      typeof value.parts !== "object" ||
      !value.parts
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
const Context = createContext<{
  pending: boolean;
  needsReview: boolean;
  error: string;
  candidate: Draft | null;
  get: <T>(part: string, initial: T) => T;
  put: (part: string, value: unknown) => void;
  clear: () => void;
  restore: () => void;
  discard: () => void;
  approve: () => void;
} | null>(null);
export function DraftProvider({
  scope,
  route,
  version,
  children,
  onDiscard,
}: {
  scope: string;
  route: string;
  version: number;
  children: ReactNode;
  onDiscard?: () => void;
}) {
  const key = draftKey(scope, route);
  const original = useRef(readDraft(key));
  const values = useRef<Record<string, unknown>>({});
  const restoring = useRef(false);
  const [candidate, setCandidate] = useState(original.current),
    [epoch, setEpoch] = useState(0),
    [needsReview, setReview] = useState(false),
    [error, setError] = useState("");
  function remove() {
    try {
      localStorage.removeItem(key);
    } catch {
      setError("无法清理本机草稿，请检查浏览器存储权限");
    }
  }
  function clear() {
    remove();
    original.current = null;
    setCandidate(null);
    setReview(false);
  }
  return (
    <Context.Provider
      value={{
        candidate,
        pending: !!candidate && !restoring.current,
        needsReview,
        error,
        get: <T,>(part: string, initial: T) => {
          const value =
            restoring.current &&
            Object.hasOwn(original.current?.parts ?? {}, part)
              ? (original.current!.parts[part] as T)
              : initial;
          values.current[part] = value;
          return value;
        },
        put: (part, value) => {
          values.current[part] = value;
          try {
            localStorage.setItem(
              key,
              JSON.stringify({
                version: needsReview
                  ? (original.current?.version ?? version)
                  : version,
                updatedAt: new Date().toISOString(),
                parts: values.current,
              }),
            );
            setError("");
          } catch {
            setError("此设备草稿保存失败，请勿关闭页面；联网后尽快提交");
          }
        },
        clear,
        restore: () => {
          restoring.current = true;
          setReview(original.current?.version !== version);
          setEpoch((e) => e + 1);
        },
        discard: () => {
          clear();
          onDiscard?.();
          restoring.current = false;
          values.current = {};
          setEpoch((e) => e + 1);
        },
        approve: () => setReview(false),
      }}
    >
      <Fragment key={epoch}>{children}</Fragment>
    </Context.Provider>
  );
}
export function useDraft() {
  return useContext(Context);
}
export function useDraftState<T>(
  part: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const draft = useDraft();
  const [value, setValue] = useState<T>(() => {
    const first =
      typeof initial === "function" ? (initial as () => T)() : initial;
    return draft?.get(part, first) ?? first;
  });
  const current = useRef(value);
  current.current = value;
  const set: Dispatch<SetStateAction<T>> = (next) => {
    const result =
      typeof next === "function"
        ? (next as (old: T) => T)(current.current)
        : next;
    current.current = result;
    draft?.put(part, result);
    setValue(result);
  };
  return [value, set];
}
export function DraftNotice() {
  const d = useDraft();
  if (!d || (!d.pending && !d.needsReview && !d.error)) return null;
  return (
    <div className="draft-notice">
      {d.pending ? (
        <>
          <strong>发现本设备未提交的草稿</strong>
          <p>
            {d.candidate && new Date(d.candidate.updatedAt).toLocaleString()} ·
            恢复后仍需点击保存，才会同步到云端。
          </p>
          <button type="button" className="btn" onClick={d.restore}>
            恢复草稿
          </button>
          <button type="button" className="btn secondary" onClick={d.discard}>
            丢弃旧草稿
          </button>
        </>
      ) : d.needsReview ? (
        <>
          <strong>云端资料已更新，草稿来自旧版本</strong>
          <p>
            请核对恢复的内容与当前云端资料，避免覆盖他人的修改。草稿不会自动提交。
          </p>
          <button type="button" className="btn secondary" onClick={d.approve}>
            已核对最新资料，继续编辑
          </button>
          <button type="button" className="btn secondary" onClick={d.discard}>
            放弃草稿，使用最新资料
          </button>
        </>
      ) : null}
      {d.error && (
        <p role="alert" className="error">
          {d.error}
        </p>
      )}
    </div>
  );
}
