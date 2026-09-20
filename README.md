# 足迹｜openvela 足球比赛智能采集器

## 作品简介

“足迹”是运行在 openvela 圆形智能手表上的足球比赛智能采集器。球员可在手表端完成球场选择、赛前检查、进攻方向确认、实时记录、暂停与继续、上下半场管理、异常恢复和本地保存。手机连接和同步是增强能力，不是开赛或保存的前置条件。

作品面向业余足球比赛中过程数据难以持续记录、短暂定位异常容易打断记录、赛后缺少可靠留存的问题。比赛数据优先保存到手表本地；存在未结束比赛时，再次打开应用会进入恢复流程。

**参赛方向：手表应用创新。**

## 功能

- 本地快速开赛：支持 5 人制、7 人制、8 人制、11 人制和自定义训练。
- 赛前检查：展示 GNSS、心率、电量、存储、球场和进攻方向。
- 比赛记录：展示时长、距离、心率与配速，支持暂停、继续和控制面板。
- 半场管理：结束上半场后进入中场休息，下半场自动反转进攻方向。
- 可靠性：GNSS 暂失时持续计时；未结束比赛可恢复；结束比赛需二次确认。
- 本地历史：已保存比赛可查看详情并左滑删除单条记录。

## 仓库结构

```text
quickapp/footprint/  # 足迹 Vela 快应用源码、测试与开发 Skill
release/             # 可安装 RPK 构建产物
logs/Lil-Zh/         # 已导出的有效 AI Coding 日志
contest2026_399_fudebao.xml  # repo manifest，映射快应用到 openvela 工程
```

## 构建与验证

在 `quickapp/footprint` 目录中执行：

```powershell
npm test
npm run build
```

`npm test` 覆盖比赛状态、恢复流程、快速开赛、赛前检查、历史记录与删除等回归行为。构建依赖 Vela / AIoT 工具链；成功构建后在 `dist/` 生成 RPK。

当前提交的安装包：

- [`release/足迹_debug_0.2.0.rpk`](release/足迹_debug_0.2.0.rpk)
- SHA-256：`28FBBA99FA5ECEC00A7CE19E5003921CB93728A2F0D87662CDB6D76FDCA4088D`

## AI Coding 与 Skill

- AI Coding 日志位于 [`logs/Lil-Zh/`](logs/Lil-Zh/)，已按官方格式校验。
- 模拟器部署 Skill：[`quickapp/footprint/skills/vela-sim-autostart/`](quickapp/footprint/skills/vela-sim-autostart/)
- 圆屏回归检查 Skill：[`quickapp/footprint/skills/footprint-round-watch-qa/`](quickapp/footprint/skills/footprint-round-watch-qa/)

## 验证边界

本作品在 Vela 模拟器环境完成页面、状态流转和构建验证。模拟器中的 GNSS、心率、电量、连接与同步数值属于 Demo/Test 数据；真实设备传感器和手机同步仍需在目标设备及配套环境中验证。

技术报告与演示视频作为独立作品材料，通过大赛作品提交入口上传，不随本代码仓库提交。
