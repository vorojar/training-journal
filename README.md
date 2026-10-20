# 循序 · 训练手记

部署在 GitHub Pages 的交互训练记录网页。查看基础期训练计划，记录体重、训练和恢复，补充身体评估，保存复查与方案调整。

## 数据在哪里

个人资料和记录只存入当前浏览器的 IndexedDB，不上传到 GitHub，不包含第三方统计或云端记录接口。换设备可导出 JSON 备份，再在另一台设备导入。同编号记录导入时保留当前版本。归档可恢复。

网站和代码公开；默认内容是通用模板，不包含使用者的病史或实际训练数据。清理浏览器网站数据、使用无痕窗口或更换浏览器前，请导出备份。不同设备不自动同步。

## 开发和发布

Node.js 24，`npm ci`，`npm run dev`。`npm run check` 检查类型，`npm run build` 输出静态文件。推送 main 后，GitHub Actions 自动构建并部署至 Pages。

部署流程采用 [GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 训练内容

通用动作仅作为评估后的候选。个人剂量、运动限制及复查目标需由相应评估确定。资料依据在网页“身体评估”中可查。
