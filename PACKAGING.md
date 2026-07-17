# 跨平台打包与源码保护

## 可生成的安装包

| 平台 | 架构 | 产物 |
| --- | --- | --- |
| macOS | Apple Silicon、Intel | `.dmg`、`.pkg` |
| Windows | x64 | `.msi` |
| Linux | x64 | `.AppImage`、`.deb`、`.rpm` |
| Android | Gradle 默认 ABI | `.apk` |

桌面端将 Vite 页面与现有 Node 数据服务一并封装。应用启动后，数据服务只监听随机的 `127.0.0.1` 端口，不向局域网开放。

Android 不能直接运行项目现有的 Node 服务。发布 APK 时必须提供 `MOBILE_SERVER_URL=https://...`，该地址需要部署完整网页和同源 `/api/*` 服务。构建脚本会拒绝 HTTP 地址和缺失地址，避免误发一个只能显示静态界面的 APK。

## 本机构建

```bash
pnpm install

# macOS
pnpm dist:mac

# 在 Linux x64 上
pnpm dist:linux

# 在 Windows x64 上
pnpm dist:windows

# Android 发布 APK
MOBILE_SERVER_URL=https://your-service.example.com pnpm dist:android
```

产物分别位于 `release/` 和 `android/app/build/outputs/apk/release/`。

## 签名配置

签名材料只能放在本机环境变量或 GitHub Actions Secrets，不能提交到仓库。

- macOS：`MACOS_CERTIFICATE`、`MACOS_CERTIFICATE_PASSWORD`，公证另需 `APPLE_API_KEY`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER`。
- Windows：当前按项目要求生成未签名 MSI。
- Android：`ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`。
- Android 服务：`MOBILE_SERVER_URL`。

没有平台证书时可以生成未签名或临时签名的测试产物，但操作系统会显示未知开发者警告，不应直接公开分发。

## 源码保护边界

发布流程执行以下保护：

- 不包含 `src/`、TypeScript、测试和 source map。
- Web 代码经过 Terser 多轮压缩与变量改写。
- 桌面主进程和 Node 服务被打成一个压缩 JavaScript bundle。
- Electron 文件写入 ASAR，并启用 ASAR 完整性校验。
- 关闭生产 DevTools、Node renderer 集成、Node 调试参数和 `NODE_OPTIONS`。
- Android release 启用 R8/ProGuard 与资源收缩。

这些措施可以提高提取和篡改门槛，但不能让客户端代码成为不可逆的“加密源码”。用户设备必须能够解密或执行客户端代码，因此有足够时间的分析者仍可能还原逻辑。永久密钥、私有上游凭据和真正需要保密的算法必须只存在于 HTTPS 服务端。
