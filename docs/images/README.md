# Screenshot notes · 截图说明

These screenshots show the real Dirth Electron interface on Windows at 1440 × 940 pixels. Mac uses the same interface content with native window controls and Command-key shortcuts. They were captured with Playwright using the repository's isolated `tests/fixtures/ui-app.cjs` test entry point. The main process, IPC bridge, renderer, and bundled city artwork are the production application; the CLI adapter is an offline test fixture.

The focus-timer conversation is authored demo content, not a recorded model response. The visible `UI-TEST` engine label and model selection are fixture data and do not promise access to any particular model. The sidebar quota card shows a sample weekly allowance served by the fixture; no quota request reaches xAI. No personal conversations, login credentials, or paid model requests were used. `R:\Workspace` is a temporary alias to the isolated screenshot workspace.

这些图片是 Windows 上 Dirth 真实 Electron 界面的 1440 × 940 像素截图；Mac 共用相同界面内容，使用原生窗口按钮和 Command 快捷键。截图通过 Playwright 和仓库中的隔离测试入口 `tests/fixtures/ui-app.cjs` 拍摄。主进程、IPC、界面及各城市背景均来自实际应用，CLI 适配器使用离线模拟引擎。

专注计时器对话是为展示编写的示例内容，并非真实模型回复。界面中的 `UI-TEST` 引擎标记与模型选项属于测试数据，不代表特定模型的可用性。侧边栏额度卡片显示的是测试环境提供的示例周额度，不会向 xAI 查询额度。截图未使用个人聊天、登录凭据或付费模型请求。`R:\Workspace` 是隔离截图工作目录的临时路径别名。

| File / 文件 | View / 界面 |
| --- | --- |
| `welcome-en.png` | English welcome screen / 英文欢迎页 |
| `welcome-en.gif` | English welcome screen with animated rain / 英文欢迎页雨滴动图 |
| `app-en.png` | English demo conversation / 英文示例对话 |
| `welcome-zh-CN.png` | Simplified Chinese welcome screen / 简体中文欢迎页 |
| `welcome-zh-CN.gif` | Simplified Chinese welcome screen with animated rain / 简体中文欢迎页雨滴动图 |
| `app-zh-CN.png` | Simplified Chinese demo conversation / 简体中文示例对话 |
| `city-{tokyo,kyoto,okinawa,hokkaido}-en.webp` | English welcome screen of each city edition, for the README's city gallery / 各城市版英文欢迎页，用于介绍页的城市图集 |
| `city-{tokyo,kyoto,okinawa,hokkaido}-zh-CN.webp` | Simplified Chinese welcome screen of each city edition / 各城市版简体中文欢迎页 |
| `social-preview.png` | Link preview card for the repository, rendered from `social-preview.html` / 仓库链接分享卡片，由 `social-preview.html` 生成 |

The Tokyo PNGs and GIFs were captured on 2026-10-20 with rain enabled. The README uses looping welcome-screen GIFs so the rain remains recognizable when the image is scaled down. Each GIF records three seconds of the two production rain animations at 20 frames per second. The PNGs retain a fixed frame of the same effect; rain is naturally subtler in conversations. No rain was painted onto the images and no production styles were changed for the captures.

The city gallery was captured on 2026-10-26 with each city's weather enabled (rain, maple leaves, sea glitter or snow), paused mid-animation. Its images are the capture's lossless PNGs re-encoded as WebP at quality 92, which keeps them visually identical at a fraction of the size; nothing else was changed.

东京的 PNG 与 GIF 拍摄于 2026-10-20，开启了雨滴。介绍页使用循环播放的欢迎页 GIF，让缩小后的图片也能通过运动呈现下雨效果。每张 GIF 以每秒 20 帧记录应用原有的两层雨滴动画，共三秒。PNG 保留同一效果的固定帧，聊天界面中的雨滴按应用原本设计更淡。未在图片上后期添加雨滴，也未为拍摄修改应用样式。

城市图集拍摄于 2026-10-26，开启了各城市的天气（雨、红叶、海面波光或飘雪），并停在动画中途。图集由拍摄得到的无损 PNG 以质量 92 重新编码为 WebP，视觉上与原图一致，体积大幅缩小；除此之外未作任何修改。

## Reproduce / 重新拍摄

On Windows, install dependencies with `npm ci`, then run `node scripts/capture-readme.cjs` for the PNGs. It captures Tokyo's welcome screen and demo conversation, then the welcome screen of Kyoto, Okinawa and Hokkaido, in English and Simplified Chinese. To also create the GIFs, install FFmpeg on `PATH` and run `node scripts/capture-readme.cjs --motion`. Alternatively, run the **README screenshots** workflow in GitHub Actions, which includes GIF capture, and download its `readme-screenshots` artifact.

Candidate images are written to `work/readme-capture/images/`. The `qa/` directory contains matching weather-on/weather-off captures and `results.json`, which checks that each city's weather is rendered and paused mid-cycle, that hiding it changes nothing outside the main panel, and, for Tokyo, the rain's motion. Review the GIFs playing at README display size before copying them to `docs/images/`; pixel differences alone do not establish that rain is easy to see. The capture uses a fixed demo clock and isolated fixture data, with music muted and no real CLI requests. To make the gallery images, re-encode `welcome-en.png` and `welcome-<city>-<language>.png` as `city-<city>-<language>.webp` (for example with Pillow: `quality=92, method=6`).

Windows 上先运行 `npm ci`，再运行 `node scripts/capture-readme.cjs` 生成 PNG：先拍摄东京的欢迎页与示例对话，再拍摄京都、冲绳、北海道的欢迎页，各含英文与简体中文。如需同时生成 GIF，将 FFmpeg 加入 `PATH` 后运行 `node scripts/capture-readme.cjs --motion`。也可在 GitHub Actions 手动运行包含动图拍摄的 **README screenshots** 工作流，下载 `readme-screenshots` 产物。

候选图片保存在 `work/readme-capture/images/`；`qa/` 中保留相同画面的天气开启/关闭对照图及 `results.json`，检查每座城市的天气已渲染并停在动画中途、隐藏天气后主面板以外没有变化，以及东京雨滴的运动。复制到 `docs/images/` 前，应按介绍页实际显示尺寸检查 GIF 的播放效果；仅有像素变化不能证明雨滴容易辨认。拍摄使用固定演示时间与隔离测试数据，音乐静音，不调用真实 CLI。城市图集由 `welcome-en.png` 与 `welcome-<城市>-<语言>.png` 重新编码为 `city-<城市>-<语言>.webp`（例如用 Pillow，`quality=92, method=6`）。

## Social preview / 社交预览图

`social-preview.png` is the 1280 × 640 card that sites such as X show when the repository link is shared. `social-preview.html` places the four unmodified English city captures from the gallery over the app's own Shibuya background, beside its icon; no interface element is drawn by hand. Its text uses Liberation Sans, Liberation Mono and Poppins (SIL Open Font License), falling back to Arial, Consolas and Segoe UI; no font files are included in the repository.

To update it after changing the text or the screenshots, install dependencies with `npm ci`, run `npx playwright install chromium` once, then:

```sh
npx playwright screenshot --viewport-size="1280, 640" docs/images/social-preview.html docs/images/social-preview.png
```

Keep the image under 1 MB. GitHub does not read it from the repository: upload it under **Settings → General → Social preview**.

`social-preview.png` 是在 X 等网站分享仓库链接时显示的 1280 × 640 卡片。`social-preview.html` 将图集中四张未经修改的英文城市截图叠放在应用自带的涩谷背景上，旁边是应用图标，没有手绘任何界面元素。文字使用 Liberation Sans、Liberation Mono 与 Poppins（SIL Open Font License），缺少时回退到 Arial、Consolas 与 Segoe UI；仓库不包含字体文件。

修改文字或截图后，先运行 `npm ci`，首次还需运行 `npx playwright install chromium`，再执行上面的 `npx playwright screenshot` 命令重新生成。图片需小于 1 MB。GitHub 不会自动读取仓库中的这张图，需要在仓库的 **Settings → General → Social preview** 中上传。
