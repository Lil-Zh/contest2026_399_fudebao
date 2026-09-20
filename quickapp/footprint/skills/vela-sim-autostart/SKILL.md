---
name: vela-sim-autostart
description: 一键把 Vela 快应用构建为 rpk 并部署到 redmi_watch 模拟器运行。解决 aiot 工具链三个坑：IDE 重写 VVD config.ini 导致模拟器不可用、交互式提问阻塞 CI、旧 adb 序列号导致 push 静默失败。当需要在本项目或同构 Vela 项目上非交互式构建、安装、启动模拟器调试时使用。
---

# Vela 模拟器自动部署 Skill

目标：在无人工交互的前提下，完成 **构建 rpk → 拉起/附着 redmi_watch 模拟器 → 安装并启动应用** 全流程。

## 使用方式

```bash
node auto-start.cjs
```

## 该 Skill 封装的三个关键经验（踩坑记录）

1. **VVD 配置自愈（healVvdConfig）**：Vela IDE 重启模拟器时会重写
   `~/.vela/vvd/redmi_watch.vvd/config.ini` 并删掉 `image.sysdir.2` 字段，
   导致 aiot 工具链判定模拟器不可用。启动前自动把 `image.sysdir.2`
   补回为与 `image.sysdir.1` 相同的值。
2. **非交互化**：通过 `Module.prototype.require` 拦截 `@inquirer/prompts`，
   自动选择 `redmi_watch` 模拟器并默认确认，使脚本可在 CI / AI 代理环境中运行。
3. **分离式冷启动 + 强制重装兜底**：
   - 模拟器未运行时用 `detached: true` + `unref()` 冷启动，避免脚本退出时
     把模拟器整棵进程树带走；随后轮询 adb 设备列表（最长 90 秒）等待就绪。
   - 工具链偶尔拿旧 adb 序列号执行 push/unzip 造成静默失败，因此部署后
     用 adb 强制重装兜底：push rpk 到 `/data/quickapp/app/`、解压、
     `vapp app/<package>` 启动。

## 迁移到其他 Vela 项目

1. 复制 `auto-start.cjs`，修改 `PKG`（包名）与 `RPK` 路径。
2. 确认依赖 `aiot-toolkit`（`VelaUxStarter`、`VelaAvdUtils`）已安装。
3. adb 可执行文件路径取自 `node_modules/@aiot-toolkit/emulator/.../adb.exe`，
   与项目本地工具链绑定。
