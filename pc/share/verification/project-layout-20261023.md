# 三个独立项目目录验收

2026年10月23日。本次只迁移目录、修正路径并按系统归档规范，不改变业务功能与 UI 视觉；尚未发布线上。

## 最终入口与维护位置

| 项目 | 仓库内入口 | 本项目源码与规范 |
| --- | --- | --- |
| PC | `pc/pc.html` | `pc/share/`、`pc/docs/` |
| 中台 | `zhongtai/zhongtai.html` | 入口内嵌源码、`zhongtai/docs/`、`zhongtai/tools/` |
| V3 | `v3/v3.html` | 入口内嵌源码、`v3/docs/`、`v3/tools/`、`v3/verification/` |

仓库根目录可见文件只有 `index.html` 与 `AGENTS.md`，另有三个项目文件夹。首页只改三个链接，继续在新标签打开。中台与 V3 的完整 HTML 与迁移前逐字节一致。PC 公共 CSS、组件及业务逻辑保持原样；修正 PC 源码中一处跨系统 V3 路径、构建输出与验收脚本路径。

## 检查结果

- 导航、规范、阅读版、历史验收文档和 BI 页的本地链接已核对；修复提现验收文档指向已迁走的 V3 验收记录。构建清单中 12 个当前资产均存在且 SHA-256 匹配。详见 [路径核对结果](./project-layout-20261023/link-audit.json)。
- 构建 6 组、浏览器路由及加载 22 项、投诉 25 项、提现恢复 15 项、V3 演示数据 8 项、V3 退款流程 54 项检查通过。移动与财务联动测试改为读取实际管理模块源码，不再从轻量 PC HTML 中截取业务脚本。
- 实测搜索 / 重置、分页、规则保存 / 取消、二级仲裁取消保留父级草稿、公司确认弹窗取消、床位规则页签草稿 / 保存 / 放弃、投诉详情。结果见 [交互记录](./project-layout-20261023/interaction-results.json)。
- 固定日期与随机种子，比较迁移前后 PC 规则、档案合并、退款、门店、投诉列表、投诉详情及中台、V3 首页，共 8 张截图逐像素一致；页面文字、控件样式和布局测量相同。实际查看列表、弹层及三个规范阅读版。
- 三个项目分别只复制运行文件到空目录后断网打开。PC 只携带 pc.html 与当前 share/dist 资产，退款 → 投诉 → 规则正常；中台投诉列表、内嵌客户档案合并、客诉工单、审批工作台正常；V3 退款记录与内嵌床位正常。没有 HTTP 资源请求、加载失败或脚本运行异常。
- 首页三个入口经实际鼠标点击均创建新标签，地址返回 HTTP 200，原首页保留；三个规范阅读版及其目录锚点均通过。见 [独立运行与导航记录](./project-layout-20261023/standalone-results.json)。

控件仍由原公共适配器接入：搜索 / 表单 → ByForm，输入 → ByCommonInput，选择 → ByCommonSelector，表格 → ByTable，分页 → ByPager，确认弹窗 → ByDialog。本次未引入新组件或变更公共尺寸。

## 截图与发布边界

[PC 退款列表](./project-layout-20261023/after-refunds.png)、[公司确认弹窗](./project-layout-20261023/company-confirmation.png)、[投诉详情](./project-layout-20261023/after-detail.png)。中台与 V3 截图分别在各自项目的 `verification/project-layout-20261023/`；完整迁移前后对照保存在本地临时目录 `/tmp/weid-independent-projects/`。

PC 入口 8,928 字节，当前资产 12 个，共享 gzip 1,355,623 字节；目录变化没有增加公共运行依赖，不将改名当作网络提速。发布需提交三个完整项目目录及首页链接。正式地址变为 `/pc/pc.html`、`/zhongtai/zhongtai.html`、`/v3/v3.html`；旧根目录地址没有实体入口，若需兼容旧收藏需另设托管跳转。当前没有活动的 vercel.json，也未声称线上缓存策略已改变。
