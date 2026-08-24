# 天气与地震信息看板

面向公众的开源天气与地震信息看板：在一个中文界面中查看多模式天气预报、气象动画、点位趋势、全球地震报告、区域地震预警信息、测站观测与历史事件回放。

项目聚合 ECMWF、NOAA GFS、DWD ICON、CMA/NMC、JMA、USGS、CENC、CWA、EMSC、GFZ、GeoNet、BMKG 等机构的公开数据，并尽量保留来源、更新时间、震级类型和缓存状态，帮助普通用户更直观地理解天气变化与地震活动。

> [!IMPORTANT-重要提示]  
> 如果要体验完整的产品功能，你必须开启VPN，中继服务器正在搭建中，请谅解。  
> 本项目是公众信息展示与学习工具，不是官方气象或地震预警系统，也不能替代政府部门、应急机构及数据发布机构的正式通告。遇到灾害风险时，请以所在地官方信息和应急指引为准。

## 主要功能

- 多模式天气：浏览 ECMWF、GFS、ICON、CMA/NMC 与 JMA 的真实模式图、动画和逐小时点位趋势。
- 风险辅助：按自定义阈值查看降水、风、温度等风险提示，并在本机保存气象提示历史。
- 全球地震：并列展示多个机构对同一地震的报告，不用单一结果覆盖其他来源。
- 实时信息：接收 JMA、KMA、CENC、CWA 等公开地震预警信息，并明确区分官方报告、缓存数据、本地估算和历史回放。
- 测站与回放：查看 NIED、S-net、全球 FDSN 与 CWA CWASN 测站；开放波形可在浏览器中解码和回放。
- 隐私友好：不使用 Cookie，不绕过登录或反爬限制，个人偏好仅保存在本机浏览器。

## 项目说明

ECMWF 图表和原始十天 ENS 通过同源代理访问 `charts.ecmwf.int/opencharts-api/v1`；GFS、ICON、CMA/NMC 与 JMA 主图使用各机构单次模式运行的真实网格值，由服务端计算累计降水并绘制海岸线、等值线和风场。外部模式 T+0 先用 6×4 网格快速显示首帧，随后在后台取得 12×8 完整网格，完整帧解码成功后才无缝替换预览。动画只播放已索引且已加载的帧，同时继续在后台补齐剩余图片；平滑模式使用双帧交叉淡化，并按 1–60 fps 自动缩短过渡时间。完整预加载后可导出 GIF 或 H.264 MP4；MP4 使用离线帧时间戳编码，成片帧率和时长不受本机编码速度影响。点位告警分别使用 ECMWF IFS、NOAA GFS、DWD ICON、CMA GRAPES 与 JMA GSM/MSM 的逐小时模式数据。主图下方提供 Meteoblue 风格的多模式 Meteogram，以及过去 48 小时、当前和未来 24 小时温度/风对比页签；地图点选或经纬度修改会同步刷新。

页眉可切换到“地震 Dashboard”。地震页聚合 USGS、ShakeAlert、JMA、CENC、CWA、EMSC、GFZ、GeoNet 与 BMKG 的九机构公开报告，并另行接收 JMA、KMA、CENC、CWA 的实时预警中继。ShakeAlert 使用 USGS 官方周报流和 ComCat 历史产品，展示首报、峰值、终报、台站数、WEA 与城市预警时间，并明确标为震后性能报告。全球与实时界面都能查看全部已接入机构报告；实时预警历史可按机构筛选并显示各机构记录数，全球机构报告轮询与“全球情报”共用持久化的 1–60 秒刷新间隔。同一地震的多机构报告不会互相覆盖。单个机构暂时断连时继续显示该机构最后一次成功快照，并标记为缓存数据，不会让它此前的报告从地图和历史中消失。界面保留各机构原始震级类型（如 `Mw`、`mb`、`ML`、`Ms`、`Mi`、`Mj`、`Md`），不在不同震级标度之间擅自换算。

实时地震页按地图视窗聚合 EarthScope、GEOFON、ORFEUS、GeoNet 与 BMKG 的 FDSN 台站目录，并从 CWA GDMS 固定台湾范围独立加载 CWASN 目录；因此移动全球地图不会卸载 CWA 台网。传播回放中，全球 FDSN 与 CWASN 测站会按震源距离和理论 P/S 波到时逐站激活，这些颜色、计数和估算烈度属于确定性模拟，不是机构实测。点击全球 FDSN 台站后，服务端选择当前开放的三分量通道并返回有限时长 miniSEED 快照，浏览器解压真实样本后本地滚动回放；不会根据震级或震度伪造波形，也不会把 Dataselect 当作连续轮询接口。

S-net 实测页先加载最新观测帧并立即可用，再按批次回补 MSIL 最近一小时瓦片。NIED 与海底测站官方目录在首次成功后分别写入 `.runtime/nied-stations.json` 和 `.runtime/ocean-stations.json`；后续重启优先读取经过索引和坐标校验的磁盘快照，并在后台刷新官方目录，因此实时页面与最新瓦片不会被目录网络延迟串行阻塞。两类目录在浏览器中独立加载和重试，任一来源失败不会把另一台网一起清空。

日本附近出现活动预警或启动历史回放时，地图左下角会按距离检查日本官方或经政府页面授权链接的 YouTube 摄像头，并自动选择最近且当前可嵌入播放的镜头；禁止嵌入、没有直播或直播已结束的频道会被跳过并显示跳过数量。目录覆盖北海道、东北、关东、中部、近畿、中国、四国、九州和冲绳，可切换附近镜头、折叠或按事件隐藏。历史回放会检查官方频道近期 Feed 和候选直播的实际起止时间，也会核对持续直播是否启用 DVR 且事件仍在 12 小时窗口内；只有事件时刻确实被广播覆盖时才标为“历史录像”并跳到对应秒数。其余回放会醒目标为“当前直播 · 非该历史事件录像”，不会把当前画面伪装成历史现场。视频仅使用隐私增强 iframe 嵌入，不代理、下载、录制或重新托管上游内容。

Meteogram 使用上述机构的真实模式网格数据，不冒充 meteoblue 官方产品。meteoblue Forecast、History 与 Image API 需要私有 API Key，正式接入时应由后端持有并签名请求，不能把密钥写入浏览器代码。

应用不使用 Cookie，不绕过登录或反爬限制。默认生产服务器只监听 `127.0.0.1`；如需在家庭网络或其他受控环境中共享，可配置 HTTP Basic Authentication，并通过启用 HTTPS 的反向代理对外提供服务。

## 开发

```bash
pnpm install
pnpm dev
```

开发地址默认为 `http://127.0.0.1:5173/`。Vite 会代理 ECMWF 图表和各模式点位预报 API，并在本地提供真实模式网格图路由。

## 生产运行

```bash
pnpm check
pnpm start
```

`pnpm build` 会把最近一次 ECMWF 目录快照复制到 `dist/data/ecmwf/`，实时目录不可用时产品选择仍可工作。`server.mjs` 提供静态文件、SPA 回退、压缩、安全响应头、上游超时、ECMWF/点位预报同源代理、`/api/model-chart` 模式图表、`/api/earthquakes` 九机构地震报告聚合、`/api/seismic/external-warnings` 授权 Early-est / GlobalQuake 预警接入、`/api/seismic/fdsn/stations` 全球与 CWA CWASN 台站、`/api/seismic/fdsn/waveform` miniSEED 快照、`/api/seismic/cenc-products` CENC 官方专题文字/烈度等值线/仪器烈度测站、`/api/seismic/cenc-resource` CENC 官方图片资源和 `/api/seismic/camera/resolve` 官方视频可嵌入性检查，以及 `/healthz` 健康检查。ECMWF 目录、动画帧和点位预报代理使用 128 MB 有界 LRU；瞬时 429/5xx 会自动重试，曾成功读取的同一 URL 在上游故障时以 `X-Proxy-Cache: STALE` 明确回退，健康接口会报告当前缓存条目和字节数。

macOS、Windows、Linux 与 Android 的安装包构建、签名变量和源码保护边界见 [PACKAGING.md](./PACKAGING.md)。

常用环境变量：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | 监听地址 |
| `PORT` | `4175` | 生产端口 |
| `DASHBOARD_USER` | 空 | 可选 Basic Auth 用户名 |
| `DASHBOARD_PASSWORD` | 空 | 可选 Basic Auth 密码 |
| `ECMWF_API_BASE` | ECMWF OpenCharts API | ECMWF 上游地址 |
| `OPEN_METEO_API_BASE` | Open-Meteo v1 | 点位模式数据代理地址 |
| `PROXY_TIMEOUT_MS` | `25000` | 上游超时毫秒数 |
| `SINGLE_RUNS_API_BASE` | Open-Meteo Single Runs API | 单次模式运行网格地址 |
| `MODEL_CHART_TIMEOUT_MS` | `90000` | 模式网格请求超时毫秒数 |
| `MODEL_CHART_GRID_COLUMNS` | `12` | 完整动画上游经向取样数 |
| `MODEL_CHART_GRID_ROWS` | `8` | 完整动画上游纬向取样数 |
| `MODEL_CHART_HEAD_GRID_COLUMNS` | `6` | 首帧快速预览经向取样数 |
| `MODEL_CHART_HEAD_GRID_ROWS` | `4` | 首帧快速预览纬向取样数 |
| `MODEL_CHART_RENDER_INTERPOLATION` | `5` | 服务端绘图插值倍率 |
| `MODEL_CHART_REQUEST_BUDGET` | `500` | 每分钟最多占用的上游坐标额度 |
| `EARTHQUAKE_CACHE_TTL_MS` | `45000` | 地震聚合内存缓存有效期 |
| `EARTHQUAKE_TIMEOUT_MS` | `16000` | 单个地震来源请求超时 |
| `CWA_API_TOKEN` | 空 | CWA E-A0015/E-A0016 官方地震报告 API 授权码，仅由服务端读取；未配置时回退公开目录 |
| `NSTI_HTTP_PROXY_URL` | 空 | 国家地震科学数据中心（NSTI）官方强震动/订阅网站请求使用的 HTTP/HTTPS 代理；可填 `http://127.0.0.1:7893` |
| `EARTHQUAKE_SOURCE_SNAPSHOT_PATH` | `.runtime/earthquake-source-snapshots.json` | 九机构按查询视窗独立保存的最后成功报告快照 |
| `EARTHQUAKE_SOURCE_SNAPSHOT_MAX_ENTRIES` | `45` | 最多持久化的机构报告来源视窗数 |
| `FDSN_TIMEOUT_MS` | `18000` | 单个 FDSN 节点请求超时 |
| `FDSN_STATION_CACHE_TTL_MS` | `600000` | 全球台站视窗缓存有效期 |
| `FDSN_STATION_CACHE_PATH` | `.runtime/fdsn-stations.json` | 全球 FDSN 与 CWA CWASN 最近视窗的有界磁盘快照 |
| `FDSN_STATION_CACHE_MAX_ENTRIES` | `12` | 最多持久化的全球/CWA 测站视窗数量 |
| `FDSN_WAVEFORM_CACHE_TTL_MS` | `15000` | 所选台站波形快照短缓存有效期 |
| `FDSN_MAX_UPSTREAM_BYTES` | `12582912` | 单次 FDSN 上游响应字节上限 |
| `NIED_STATION_CACHE_PATH` | `.runtime/nied-stations.json` | NIED 测站顺序与 `siteConfigId` 磁盘快照路径 |
| `OCEAN_STATION_CACHE_PATH` | `.runtime/ocean-stations.json` | 海底台网官方目录磁盘快照路径 |
| `SNET_COLD_START_FRAMES` | `4` | S-net 冷启动优先加载的最新分钟帧数 |
| `SNET_FRAMES_PER_REFRESH` | `8` | S-net 每轮继续回补的历史分钟帧数 |
| `SNET_HISTORY_PATH` | `.runtime/snet-intensity-history.json` | S-net 事件与报次持久化路径 |
| `CAMERA_RELAY_TIMEOUT_MS` | `12000` | 单个官方视频播放器状态检查超时 |
| `CAMERA_ARCHIVE_SEARCH_TIMEOUT_MS` | `8000` | 回放时搜索官方频道历史直播的总时间预算 |
| `CAMERA_RELAY_ATTEMPT_TIMEOUT_MS` | `6000` | 单次 YouTube 播放页或频道 Feed 尝试超时 |
| `CAMERA_RELAY_RETRY_COUNT` | `1` | 摄像头瞬时网络失败重试次数 |
| `CAMERA_RELAY_CACHE_TTL_MS` | `300000` | 视频可播放状态内存缓存有效期 |
| `EARTHQUAKE_MAX_EVENTS` | `4000` | 单次聚合最多保留的事件数 |
| `EARLY_EST_FEED_URL` | 空 | 获得许可后配置的 Early-est JSON 或 CAP Feed；未配置时界面显示“待授权配置” |
| `EARLY_EST_FEED_TOKEN` | 空 | Early-est Feed Bearer Token，仅由服务端读取 |
| `GLOBALQUAKE_FEED_URL` | 空 | 获得许可后配置的 GlobalQuake JSON 或 CAP Feed；未配置时界面显示“待授权配置” |
| `GLOBALQUAKE_FEED_TOKEN` | 空 | GlobalQuake Feed Bearer Token，仅由服务端读取 |
| `EXTERNAL_WARNING_TIMEOUT_MS` | `12000` | Early-est / GlobalQuake 单次授权 Feed 请求超时 |
| `EXTERNAL_WARNING_CACHE_TTL_MS` | `3000` | 授权预警 Feed 内存缓存有效期 |
| `CENC_HTTP_PROXY_URL` | 空 | CENC 产品页、NSTI 回退页及实时 WebSocket 共用的 HTTP/mixed 代理；本机 Clash 等代理可填 `http://127.0.0.1:7893` |
| `CENC_WEBSOCKET_PROXY_URL` | 回退 `CENC_HTTP_PROXY_URL` | FAN Studio CENC 实时 WebSocket 专用 HTTP/mixed 代理；通常无需单独配置 |
| `FANSTUDIO_APP_ID` | 空 | FAN Studio 开发者平台分配的应用 ID，仅由服务端用于 CENC 实时烈度鉴权 |
| `FANSTUDIO_API_KEY` | 空 | 与应用 ID 配套的 API Key，仅由服务端读取，不会发送给浏览器 |
| `CENC_EGRESS_PROXY_URL` | 空 | CENC 产品页服务端出口转发地址；配置后 pBoard 以 `?url=` 传递目标 URL，适用于你有权限使用的中国境内 HTTPS 转发服务 |
| `CENC_PRODUCT_TIMEOUT_MS` | `18000` | CENC 产品请求超时 |
| `CENC_PRODUCT_CACHE_TTL_MS` | `300000` | CENC 产品页内存缓存有效期 |

对内网开放时至少配置 `DASHBOARD_USER` 和 `DASHBOARD_PASSWORD`，并在反向代理层启用 HTTPS。

Early-est 与 GlobalQuake 当前没有随本项目分发的公开生产 Feed。只有在运营方提供合法授权地址后才可配置上述变量；Token 不会传给浏览器，未配置、过期和错误三种状态会分别展示，也不会用模拟事件冒充实时预警。

CENC 地震专题页通过同源 `/api/seismic/cenc-products` 读取。该接口只允许 `www.cenc.ac.cn` 资源，能解析页面文字、图片、脚本链接和内嵌 GeoJSON，并可在应用内一键把解析出的 GeoJSON 叠加到地图；浏览器不直接访问 CENC。若当前出口收到 403/人机验证，应用会显示“受限”而不把错误页面当成产品。

国家地震科学数据中心（NSTI）强震动参数页由 `/api/seismic/cenc-intensity` 后端读取。配置 `NSTI_HTTP_PROXY_URL=http://127.0.0.1:7893` 后，列表页和坐标导出请求均经本机 7893；界面会显示“NSTI 7893 HTTP 代理”。普通会员的“五级以上/全球七级以上”订阅按照官方用户手册以邮件更新提醒为主，不会自动变成可供第三方服务轮询的实时 API；pBoard 只读取公开强震动页面，不读取邮箱，也不会伪造订阅报文。若需读取授权账户内容，应通过 NSTI 官方账号/数据服务申请并由服务端单独配置授权凭据。

FAN Studio 已将 CENC 实时烈度查询迁移到 `wss://ws.fanstudio.tech/all`，查询 `cencirlist` 前必须发送服务端鉴权消息。先在 [FAN Studio API Key 申请平台](https://api.fanstudio.tech/dev-platform/) 创建应用并取得 `appId` 与 `key`，再配置：

```dotenv
FANSTUDIO_APP_ID=你的应用ID
FANSTUDIO_API_KEY=你的密钥
CENC_HTTP_PROXY_URL=http://127.0.0.1:7893
```

密钥只存在于 Node 服务端；浏览器只接收归一化后的烈度报告。未配置或鉴权失败时，界面会明确显示“实时源待 API Key”，并把国家地震科学数据中心公开页标为延迟数据，不再把旧报告冒充实时速报。

在 macOS 上使用本机 7893 代理时，将下面一行加入 `.env.local`，然后重启 `pnpm start`：

```dotenv
CENC_HTTP_PROXY_URL=http://127.0.0.1:7893
```

这只给 CENC 后端 HTTP 与 WebSocket 请求设置代理，不会修改系统代理、TUN 或其他数据源；7893 必须确实是 HTTP/mixed 代理端口。若 WebSocket 需要不同出口，可单独设置 `CENC_WEBSOCKET_PROXY_URL`。也可以改用你有权限使用的 HTTPS 转发服务，例如 `CENC_EGRESS_PROXY_URL=https://your-relay.example/cenc`，服务需接受 `?url=<CENC URL>`。pBoard 不会伪造中国 IP、绕过验证码或绕过访问控制。

NSTI 与 CENC 可共用同一个 7893 出口，但配置项分开，便于分别停用或排查：

```dotenv
NSTI_HTTP_PROXY_URL=http://127.0.0.1:7893
CENC_HTTP_PROXY_URL=http://127.0.0.1:7893
```

## 爬取图表目录

```bash
pnpm crawl:ecmwf
pnpm crawl:ecmwf -- --details
pnpm crawl:ecmwf -- --details --retry-missing
```

默认会写入 `data/ecmwf/`：包目录、每个包的产品列表、以及可选的产品详情。`--retry-missing` 会复用已验证的详情文件，只重试当前目录中缺失或损坏的条目；官方产品列表存在但详情端点返回 404 的条目会单独记为 `upstream-missing`，网络和 5xx 缺失仍会触发目录门禁失败。生产页面的实时详情接口失败时会回退到随构建发布的同一产品详情快照。图像帧仍在打开 dashboard 时按当前选择实时加载，避免一次性抓取海量动态图。

## 质量门禁

```bash
pnpm check:ui
pnpm check:catalogue
pnpm test
pnpm build
```

- `check:ui`：检查气象、全球地震、实时地震和摄像头组件的所有按钮均绑定点击处理器，核对品牌、接口、震级类型和 FPS 契约，并阻止旧版合成 ENS 演示图重新进入生产代码。
- `check:catalogue`：核对目录包与产品数量，防止快照不完整。
- `test`：覆盖帧签名、切换时次、仅播放已加载帧、点位预报解析、阈值风险、四气象机构帧 URL、真实网格 SVG 渲染、九个地震报告来源、单源断连快照保留、全球/CWASN 台站解析、通道选择和波形抽稀，以及日本摄像头最近距离选择与回放来源标记。
