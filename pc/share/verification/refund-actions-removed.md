# PC 退款页删除重试退款与要求转账

日期：2026-10-23。范围：`pc.html#refunds`，尤其是提现管理列表及共享退款详情抽屉。

- 删除“重试退款”“要求转账”的列表和详情操作，以及对应确认弹窗、提交函数、资格判断和 UB 导出入口。
- 原路失败提示改为“等待门店处理退款异常”；没有可用操作时不渲染空的“提现处理”分组。
- 保留失败原因、历史重试次数、原路请求、历史银行卡信息和操作记录。保留正常原路打款、已发起请求的回执处理、提现确认及人工转账完成确认。
- 沿用现有 ByForm、ByCommonInput、ByCommonSelector、ByTable、ByPager、ByDialog 及公共抽屉，没有新增组件或公共视觉规则。
- 同步 PC 规范及 HTML 阅读版；调整现有回归脚本，移除已删除操作的调用。门店 V3 的重试及转人工仍由原页面处理。

## 实际验收

在仅含构建后 `pc.html` 的独立临时目录启动本地预览，使用独立来源 `http://127.0.0.1:8743`，不操作用户原页面存储。

- 提现列表：6 条记录，两个原路失败记录只保留“查看”；正常记录保留门店补卡、确认已转账、确认提现及打款入口。
- 搜索“余额不足”并按 Enter 得到 1 条；打开并关闭详情后父级条件仍保留；重置恢复 6 条。
- 失败退款详情：失败原因、金额、审核、项目、订单和操作记录正常；两个删除的入口及空处理分组均不存在。
- 人工转账确认：实际打开 ByDialog，银行卡信息、取消及确认按钮可见；取消后记录仍为处理中。
- 确认提现：在隔离来源确认示例记录，操作由“确认提现”变为“打款”，验证保存正常。
- 查看 1920、1440、1280、1024 宽度布局并保存列表、详情和确认弹窗截图。未更改公共尺寸；本次未重新测量全部搜索宽度 / 状态组边界，也未覆盖所有三级表单草稿。
- 浏览器捕获的 error 日志为空。
- 分页未通过：退款管理点击“下一页”仍在第 1 页；该问题已在 `dialog-no-scrollbars.md` 的先前验收中记录，本次未涉及分页实现。

截图：`refund-actions-removed-list.png`、`refund-actions-removed-detail.png`、`refund-actions-retained-dialog.png`、`refund-actions-removed-1440.png`、`refund-actions-removed-1280.png`、`refund-actions-removed-1024.png`。

执行结果：

- `python3 pc/share/tools/build.py`：成功。
- `python3 pc/share/tools/render_spec.py`：成功。
- `node pc/share/verification/withdrawal-recovery.test.cjs`：15 项通过。
- `node v3/verification/v3-refund-flow.test.cjs`：44 项通过。
- `index.html` SHA-256 保持 `45e483c70130166c26783c0d81b8fca1e0e217967d0e012c060ed86caa239a3c`。
- 本次未写入 `v3.html`、`UI设计规范.md`、`UI设计规范.html`；工作区原有其他改动保留。验收过程中观察到 v3.html 存在并发变化，未覆盖。
