# FloatLingo v1.0.0

**macOS 实时韩语翻译浮窗 + 保留实际内容的会议纪要**

第一个公开版本。双路捕获「现场麦克风」和「电脑系统音频」，实时识别原文并流式翻译成韩语；停止后可生成中文会议纪要，并保留完整逐字稿。

![实时韩语字幕](https://raw.githubusercontent.com/iris-pc/floatlingo/main/docs/screenshot-live.png)

![会议纪要](https://raw.githubusercontent.com/iris-pc/floatlingo/main/docs/screenshot-minutes.png)

## 下载

- `FloatLingo-1.0.0-arm64.dmg` — Apple Silicon (arm64)，macOS 13+
- `SHA256SUMS.txt`

SHA-256 of the DMG:

```text
80a677e827be302b09129d047e9d89dd615a10151c1725497d33326bb4e2fc7b  FloatLingo-1.0.0-arm64.dmg
```

## 亮点

- **双路收音**：麦克风「现场」与 ScreenCaptureKit 系统音频「设备」独立识别，分别标注来源；麦克风开启回声消除，减少重复。
- **低延迟流式字幕**：OpenAI `gpt-live-transcribe` Realtime WebSocket，24 kHz PCM；原文通常在 1–2 秒内开始出现，界面显示实测的原文/翻译首字延迟。
- **韩语流式翻译**：DeepSeek `deepseek-chat` 或 OpenAI `gpt-4o-mini`，说话过程中先给草稿，停顿后替换为最终译文。
- **兼容模式**：账号不支持 Realtime 模型时，可切换到 HTTP 分段识别（`gpt-4o-transcribe` / `whisper-1`）。
- **会后会议纪要**：停止识别后点「纪要」或按 `⌘⇧M`，生成中文纪要；正文尽量带 `[S001]` 来源编号。
- **保留实际内容**：导出时自动附加**未经模型改写的完整逐字记录附录**；长会议按时间分段处理，不截断，所有段都进入附录。
- **双语逐字稿页签**：纪要中的事实可以在应用实际保存的原文和当时韩译中逐条核对。
- **隐私优先**：不保存音频；Key 优先用 macOS 钥匙串加密；导出由用户主动触发。

## 安装

1. 打开 DMG，把 **FloatLingo** 拖到 Applications。
2. 首次启动如被 Gatekeeper 拦截，右键应用 → **打开**。
3. 在设置中填写 OpenAI API Key（语音识别必需）和 DeepSeek API Key（或切换为 OpenAI 翻译）。
4. 在 **系统设置 → 隐私与安全性 → 屏幕与系统音频录制** 中允许 **FloatLingo Audio**（不是只允许 FloatLingo 主程序）。
5. 点「开始实时翻译」。

快捷键：`⌘⇧S` 开始/停止、`⌘⇧T` 显示/隐藏、`⌘⇧L` 点击穿透、`⌘⇧M` 会议纪要。

详细说明、系统音频授权、API 配置和故障排查见 [README](https://github.com/iris-pc/floatlingo#readme)。

## 验证情况

- 打包后的 `.app` 已完成协议级端到端测试：双路音频管线、VAD、实时转写、韩语翻译、停止/重启、完整逐字稿、会议纪要、复制与 Markdown 导出。
- 使用本地 mock OpenAI/DeepSeek 服务测试，未使用真实 API Key；真实模型质量与网络延迟需由使用者用自有 Key 验证。
- 当前构建环境未完成 macOS 系统音频 TCC 授权，因此系统音频实际采集需要用户授权后验证；辅助程序的编译、启动、权限失败降级和错误提示已测试。
- 已通过 `codesign --verify --deep --strict` 校验（ad-hoc 本地签名，未公证）。

## 已知限制

- 系统音频捕获目前仅支持 macOS 13+；Windows 尚未实现系统音频采集。
- 没有声纹分离：只区分「现场 / 设备」，不区分同一路里的不同说话人。
- 逐字记录保存在运行中的进程内；退出应用后不会自动持久化，请先生成/导出。
- 公开构建为 ad-hoc 签名，不适合直接作为正式分发版本；正式发布请使用 Developer ID 签名并公证。
- 生成会议纪要使用所选翻译引擎的 API Key，并产生相应 API 费用。

## License

MIT. See [LICENSE](https://github.com/iris-pc/floatlingo/blob/main/LICENSE).
