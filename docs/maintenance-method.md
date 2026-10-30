# 面向资源取用的网页工作台维护方法

适用于动作、模型、贴图、材质或音效等“先找、再看、再取用”的资源库。这里总结本动作库已经采用的作者与交付关系，不能把动画特有的骨架/根轨迹能力套到其它资源。

## 从用户动作决定默认页

先列一条真实路径：搜索/分类过滤 → 同时比较 → 单项精看 → 复制原路径或下载。默认页的按钮必须服务这条路径。诊断、版本分支、复杂编排和工具输出进入明确的高级工作区；核心操作不能为了工具内部分类来回切换。用真实长名称和内容数量验证主次，少按钮不等于删掉必要结果。

本库作者是web-preview/workbench.html、studio.css、studio.js；library-browser.js负责搜索/原件描述/下载，motion-wall.js负责按页批量预览，motion-session.js保高级配方。新资源库保留这一职责分离即可，不需要照抄所有动画节点和根曲线页。

## 原件、目录、预览分别有唯一身份

原件保id、相对path、sha256、bytes；目录提供名称/分类/标签和可搜索内容；预览只保从哪个原件/版本生成、自己的内容SHA/格式/依赖。绝对本机路径和私库认证不进公开目录。

本库originalSource关联独立motion-animation-sources固定commit，variant描述MVP2预览；Native另绑原Avatar/clip及Root身份。换作贴图时，原PNG/EXR是原件、缩略图是预览；模型原FBX/Blend与GLB分开；音频原WAV和压缩试听分开。禁止把下载预览文件改后缀冒原件。

复制路径只给真实原库相对路径，页面明确不是访问者电脑的绝对路径。完整来源可以另外复制固定commit URL与SHA。下载从固定版本读取，核长度与SHA后保存；临时网络错误给可重试反馈，不用成功弹窗代实际落盘。

## 按需预览和真实缓存状态

目录全量可检索，二进制按当前页有限并发加载；翻页/取消/清理以generation拒迟到，内存LRU有明确预算。原件下载只在用户点击时发生，不以“本地”名义要求先下载几百MB才能看网页。

本库MotionBank预算192MiB/并发4，MotionSession高级配方保自己的96MiB/8实例边界，不能把两个上限随意统一。资源换类时按真实解码成本设预算：纹理看显存/分辨率，模型看网格/骨骼，音频看时长/解码PCM；压缩文件小不代表运行占用小。

离线可用必须绑定“当前项目 + 当前模式 + 所有当前依赖”且它们确已缓存。切项加载中不能沿上次offlineReady；模型/材质迟到就绪后需重新登记依赖。清理先使当前请求失效，再归还实例/GPU/缓存，晚到不能复活它。高级setRecipe返回false必须由上层动作继续传播，不能取消后仍跳模式或加载模型。

## 呈现适配由资源类型承担

默认预览材质/背景让人判断资源本身。动作白模的模型名、骨名、rest、单位、材质和模型版本放character profile；真实源姿态仍由同一solver驱动，不为换预览角色重烤所有原动作。

固定相机与根运动是两件事。固定取景按整段目标几何范围，播放/seek不按当前姿态重新拟镜头；用户旋转/缩放/复位才改变观察意图。Root Motion开关要让地面相对位移可见，同时区别Source髋轨迹与Native真实实测根，不能把网页位移说成原FBX新增UE root骨。批量原地墙的Root入口直接精看选中项，避免按钮显示开启但墙里仍去位移。

模型库可用固定模型包围和材质灯光，贴图库用平铺/缩放对照，音频库用正常音量试听/波形/循环区间；这些适配留专用模块，不能强接骨架协议或伪造同样能力。

## 本库的可执行维护入口

- 查目录/原件：python -X utf8 tools/query_zh.py "跑步" --limit 10。
- 新Source：tools/prepare_all_source.py只补目录缺项，在新输出分片；tools/adopt_full_source.py先核source/hash/时基/真实mvp parser，后采用目录。不需为改UI重新跑Blender/Unity/全部2446。
- 换UE4预览模型：现有Blender -b -t 2 --python tools/prepare_ue4_preview.py -- <具名源FBX> <新输出目录>。原文件保持不改，生产receipt记录sourceSHA/新GLBSHA/骨数/单位，随后把实际版本接character.js的profile并核四肢/手指/Root/固定取景；公开先有来源与许可依据。
- 公开应用：python -X utf8 tools/publish_motion_pages.py --checkout <motion-room公开checkout> --projection <新干净输出> --receipt <新记录> --push。export_herta_public.py是白名单作者；更新模块/模型依赖时同步白名单、character模块和SW版本，保旧hash供旧访客。
- 完整离线包：python -X utf8 tools/package_motion_offline.py --checkout <已核公开checkout> --output <新交付目录>。包只含公开投影/启动器/来源清单，不包含浏览器profile、日志、私库或凭据。默认保原已交ZIP。

## 一个维护例：增加搜索别名

在index/customizations.json沿原字段维护一个真实动作的aliases（数组），然后执行：

```powershell
python -X utf8 tools/build_index.py
python -X utf8 tools/refresh_preview_metadata.py --receipt <新的元数据采用记录.json>
python -X utf8 tools/query_zh.py "新增别名" --limit 10
```

第二步是网页元数据唯一刷新入口：先核index与preview的完整ID集合、原path/SHA/Mixamo身份，再仅更新中文名/分类/检索文本/拼音/姿态等元数据，原子写目录；variants、Native/Root、原件path/hash和公开源commit全部保持。它不重烘/重新adopt任何MVP。验证原别名/新增别名都定位同一id，复制路径和下载SHA仍同原件；无结果重置/真实分页不变。仅改搜索不应触发全源烘焙或角色制作。

换材质/模型时同理：变的派生和依赖重新生成、受影响消费者重验，原件身份与未改派生有据复用；不要为验收报告数量重打包全库。记录当前源、生成入口、采用版本、实际交付和未闭，下一维护者才知道应改哪里。

## 交付验证和改法依据

先验证源码/合同，再用WAB真实浏览器走核心路径，亲看完整界面和连续动作。下载读取落盘字节，复制读实际值；截图证画面，不代Root过程/相机稳定或资源身份。一个正常例不足以覆盖取消：加“甲pending → 清理或选乙 → 甲迟到”与正常乙对照。旧浏览器自然SW更新、旧配方、离线新文档与本地服务正常退出各按对应关系核。

按变化选择检查：本次改模型/相机就查真实映射、固定矩阵与完整动作；只改文案不重源parser；新证据推翻方法才改路，不能因为已经投入就堆补丁。未验证的平台/型号/UE编辑器导入结果明确保未验，不用网站能播冒游戏成品。

## 主题和功能分区的维护

默认主题在studio.css一个连续的主题段维护，color-scheme同时声明给原生控件，HTML theme-color对应外壳。区域色表达职责：筛选青蓝、预览深蓝、取用详情紫、播放偏暖，主动作再用精看青/下载绿/路径紫/收藏金；类别与A/B/Mix有自己的语义，不沿区域色覆盖其身份。

改主题时覆盖普通/hover/focus/active/selected/disabled，以及原生下拉、更多菜单、JSON弹窗和高级区，避免暗背景中留下浅色岛或旧暗字。实际混色/透明度后的必要文本核对比；搜索有focus-within，不能因input outline:none丢焦点。主题不改尺寸/点击范围/模型材质；亲看完整默认与关键状态、窄屏核心取用，继承未变动作/数据证据。更新SW版本并经原投影发布，离线包同步同一壳。
