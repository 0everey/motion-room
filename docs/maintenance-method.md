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

先验证源码/合同，核当前用户的工具停用边界，再用当前获准的真实浏览器走核心路径，亲看完整界面和连续动作。下载读取落盘字节，复制读实际值；截图证画面，不代Root过程/相机稳定或资源身份。一个正常例不足以覆盖取消：加“甲pending → 清理或选乙 → 甲迟到”与正常乙对照。旧浏览器自然SW更新、旧配方、离线新文档与本地服务正常退出各按对应关系核。

按变化选择检查：本次改模型/相机就查真实映射、固定矩阵与完整动作；只改文案不重源parser；新证据推翻方法才改路，不能因为已经投入就堆补丁。未验证的平台/型号/UE编辑器导入结果明确保未验，不用网站能播冒游戏成品。

## 主题和功能分区的维护

默认主题在studio.css一个连续的主题段维护，color-scheme同时声明给原生控件，HTML theme-color对应外壳。区域色表达职责：筛选青蓝、预览深蓝、取用详情紫、播放偏暖，主动作再用精看青/下载绿/路径紫/收藏金；类别与A/B/Mix有自己的语义，不沿区域色覆盖其身份。

改主题时覆盖普通/hover/focus/active/selected/disabled，以及原生下拉、更多菜单、JSON弹窗和高级区，避免暗背景中留下浅色岛或旧暗字。实际混色/透明度后的必要文本核对比；搜索有focus-within，不能因input outline:none丢焦点。主题不改尺寸/点击范围/模型材质；亲看完整默认与关键状态、窄屏核心取用，继承未变动作/数据证据。更新SW版本并经原投影发布，离线包同步同一壳。

## 动作部位辨识色

UE4模型的bodyColors在character profile中声明palette与骨分支根。加载基础模型时按每顶点四路蒙皮权重在线性RGB混色，颜色跟随原蒙皮运输；不用世界位置/屏幕左右分类，避免角色转身或交叉时换色。躯干中性，头与左右肢体分别识别；混合节点/实例的标签色保留，但不再给该材质整身染色覆盖部位色。

该模型仍用原网格/骨骼/权重/原件hash，基础共享geometry仅替换一次color属性；actor复用它，材质按原owner分别归还。RGBA16白属性替为Float32RGB时每模板净增约93KB，不增mesh/material/drawcall数；不要声称零成本或为改色重烤全动作。核独立骨branch/顶点色/释放后，实际看交叉、背身和小墙的可辨改善，不能仅RGB表认证效果。

## 后台加载与模型朝向

加载不能把整页已就绪内容遮掉：原stage状态栏报进度，空/错误提示用无挡的小状态；网络loaded、固定取景ready、实际rendered分别处理。每actor按自己真实节点叶依赖决定能否绘制，保原slot；不能因某个长片准备而全canvas清空。暂停动画时后台准备仍调度，clear/换页代次和缓存真值继续原合同，MotionSession提交前phase护栏不能删除。

头部朝向按真实rest轴。UE4 head局部+X向上、-Y向前，不能沿通用头骨+Y假设重定向；profile明确headAimAxis，再把头部正脸色投影在head bind-local空间，通过原蒙皮运输。眼鼻嘴只修改原共享color，不增纹理/mesh或改骨/位置；背面不画同脸，正侧背实际图和转头过程分别核。旧颜色分支/原动作/Root不因此重做。

## 用户原包角色与AI探查

优香入口位于设置页“导入优香ZIP”，当前接受作者的Yuuka_Hayase1_0_rev2.zip（1.0 rev2），9,392,148字节，SHA256 f4ac2e7340a8806cfa52a8ba7e298db5bf440ac201e08dc3680a58d9282e917d。用户本人从原作者取得后，在自己的浏览器导入；原件不上传、不进本站或离线分发包，分享工作区也不携带模型。清理预览缓存后须重新导入。作者和官方规则入口在credits.txt及角色source中，不能把免费、个人使用或代码分发冒模型二配授权。

CLI AI与用户共用原File输入yuukaFile；当前获准浏览器工具可将用户明确提供的真实文件交该输入，或对已获得的File调用await motionWorkbench.importCharacter(file)。不向JSON粘贴模型字节、Blob地址、本机绝对路径或凭据。原workspace v2只保存browse.character='yuuka'等稳定身份，另一浏览器第一次打开同配方仍需自己导入该原包。

原报告character.expectedSource是目标身份，character.source.verifiedSha256只在完整原包校验、真实骨架和贴图加载完成后存在。优香应为174骨、40材质、37个带图材质、7个独立漫反射图片与7个原包人物图片；可莉是238骨、12个带图材质、4个独立漫反射图片与6个原包图片（另含matcap/toon）。不要把材质引用数当原图数。

modelImport只描述最近一次导入动作。坏包被拒时此前有效角色可继续可看，应结合rendering.modelReady/framingReady、当前renderedActors、实际source、rendererError与当前组合cache判定；不能由modelImport.error单独推出当前画面丢失。cached与ready也不等于整库离线。真实断网新文档要核页面和实际控制Worker都断网、两端HTTPcache禁用、当前配方/source/root/解析依赖均完整。

固定PMX解析代码随页面壳安装，模型原包留在原preview预算和清理epoch内；不要迁入第二缓存库。角色切换或较新导入取消旧页面采用，先前显式同身份导入可完成本机保存；清理才使旧保存与回复失效。优香保原map透明标记、diffuse/side/opacity与无图颜色，实例染色从原baseColor开始；MMD物理、IK/grant、专用枪外亲与正式接触仍未启用或验收。


## 骑行、乘坐集合与实体手持

原Mixamo主索引与2446原件保持。网页新增10个外来骑行take，存真实MVP2原P/Q/rest/时间、原始骨名及已核语义别名；data/riding-catalog.json是明确登记，data/collections.json保乘坐集合及来源判据。乘坐是跨原类别集合，不重复计成新增动作。data/catalog.json整合后为2456个不同ID，分类里有骑行10与乘坐127。

用真实不同骨架逐家族适配，不按一马样外推自行车/摩托。prepare_riding_preview.py复用原pack与原parser，保原源文件SHA、take与时基；摩托保存原GLB关键时间并集，24仅导入换算时基。人物显示只对该三家族采用实际腿链与固定整段脚部参考，避免沿用Mixamo绝对髋高假设；原MVP世界P/Q不因此重写，也不逐帧贴地。未认证车马接触。

prepare_held_items.py保真实模型几何/材质，归一化握点及轴：剑刃+Y、枪管+Z。held-items.js是源身份/比例与目标语义手掌装配入口；角色原手骨rest决定局部socket，完整逆骨矩阵补偿可莉PMX尺度。renderer独占模板和异步代次，actor共享几何/纹理、各自材料与骨架；换物、换角色或清理时先移除实例再归还模板。不要给模型贴文字代真实物品，也不要每帧新解析GLB。

M416的物品局部yaw为+π/2，将枪管+Z对到手掌wrist→middle的+X；不能用公共socket迁就单一武器。Rifle Aiming Idle须实际正/侧及动态核枪口、枪托、主握柄，parent关系或掌点零误差不代用途正确。同片None→M416→大剑→None的cacheTicket含heldItem/heldGeneration/装配就绪状态，离线标识需依赖集合及实际就绪共同成立。

首次HTTPS安装可能慢于15秒界面提示。cache-client监听真实同源sw.js的controllerchange，在壳完整安装并接管后自动恢复可用状态；超时提示不能把后到激活永久遗失。SHELL以最多4路并发安装，仍须全部成功才激活，shellReady与实际组合依赖不放宽。用真实延迟壳请求跨15秒、无需retry自动恢复，再断网新文档证明后继；本地快装不能替慢网路径。

离线精看只需要该精看的实际依赖。重开时无关main混合配方可能未缓存，失败不得把已缓存的detail强制改成未缓存wall；保原detail恢复并单独验证其真缺件。原mix自身失败仍按既有提示回墙，不用多缓存无关动作掩盖责任错误。

## 目录先行与当前目标优先（2026-11-01）

workbench.html先加载无Three/PMX依赖的library-entry.js。data/navigation.json绑定同版本紧凑gzip检索索引与每16条一份的内容寻址详情；完整分类、别名/拼音/原件SHA检索及分页先可用，目录实际绘制后才动态接studio.js。SDK迟到或失败不移除目录，接管采用当时最新筛选/选中/分享意图；当前来源详情、路径复制和原件取用也由轻入口提供。未到的模型只标加载，不以目录卡片冒三维预览就绪。

唯一维护目录仍为data/catalog.json。改目录后用python -X utf8 tools/build_catalog_navigation.py --ui web-preview更新本地派生；正式export_herta_public.py每次从已校验的公开白名单目录生成同版navigation/分片，不照抄可能过期的本地派生。不要编辑分片或改变既有动作SHA。publisher保旧内容寻址索引和详情供仍存活客户端，不把私库路径/原模型ZIP混入发布。

resource-queue.js统一页面正文传输和解码调度。网络最多4个完整正文，低优先最多占3槽、后台最多1槽；新显式目标可中止较低优先在途正文并重新排队，待实际取消结束才释放槽。共享URL按所有活跃消费者的最高优先级，退出一个不误杀另一个；上次选中的提升票退出后仍有页内消费者则降为可见队列。解码最多1份；不可中止的GLTF底层解析持槽到结束，若已失去消费者则归还几何/材质/纹理，不冒取消即停止。网络原字节LRU上限16MB；各视图解码仍归原Bank192MB、main/detail各96MB，诊断memory给去重合计，不另持无界解码缓存。ready条目不会因重排重复下载。

默认或保存的main混合配方在非mix视图只保存配置，进入mix才读其真实输入；detail/分享/工作区载入不被无关默认A/B阻塞。详情和配方仍逐项验证同库版本、原件、variant SHA与Native根身份，缺片/失败可重试，不放宽成占位成功。

SW r21安装只建立版本缓存，不自行下载全壳或完整catalog。fetch不clone/drain用户已取消的正文；页面后台队列把完整资源交STORE_RESOURCE，按实际epoch/version与原pinned规则存储。当前前台动作先于离线壳；shellReady/currentCombination/offlineReady仍由完整真实依赖决定。旧SW自然升级，不skipWaiting；旧标签尚占用旧协议时在线可继续，须关旧标签后自然接新版离线能力。清理/换意图取消页面后台任务，旧代次不能回存。

必要回归包括：SDK/旧完整目录阻塞时完整导航和真实搜索/分享先行；四个长正文已发头未结束时点第五片，观察实际network start、目标像素、低优先取消和恢复；共享A退出B继续、零消费者退出、ready不重载、清空迟到不复活；复制路径在延迟详情跨入口接管后恢复；当前组合断网新document仍可看。耗时记录注明本机/传输条件，不能宣称任意线路绝对即时。

静态道具纳入同一skinBounds与全段固定取景；插值余量只核实际驱动目标的映射骨，未映射配件旋转不扩大镜头。原图/正侧背与多个时刻检查握点、剑尖/枪托可见，不能仅parent关系或一张静态图宣布所有动作接触自然。选择器在预览主区，骨架速览选择实体时切人物模式，保存/分享仍用稳定heldItem枚举。

新外源原件走具名external-riding描述，真实DAE/FBX/GLB类型、作者、许可、SHA、字节与take保留。public exporter只允许登记的10项和受限assets/riding-originals路径；原Mixamo的固定repo/commit与clips/*.fbx检查不放宽。两个道具的内容hash模型也逐项白名单。可莉继续浏览器从官方pinned ZIP直接取得，不复制其原包到发布目录。

adopt_website_features.py把已核骑行/道具产物接到作者目录，不重烤2446；修改算法用新候选输出，保旧receipt和失败。refresh_preview_metadata.py对原Mixamo精确ID集合刷新，同时严格核旁路骑行登记/原件/变体并保其元数据和乘坐集合计数。公开与旧内容hash回收仍走原publisher，别直接改docs。依当前选择核SW/道具/角色/动作依赖与真实断网消费者；完整包离线和仅缓存当前内容分开声明。
