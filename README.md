# 动作预览室 · 大黑塔

公益、非官方的真实 3D 动作工作台。浏览器直接使用，无需 GPT 或 GitHub 登录。

- [混合与节点工作台](https://0everey.github.io/motion-room/workbench.html)
- [单片动作目录](https://0everey.github.io/motion-room/)

当前97个动作ID、129个变体，区分Source/Native/Cloud。支持多实例、目标局部姿态混合、播放节点、配方分享/下载、复制给AI和可清理离线缓存。首次联网加载完整组合后可离线重开；清理后需要主动联网重载。Native原始根曲线与真实Animator根应用分开，页面保留相应能力和用途说明。

## 维护

本仓库是完整应用的发布投影；维护者从作者源的白名单导出器生成docs，核PUBLIC-SOURCE.json内容身份后普通提交/推送。不要直接修改docs形成另一个作者源。GitHub Pages发布来源为main分支/docs，.nojekyll保直接静态发布；不依赖自定义工作流或浏览器密钥。

本地预览：`python -m http.server 8000 --directory docs`，打开`http://localhost:8000/workbench.html`。回退时恢复既有可用提交并普通推送，再确认Pages构建和真实页面。

模型、字体、Three.js及其使用规则/许可证见[素材署名](docs/credits.txt)、docs/assets/fonts/OFL.txt和docs/vendor/three/LICENSE。公开应用的素材说明不被本仓库代码许可覆盖；不提供原FBX、Unity动画作者文件或独立模型素材包。
