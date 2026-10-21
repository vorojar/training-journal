import { useRef, useState, useEffect } from "react";
import { MoreHorizontal } from "lucide-react";
import type { Edit } from "./routes";
import type { Kind } from "./lifecycle";
export function RecordMenu({
  id,
  kind,
  name,
  edit,
  correction,
  owner = true,
  template = false,
}: {
  id: string;
  kind: Kind;
  name: string;
  edit: (e: Edit) => void;
  correction?: Edit;
  owner?: boolean;
  template?: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [above, setAbove] = useState(false),
    [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const dismiss = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && ref.current)
        ref.current.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  return (
    <details
      className="record-menu"
      ref={ref}
      onToggle={(e) => {
        const opened = e.currentTarget.open;
        setOpen(opened);
        if (opened) {
          const summary = e.currentTarget
            .querySelector("summary")!
            .getBoundingClientRect();
          const height = e.currentTarget
            .querySelector(".record-menu-items")!
            .getBoundingClientRect().height;
          setAbove(
            window.innerHeight - summary.bottom <
              height +
                (window.matchMedia("(max-width:680px)").matches ? 88 : 8),
          );
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && ref.current) {
          ref.current.open = false;
          ref.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label={`${name}的操作`} title="记录操作">
        <MoreHorizontal size={20} />
      </summary>
      <div className={"record-menu-items" + (above ? " above" : "")}>
        {correction && (
          <button
            type="button"
            onClick={() => {
              if (ref.current) ref.current.open = false;
              edit(correction);
            }}
          >
            查看／纠正
          </button>
        )}
        {template && (
          <button
            type="button"
            onClick={() => {
              if (ref.current) ref.current.open = false;
              edit({ type: "template", id: "save_" + id });
            }}
          >
            保存为模板
          </button>
        )}
        {owner && (
          <button
            type="button"
            onClick={() => {
              if (ref.current) ref.current.open = false;
              edit({ type: "archive", kind, id });
            }}
          >
            归档
          </button>
        )}
      </div>
    </details>
  );
}
