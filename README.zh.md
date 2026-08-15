# dsh-refpics — 参考图搜索插件

[English](README.md) | 中文

为 dsh Web GUI 提供面向模型的 `search_refs` 工具：把一句自然语言描述（"极简客厅"、"粗野主义海报版式"、
"赛博朋克霓虹街道夜景"……）变成一批匹配的参考图，并**在对话里以 Pinterest 式瀑布流**直接展示——
悬停显示作者与标题，点击进入带键盘操作的灯箱大图。

一个包、两个半区。node 半区（host 进程）注册 `search_refs` 工具和 "Reference pictures" 设置区；
browser 半区（Web GUI）注册 `tool.call.toolview` 的 keyed 条目接管该工具每个调用的渲染，因此瀑布流
内联出现在聊天消息流中，不需要单独面板或页面。

## 能力

| 能力 | 说明 |
| --- | --- |
| 自然语言搜索 | 一次调用直接把用户的原始描述作为 `query`，无需手工翻译成英文关键词 |
| 四个图库 | Openverse（免 key，始终可用）、Pexels、Pixabay、Unsplash（免费 API key）；`provider: auto` 优先使用已配置 key 的图库，否则回退 Openverse |
| Pinterest 式瀑布流 | 对话轮次内响应式多列瀑布流；懒加载缩略图，悬停浮层显示标题与作者 |
| 灯箱大图 | 点击任意卡片查看大图，含标题、作者、源站链接，支持前后切换与 Esc/方向键 |
| 换一批 / 翻页 | 每面墙上都有操作按钮：换一批向会话排队一条提示让模型重新搜一批，翻页排队同一查询的下一页——新结果以普通聊天墙的形式出现 |
| 侧边栏看板（dsh-better-sidebar） | 在右侧边栏注册单实例「参考图」标签页：镜像本会话最新的聊天搜索结果，也可以直接输入搜索（换一批/翻页即时生效，无需模型往返）；墙上的「在侧边栏打开」一键跳过去 |
| 图片下载 | 一键通过宿主代理路由下载图片（限 30 MiB、仅图片内容类型、文件名消毒） |
| 一键保存到 Eagle | 一键把图片 URL 发给本地 Eagle 应用（`/api/item/addFromURLs`，带 website/tags 元数据）；Eagle 端口与可选令牌可配置 |
| 保留署名 | 每张结果都带作者、作者主页、源站页面与许可信息，墙与模型文本均展示 |
| 方向与翻页 | `orientation: any/landscape/portrait/square` 过滤；`page` 获取同一查询的更多结果 |
| 结果边界 | 数量限制在 1-30 张；单请求 20 秒超时；10 分钟 TTL 的内存缓存去重重复查询 |
| 安全降级 | 运行中显示骨架屏；失败显示错误；异常负载回退为纯文本卡片——坏结果永远不会打崩聊天行 |
| 不爬虫 | 工具只调用官方公开 API。刻意不抓取 Pinterest（无公开 API、违反其服务条款）；Openverse/Pexels/Pixabay/Unsplash 是合规替代 |

## 安装

```sh
# 从 GitHub 安装 —— 仓库自带构建产物，无需本地构建
dsh plugin --profile web add github:Ghz114514/dsh-refpics
```

安装后重启一次 dsh web 宿主（或 GUI）让 profile 载入新 bundle；之后客户端更新只需刷新页面。
插件无需配置即可挂载：`auto` 立即回退到 Openverse；带 key 的图库在填好 key 前会给出清晰的报错提示。

本地开发（本仓库）：

```sh
pnpm install          # node >= 22.19
pnpm build            # lib/index.js（host）+ lib/client.js（browser）
dsh plugin --profile web add file:<repo>     # 安装本地构建
# 重新构建后，用同样方式刷新已安装副本
```

## 配置

设置 → 插件配置 → **Reference pictures**（`ref-pics` 设置区，改动即时生效）：

| 键 | 默认 | 含义 |
| --- | --- | --- |
| `pexelsKey` | 空 | Pexels API key（免费申请：pexels.com/api）；留空禁用该图库 |
| `pixabayKey` | 空 | Pixabay API key（免费申请：pixabay.com/api/docs）；留空禁用该图库 |
| `unsplashKey` | 空 | Unsplash access key（免费申请：unsplash.com/developers）；留空禁用该图库 |
| `defaultProvider` | `auto` | 调用传 `auto` 时优先使用的图库 |
| `defaultCount` | `12` | 调用省略 `count` 时的图片数量（1-30） |
| `eaglePort` | `41595` | Eagle 本地 API 端口；`0` 禁用保存到 Eagle 的路由 |
| `eagleToken` | 空 | 可选 Eagle API 令牌（仅当 Eagle 需要时填写） |

key 与 Eagle 令牌在设置 schema 中标记为 `secret`（卡片中掩码显示），且不会出现在日志、工具输出或模型可见文本中。

浏览器半区暴露四条同源宿主路由：`GET /refpics/search`（看板直搜）、`GET /refpics/download`（代理下载，30 MiB 上限、仅图片类型）、`POST /refpics/eagle`（添加单张图片到本地 Eagle）、`GET /refpics/eagle/status`（Eagle 健康检查）。Eagle 路由只访问 `127.0.0.1:<eaglePort>`。

## 工具用法

当用户索要参考图、灵感墙（moodboard）或视觉参考时，模型调用 `search_refs`。参数：

| 参数 | 类型 | 默认 | 含义 |
| --- | --- | --- | --- |
| `query` | string | 必填 | 自然语言描述（风格、主体、氛围、配色、媒介） |
| `count` | integer | 12 | 每页图片数（1-30） |
| `provider` | enum | `auto` | `auto` \| `openverse` \| `pexels` \| `pixabay` \| `unsplash` |
| `orientation` | enum | `any` | `any` \| `landscape` \| `portrait` \| `square` |
| `page` | integer | 1 | 同一查询的页码（取更多结果） |

会触发它的示例说法："帮我找几张极简客厅的参考图"、"show me reference images of brutalist
poster layouts"、"做一个赛博朋克风格的 moodboard"。

## 安全模型

- 仅通过 HTTPS 调用官方公开 API；不抓取、无 cookie、无登录。
- API key 存于设置区（`role: secret`），按调用解析，永不写入日志或返回给模型；HTTP 错误摘要截断到 200 字符。
- 请求有界：每次图库调用 20 秒超时（工具级协作超时 30 秒），取消时转发 abort 信号。
- 结果为图库托管的图片 URL 及署名元数据；插件本身不存储任何内容。

## 开发

```sh
pnpm install          # 依赖（node >= 22.19）
pnpm build            # tsc -b && tsdown -> lib/index.js（host）+ lib/client.js（browser）
pnpm typecheck        # host + client 两个 program + 测试
pnpm test             # node --test tests/（31 个用例，进程内运行）
node scripts/smoke-host.mjs    # 端到端冒烟：注册工具并真实调用一次 Openverse 搜索
node scripts/smoke-client.mjs  # 模拟浏览器冒烟：client bundle 及其服务接线
```

结构遵循 dsh-web-ui 全家桶约定（适配为独立包）：`src/index.ts` 为 host 半区、`src/client/` 为
browser 半区、`src/core/` 为两侧共享纯逻辑、`cordis.patch.yml` 为 profile 补丁、`dsh.client`
声明浏览器 bundle。浏览器半区使用 keyed 的 `tool.call.toolview` slot（`key: search_refs`），
不认识该插件的 UI 自动回退到通用卡片。

## 致谢

- **DeepSeek Harness（dsh）** —— 本插件运行所在的宿主平台：
  [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
- **dsh-web-ui 插件全家桶** —— bundle 补丁的 profile 挂载机制、host/browser 双半区结构、设置区
  模式与 keyed `tool.call.toolview` slot 模式参考自
  [zhu1090093659/dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui)
  （尤其是 `packages/dsh-tool-describe-image`）
- **dsh-better-sidebar** —— 侧边栏看板通过其标签页注册服务接入：
  [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)
- **图库来源** —— [Openverse](https://openverse.org)、[Pexels](https://www.pexels.com)、
  [Pixabay](https://pixabay.com)、[Unsplash](https://unsplash.com)；保存到 Eagle 使用官方
  [Eagle 本地 API](https://api.eagle.cool)
