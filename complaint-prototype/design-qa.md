# 2026-09-29 本地文件点击失效修复

本节为最新验证结果。实际入口：Chrome 直接打开 `file:///Users/qiu/我的坚果云/微动/zuhu.html`。

- 复现：配置按钮点击后短暂改变地址，但列表持续重绘。控制台反复记录数据版本从2升级到3，业务revision同为62，页面渲染计数快速增加。此前仅验证HTTP入口，遗漏了用户同时打开旧版页面的情况。
- 根因：新旧脚本共用 `meiye.complaint.prototype.a.v1`，读数据时互相迁移、回写版本，通过storage事件形成重绘循环；配置编辑状态又被storage监听直接清空。
- 修复：新版独立使用 `.workflow3` 数据键，首次从旧键迁移工单、配置、草稿和身份；不回写旧键。其他窗口的工单更新不再关闭配置编辑页。独立任务在新标签页打开，保留PC工作台。
- Chrome本地文件实点通过：新建工单、返回、去办理打开指定审批任务、配置打开、审批流程与处理规则页签、审批节点设置与取消、全部工单范围、查看详情、添加记录弹窗与取消、跨菜单返回原配置页。没有对用户的示例审批作出审批结论，也没有清空本地数据。
- 截图：`../artifacts/complaint-local-create-fixed.png`、`../artifacts/complaint-local-approval-fixed.png`、`../artifacts/complaint-local-rules-fixed.png`。
- 自动回归：`node store.test.js`验证一次性迁移与50次旧版回写隔离；`ui-workflow.check.cjs`验证旧版/新版storage事件均不关闭配置页，并回归普通处理、服务履行、退款审批及财务核查至400回访结案的表单链路。
- 范围：上述为本次实际点击与自动回归范围；不代表所有移动真机和所有异常分支均已手工验收。

---

# 2026-09-29 统一办理流程 V3 验收补充

本节为最新结果；下方旧报告对应此前处理规则布局。

- PC列表与详情：已通过内置浏览器实际截图查看。列表展示环节、人员、节点与整单时限，详情展示紧凑流程条、三个时效指标、当前操作和责任记录。
- PC详情截图：`../artifacts/complaint-workflow-pc.png`。
- 表单交互：隔离DOM加载所有实际页面脚本验证PC/H5/独立审批与财务页面的提交、条件必填、持久化及回访闭环，未观察到脚本异常。详见 `ui-workflow.check.cjs`。
- 规则表单：保留此前参考式布局，合并“方案 / 客户意见”时限为“联系与处理”，说明起点、完成动作、审批后新段及交接不重置。
- 限制：浏览器点击接口在匹配到按钮后超时，AX点击与坐标点击也不可用；移动H5真机布局与真实浏览器完整操作仍未验收。不得把DOM测试当成真实钉钉验证。
- 本轮结果：业务逻辑及表单集成通过；PC列表 / 详情视觉已查看，移动视觉与浏览器点击验收部分受工具阻塞。

---

# 处理规则页签布局验收

日期：2026-09-29。

- source visual truth path: /var/folders/3b/65qk5bjd2nqcrwlrznvtt_8w0000gn/T/codex-clipboard-46c59353-dc8d-4018-b98d-147c276dd4eb.png
- 参考代码：/Users/qiu/我的坚果云/caesar-system/shared/approval-editor-page.css 的审批规则布局、approval-config.js 的 rulesForm。
- implementation URL: http://127.0.0.1:8765/complaint-prototype/index.html?view=pc&actor=manager#rules/scene-level-1/handling
- implementation screenshot path: unavailable
- viewport: 源图1380×644像素，实施页预览尺寸与像素密度无法可靠确认，未作归一化比较。
- state: 一级场景，处理规则页签；异常处理默认暂停，退款分支默认折叠。

## 修改范围与检查

左侧120px分组标题、右侧152px字段标签与控件；24px分组间距及分隔线。异常策略、重复审批改为原生单选项；选转交时展开备用职责，切回暂停时收起。时限采用数字输入加单位、浅灰说明，超时策略可就地展开选择。客诉既有规则保留，没有新增意见签名或参考产品专属的审批功能。

隔离DOM环境执行实际页面脚本，检查单选互斥、备用职责展开与收起、超时选项摘要同步且不失去展开状态、非法时限拒绝保存、选中值正确持久化、重新载入保留选项及数值；均通过。JavaScript语法检查与差异空白检查通过。

## 视觉证据与限制

- full-view comparison evidence: 缺少有效实施页截图，未完成同视口并排比较。
- focused region comparison evidence: 缺少有效实施页截图，未完成控件细节视觉比较。
- fonts/typography: 按参考14px正文、14px/600分组标题、12px辅助文字落实，尚无浏览器视觉证据。
- spacing/layout rhythm: 按参考120px/152px列宽、24px/16px间距落实；窄屏自动换行，视觉效果未验收。
- colors/tokens: 参考白底、#e7ebf0分隔线、#7b8494辅助文字、#1677ff选中态，视觉效果未验收。
- image quality: 目标区域只有表单和文字，无需新增图片素材。
- copy/content: 保留客诉语义、组织职责匹配以及现有规则值；未复制不适用的签名及审批权限开关。
- primary interactions tested: 已在隔离DOM环境验证上述表单行为，真实浏览器点击未验证。
- console errors checked: 隔离DOM环境无错误；真实浏览器控制台验收未完成。

## Findings

- [P2 / verification blocker] 内置浏览器在正确路由下仍返回旧列表状态，无法取得可信的当前页画面或执行点击；备用Chrome连接超时。不能据此确认最终布局符合截图。

## Comparison history

仅完成代码参照和表单交互检查，没有可用于判定视觉通过的比较轮次。

## Implementation checklist

- 已完成布局、原生单选、条件展开、节点超时编辑及序列化修正。
- 待浏览器恢复后，按源图尺寸检查布局、单选展开、滚动及保存交互，取得实施截图并比较。

final result: blocked
