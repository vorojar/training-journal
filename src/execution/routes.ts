import { date, today, type System } from "./domain";

export const pages = {
  overview: "我的总览",
  assessment: "训练前评估",
  plans: "教练方案",
  calendar: "训练日历",
  daily: "每日记录",
  reviews: "复查与调整",
  settings: "资料与备份",
} as const;
export type Page = keyof typeof pages;
export type Edit =
  | { type: "profile" }
  | { type: "assessment" }
  | { type: "problem"; id?: string }
  | { type: "plan"; id?: string; adjust?: boolean; reviewId?: string }
  | { type: "session"; id: string }
  | { type: "daily"; id?: string }
  | { type: "review" };
export type CalendarLocation = { month: string; date: string };
export type Route = { page: Page; calendar: CalendarLocation; edit?: Edit };
const idPattern = /^[a-zA-Z0-9_-]{1,200}$/;
export const pageForView = (view: string): Page =>
  (Object.entries(pages).find(([, name]) => name === view)?.[0] as
    | Page
    | undefined) || "overview";
function calendarDate(value: string) {
  return (
    date.safeParse(value).success &&
    Number(value.slice(0, 4)) >= 1900 &&
    Number(value.slice(0, 4)) <= 9998
  );
}
export function parseRoute(hash: string, day = today()): Route {
  const [path = "", query = ""] = hash.replace(/^#\/?/, "").split("?");
  const parts = path.split("/").filter(Boolean),
    first = parts.shift() || "overview";
  const page: Page = Object.hasOwn(pages, first) ? (first as Page) : "overview";
  const params = new URLSearchParams(query);
  const selected = params.get("date") || day,
    month = params.get("month") || selected.slice(0, 7);
  const calendar = {
    date: calendarDate(selected) ? selected : day,
    month: calendarDate(month + "-01") ? month : day.slice(0, 7),
  };
  const route: Route = { page, calendar };
  if (first !== page || !parts.length) return route;
  const [kind, id, action] = parts;
  const validId = id && id !== "new" && idPattern.test(id);
  if (kind === "profile" && parts.length === 1)
    route.edit = { type: "profile" };
  else if (kind === "assessment" && id === "edit" && parts.length === 2)
    route.edit = { type: "assessment" };
  else if (
    kind === "problem" &&
    parts.length === 2 &&
    (id === "new" || validId)
  )
    route.edit = { type: "problem", ...(validId ? { id } : {}) };
  else if (
    kind === "plan" &&
    (parts.length === 2 || (parts.length === 3 && action === "adjust")) &&
    ((id === "new" && !action) || validId)
  ) {
    const reviewId = params.get("review");
    route.edit = {
      type: "plan",
      ...(validId ? { id } : {}),
      ...(action === "adjust" ? { adjust: true } : {}),
      ...(action === "adjust" && reviewId && idPattern.test(reviewId)
        ? { reviewId }
        : {}),
    };
  } else if (kind === "session" && validId && parts.length === 2)
    route.edit = { type: "session", id };
  else if (kind === "entry" && parts.length === 2 && (id === "new" || validId))
    route.edit = { type: "daily", ...(validId ? { id } : {}) };
  else if (kind === "review" && id === "new" && parts.length === 2)
    route.edit = { type: "review" };
  return route;
}
export function formatRoute(route: Route): string {
  const e = route.edit;
  let path = route.page;
  let suffix = "";
  if (e)
    switch (e.type) {
      case "profile":
        suffix = "/profile";
        break;
      case "assessment":
        suffix = "/assessment/edit";
        break;
      case "problem":
        suffix = "/problem/" + (e.id || "new");
        break;
      case "plan":
        suffix = "/plan/" + (e.id || "new") + (e.adjust ? "/adjust" : "");
        break;
      case "session":
        suffix = "/session/" + e.id;
        break;
      case "daily":
        suffix = "/entry/" + (e.id || "new");
        break;
      case "review":
        suffix = "/review/new";
        break;
    }
  const params = new URLSearchParams();
  if (route.page === "calendar") {
    params.set("month", route.calendar.month);
    params.set("date", route.calendar.date);
  }
  if (e?.type === "plan" && e.adjust && e.reviewId)
    params.set("review", e.reviewId);
  const query = params.toString();
  return "#" + path + suffix + (query ? "?" + query : "");
}
export function missingTarget(s: System, e: Edit): string | undefined {
  if (e.type === "problem" && e.id && !s.problems.some((x) => x.id === e.id))
    return "此浏览器没有链接中的问题记录";
  if (e.type === "plan" && e.id) {
    const p = s.plans.find((x) => x.id === e.id);
    if (!p) return "此浏览器没有链接中的训练方案";
    if (e.adjust && p.status !== "已发布")
      return "该方案尚未发布，请先编辑草稿";
    if (!e.adjust && p.status === "已发布")
      return "已发布方案请通过“调整后续方案”修改";
    if (e.reviewId && !s.reviews.some((x) => x.id === e.reviewId))
      return "此浏览器没有链接中的复查记录";
  }
  if (e.type === "session") {
    const session = s.sessions.find((x) => x.id === e.id);
    if (!session) return "此浏览器没有链接中的训练课次";
    if (session.status === "已取消")
      return "这堂训练已被方案调整取消，请查看最新日历";
  }
  if (e.type === "daily" && e.id && !s.daily.some((x) => x.id === e.id))
    return "此浏览器没有链接中的每日记录";
}
