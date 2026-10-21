import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { emptySystem } from "./domain";
import { Overview, DailyScreen } from "./screens";
import { RecordsScreen } from "./extensions";
import CloudAccount from "../cloud/account";
import type { CloudConnection } from "../cloud/client";
const noop = () => {};
describe("手机精简流程", () => {
  it("空总览只有下一步，不重复展示流程、准备和无数据图表", () => {
    const s = emptySystem();
    const html = renderToStaticMarkup(<Overview s={s} edit={noop} go={noop} />);
    expect(html).toContain("完成训练前评估");
    for (const text of [
      "训练准备",
      "本周训练",
      "最近调整",
      "当前没有待记录",
      "关键指标",
      "力量进步",
    ])
      expect(html).not.toContain(text);
    expect(s).toEqual(emptySystem());
  });
  it("每日记录去掉设备占位和空图表，已有记录以卡片保留", () => {
    const s = emptySystem();
    s.daily = [
      {
        id: "d",
        date: "2026-10-21",
        weight: 65,
        bodyFat: null,
        waist: null,
        sleep: 8,
        heartRate: null,
        steps: null,
        energy: null,
        notes: "原有备注",
        source: "手动",
      },
    ];
    const html = renderToStaticMarkup(
      <DailyScreen s={s} edit={noop} go={noop} />,
    );
    expect(html).toContain("daily-card");
    expect(html).toContain("65");
    expect(html).toContain("原有备注");
    expect(html).toContain("的操作");
    expect(html).not.toContain("Apple Watch");
    expect(html).not.toContain("米家");
    expect(html).not.toContain("<table");
  });
  it("历史入口不重复列出所有业务记录", () => {
    const html = renderToStaticMarkup(
      <RecordsScreen s={emptySystem()} edit={noop} />,
    );
    expect(html).toContain("回收站");
    expect(html).not.toContain("记录类型");
    expect(html).not.toContain("记录纠错与归档");
  });
  it("账号设置不再重复通知中心或历史表格", () => {
    const cloud = {
      user: { id: "u", name: "测试", email: "test@example.invalid" },
      space: {
        id: "s",
        name: "测试空间",
        owner_id: "u",
        owner_name: "测试",
        role: "owner",
      },
      spaces: [],
      status: "已同步到云端",
    } as unknown as CloudConnection;
    const html = renderToStaticMarkup(<CloudAccount cloud={cloud} />);
    expect(html).toContain("账号与空间");
    expect(html).toContain("教练协作");
    expect(html).not.toContain("最近云端修改");
    expect(html).not.toContain("通知中心");
  });
});
