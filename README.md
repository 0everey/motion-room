# 动作工作台

[直接打开网页](https://0everey.github.io/motion-room/workbench.html)。无需GPT/GitHub账号或整库下载；预览按当前页加载。

全部2446个动作可预览，共2446 Source＋35 Native＋1 Cloud＝2482版本。默认UE4 Mannequin白模与固定镜头；搜索、分类/时长等筛选、精看Root Motion、复制原件路径和下载FBX是核心入口。12/24/48/64同屏密度，骨架适合大量速览。混合、节点、实例、配方和诊断保留在高级工作区。

Root Motion关闭为原地预览，开启在选中动作精看中显示实际位移。Source/Cloud是来源髋轨迹，Native使用对应的实测Animator根；开关不改原FBX、不表示已生成UE编辑器独立根骨资产。默认相机按整段动作范围固定，允许手动旋转/缩放。

原FBX由用户决定放到[独立原件库](https://github.com/0everey/motion-animation-sources)，网页下载绑定固定版本并校内容SHA。本仓库只发布应用、预览模型和派生，含原素材的来源链接；不包含私有历史、作者工程或凭据。

## 维护

[资源工作台维护方法](docs/maintenance-method.md)总结“找→看→取用”、原件/目录/派生身份、按需加载、固定取景、真实缓存、元数据刷新和发布回核，指出迁移到模型/贴图/音频所需的专用适配。

本仓库是作者源白名单导出的发布投影，PUBLIC-SOURCE.json记录实际文件身份；请从作者入口维护，不直接编辑docs形成第二权威。GitHub Pages使用main/docs与.nojekyll，无账号后端或浏览器密钥。

本地查看可运行 `python -m http.server 8000 --directory docs`，打开 `http://localhost:8000/workbench.html`。完整离线包包含全预览及依赖，包内Start-Windows.cmd使用已有Python3启动；预览可断网，原FBX下载另需网络。

模型、字体、Three.js及许可见[素材署名](docs/credits.txt)、docs/assets/fonts/OFL.txt和docs/vendor/three/LICENSE。UE4模板网格与修改依Epic Examples条款；可选其它角色仍沿各自来源条件。素材权利不被本仓库代码许可覆盖。预览不表示原角色接触、衣形、道具装配或正式游戏品质已经验收。
