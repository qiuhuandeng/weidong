# Design QA

## Comparison Target

- Source visual truth path: conversation attachments from 2026-09-01, including the user's latest hierarchy request and the earlier Figure 2/Figure 3 layout references. The chat attachment system does not expose a local filesystem path.
- Source pixel dimensions: source screenshots were displayed by the chat client at 1750 x 350, 2048 x 503, 2048 x 614, and 2048 x 485 where applicable.
- Implementation path: `zuhu.html`.
- Primary implementation screenshots: `/tmp/zuhu-service-sync-under-title-aligned.png`, `/tmp/zuhu-content-header-wechat-final.png`, `/tmp/zuhu-query-card-opening-script.png`, `/tmp/zuhu-opening-rule-package.png`, `/tmp/zuhu-opening-safety-package.png`, `/tmp/zuhu-opening-package-picker-initial.png`, `/tmp/zuhu-opening-package-picker.png`, `/tmp/zuhu-opening-mode-package.png`, `/tmp/zuhu-opening-mode-smart.png`, `/tmp/zuhu-opening-mode-confirm-retain-tabs.png`, `/tmp/zuhu-opening-mode-all-tabs.png`, `/tmp/zuhu-opening-mode-order.png`, `/tmp/zuhu-query-card-conversion-follow.png`, `/tmp/zuhu-conversion-query-left-aligned.png`, `/tmp/zuhu-compact-transfer.png`, `/tmp/zuhu-knowledge-category.png`, `/tmp/zuhu-compact-wechat-record.png`, `/tmp/zuhu-compact-wechat-schedule.png`, `/tmp/zuhu-compact-wechat-result.png`, `/tmp/zuhu-query-card-ai-intent.png`, `/tmp/zuhu-wechat-record-plan.png`, `/tmp/zuhu-wechat-schedule-multi.png`, `/tmp/zuhu-wechat-shift-list-switch.png`, `/tmp/zuhu-wechat-shift-drawer-fixed.png`, `/tmp/zuhu-wechat-level-drawer-no-footer-note.png`, `/tmp/zuhu-wechat-package-drawer.png`, `/tmp/zuhu-wechat-grade-modal.png`, `/tmp/zuhu-wechat-grade-modal-inline.png`, `/tmp/zuhu-wechat-attendance-drawer.png`, `/tmp/zuhu-wechat-add-package-drawer-final.png`, `/tmp/zuhu-wechat-custom-rule-modal.png`, `/tmp/zuhu-wechat-safety-modal.png`, `/tmp/zuhu-wechat-safety-range-dropdown.png`.
- Viewport: 1440 x 900 CSS px, device scale factor 1. Responsive structure was also checked at 1024 x 768 CSS px.
- State: authenticated desktop admin shell; affected menus and representative top-level/nested tabs were activated in turn.
- Density normalization: source references were used for hierarchy, rhythm, and component proportions rather than literal pixel scaling because the chat client resized source images. Implementation screenshots were captured at 1x density.

## Full-View Comparison Evidence

- The implemented hierarchy is now page title, then a dedicated query card, then a content card.
- Pages with tabs place the active tab set and its corresponding search/filter controls in the same upper card.
- Pages without tabs render an independent upper search/filter card.
- Lower content cards keep the list title on the left and page-level actions on the right; content-card headers no longer contain search filters.
- Query-card search conditions are left-aligned from the card's inner padding; only lower content-card action groups remain right-aligned.
- Lower content-card headers now hide secondary gray descriptions and use a lighter 60-61 px single-line visual rhythm.
- Lower content-card action buttons are normalized to 32 px height, 13 px type, 6 px radius, and tighter horizontal padding.
- The new structure is global for the modified list pages: customer service, WeChat rules, opening scripts, conversion strategy, transfer rules, knowledge base, and AI decision list states.

## Focused Region Comparison Evidence

- Customer service: the `最近同步` status line now sits directly below the page title/description and above the query card; the lower card header keeps `客服号列表` with sync and batch actions aligned on the right.
- WeChat personnel levels: `等级规则` no longer shows the gray subtitle in the content-card header; the create button matches the global action-button size.
- Opening scripts: the upper card contains the tab row plus six search conditions in a consistent 36 px control row; the lower list card has `线上客服规则列表` and the create/config actions only.
- Opening scripts: a page-level allocation-mode switch was added beside the page title. All four tabs stay visible so both allocation configurations can be prepared in advance; the switch only controls which allocation strategy is currently effective, and switching requires confirmation.
- Opening scripts: a new `规则分配` tab was added; its query card contains package keyword, status, query, and reset controls, while the content card contains the rule package table and `新增话术包` action.
- Opening scripts: the `新增话术包` action opens a right-side drawer with package name, intent category, an always-expanded SOP picker, and an always-expanded WeCom-account picker; both pickers support search, multi-select, selected counts, and compact list rows.
- Opening scripts: switching the intent category from `S10` to `S10N` refreshes the SOP picker from `王星策略...` rows to `加微客户...` / `从江策略...` rows without changing the WeCom picker.
- Opening scripts: a new `安全包` tab was added after `规则分配`; its query card contains safety-package keyword, status, query, and reset controls, while the content card contains the empty safety package table and pagination.
- Conversion strategy: the upper card groups tabs with search/status filters; `卡点跟进` and its batch/create buttons sit in the content-card header.
- Conversion strategy: the tab-level search row starts at the left side of the query card instead of floating to the right.
- Transfer rules: keyword search, rule-type dropdown, and query button sit in the query card; `新建规则` remains the primary content action.
- Knowledge base: all three tabs keep only the tab row in the upper card; tab-specific search/filter controls were removed.
- WeChat records: the active query card now includes plan date, consultant, WeChat package, attendance status, shift, plan status, and query; field labels are hidden in the query card.
- WeChat records: the list content now follows the consultant plan configuration reference, with row selection, level, department, attendance/shift, daily/monthly progress, package ownership, plan status, and setup actions.
- WeChat schedule: a new `排班计划` tab was added before `加微包`; its query card contains start/end date inputs, date shortcuts, consultant, attendance status, shift, query, and reset, with field labels hidden and the roster table in the content card below.
- WeChat schedule: content-card actions now include `从旧系统同步` and `批量排班`; the table renders multiple date columns for the selected date range.
- WeChat shift settings: the add/edit drawer contains only shift name, shift type, start time, and end time; status moved to a list-row switch.
- WeChat record package settings: the `设置规则包` action opens a drawer with `添加规则包` and `移除规则包`, plus a dropdown multi-select for multiple WeChat packages.
- WeChat record custom rules: the `规则自定义` action opens a compact modal for start date, end date, and custom target quantity.
- WeChat record grade settings: the `设置等级` action opens a centered modal with `na`, `nb`, and `ns`; gray descriptions were removed and each grade displays its daily and monthly upper limits on the same line as the grade name.
- WeChat attendance: the `新增假勤` action opens a drawer with employee, shift, special status, start date, and end date fields.
- WeChat add package: the `新增加微包` action opens a drawer with rule-package name, intent category options `S10`, `S10N`, and `K10`, plus a single-select safety package section.
- WeChat safety packages: the safety package table uses package name, enable switch, created time, updated time, and plain-text operations.
- WeChat safety packages: the `新增安全包` action opens a compact modal with safety package name, effective mode, and effective scope; both customer-service-account and WeChat-package scopes use searchable multi-select dropdowns.
- WeChat distribution results: the content-card action area no longer includes `导出结果`.
- Drawers: WeChat drawer close buttons are aligned to the top-right of the drawer header, and drawer footer helper text is hidden globally for drawer footers.
- WeChat distribution results: the query card now includes distribution time shortcuts, customer, assigned consultant, intent category, actual package type, reset, and query; field labels are hidden in the query card.
- AI decision: primary tabs and the active nested tab set share the query card when relevant; list/config actions remain in the lower card header.

## Required Fidelity Surfaces

- Fonts and typography: passed. Page titles stay at 22/30 weight 700; content-card titles use 16/24 weight 700; controls and table text use 13 px with zero letter spacing.
- Spacing and layout rhythm: passed. Query cards use 12 x 24 px body padding, 50 px tab baseline, 14 px gap to content cards, 60-61 px content headers, 36 px query controls, 32 px content action buttons, and 8 px filter/action gaps.
- Colors and visual tokens: passed. Existing product blue, white cards, neutral borders, muted text, and light table headers are preserved.
- Image quality and asset fidelity: not applicable. These admin list pages do not introduce or replace raster imagery or branded visual assets.
- Copy and content: passed. Existing page titles, tab labels, filter labels, and operation labels are preserved; only hierarchy and grouping changed.
- Accessibility and interaction: passed for the scoped flow. Tab clicks and page switches were exercised; query cards sync to the active pane; focus styles remain present; no horizontal overflow was detected.

## Automated Checks

- Script syntax check: passed, one inline script block parsed successfully after the latest WeChat/transfer/knowledge updates.
- `git diff --check -- zuhu.html design-qa.md`: passed.
- Desktop layout pass: representative states checked at 1440 x 900; no body overflow; content toolbar filter count is 0 in checked states.
- Knowledge tab pass: category, matrix, and content tabs each report 0 active query filters.
- WeChat schedule pass: the query controls fit on one row at 1440 x 900; the empty attendance dot measures 7 x 7 px after removing the conflicting global `.empty` class.
- Search-label pass: WeChat record, schedule, result, and transfer query cards were checked at 1440 x 900; every `.unified-filter-label` inside query cards reports `display:none`.
- Opening-allocation-mode pass: default mode is `package`; the allocation switch renders left-to-right as `规则+安全包` then `智能分配`, with `规则+安全包` active by default; all four tabs `话术列表`, `智能分配`, `规则分配`, and `安全包` display; active pane remains whichever tab the user selected instead of being forced by mode.
- Opening-allocation-mode layout pass: the mode switch measures 184 x 38 px at 1440 x 900 and does not create horizontal overflow.
- Opening-allocation-confirm pass: clicking `智能分配` while `规则+安全包` is active opens a centered confirmation modal and leaves the page mode unchanged; the modal target text is `智能分配`, and the copy reads `切换后，当前生效的分配逻辑会停止生效，另一套会立即接管；两套配置都会保留。`
- Opening-allocation-confirm cancel/confirm pass: cancel closes the modal and preserves `规则+安全包`; confirming closes the modal, switches the effective mode to `smart`, keeps the current active tab/pane unchanged, and leaves all four tabs visible.
- Opening-rule-package pass: all four opening-script tabs stay visible; the rule package query controls are in the upper query card; the content-card title is `规则分配`; table headers match the requested package allocation list and render 2 rows without horizontal overflow at 1440 x 900.
- Opening-package-picker pass: the new package drawer is visible, right-aligned, and has its close button 22 px from the drawer right edge; the old dropdown menu count is 0; SOP and WeCom are rendered as two always-expanded picker panels measuring 290 x 275 px each.
- Opening-package-picker interaction pass: default selected SOP/WeCom counts are 0; `S10` renders three SOP rows, changing to `S10N` renders `加微客户-微动 副本`, `从江策略5 副本`, and `从江策略1 副本`; SOP search `从江` and WeCom search `白` filter correctly and update selected-count text after checking one result.
- Opening-safety-package pass: all four opening-script tabs stay visible; the safety query controls are in the upper query card; the content-card title is `安全包`; table headers are `安全包名称 / ID`, `意向项目`, `兜底指标`, `启用状态`, `更新时间`, and `操作`; the empty state reads `暂无符合条件的安全包`; total is `共 0 条`; no horizontal overflow at 1440 x 900.
- Compact-query pass: active query inputs, selects, and query buttons measure 36 px high; the representative single-row query cards measure 60-62 px high.
- Customer-service sync pass: the status line is a direct child below `.page-header`, aligns to the page title x-coordinate, and no longer exists inside the list panel.
- Responsive pass: the same 12 states checked at 1024 x 768; no horizontal overflow; query-card heights stayed within expected wrapped-control ranges.
- Content-header pass: representative content-card headers checked at 1440 x 900; visible gray subtitle count is 0; all visible header action buttons measured 32 px high.
- Query-left-align pass: conversion strategy query controls start 25 px from the query-card left edge; `.unified-query-body`, `.unified-query-pane`, and `.unified-toolbar-filters` all compute to `justify-content:flex-start`.
- Drawer-footer pass: WeChat personnel-level drawer footer note reports `display:none`; visible footer text is only cancel/save actions.
- Shift-drawer pass: close button is 22 px from the drawer right edge; fields are `班次名称`, `班次类型`, `开始时间`, and `结束时间`; no status field exists.
- Shift-list pass: the shift list contains one standard `.switch` status control and no separate `禁用` action.
- WeChat record-plan pass: active record tab headers match the consultant configuration table, including row selection, employee level, progress, package ownership, plan status, and operation columns.
- WeChat schedule-multi-date pass: active schedule tab shows two date inputs in the query card, three date columns in the table, and the `从旧系统同步` / `批量排班` content actions.
- Record-package-drawer pass: title is `设置加微规则包`; operation radios report `add:true` and `remove:false`; the dropdown contains four package options and supports multiple checked values; close button is 22 px from the drawer right edge.
- Record-grade-modal pass: modal is visible and centered; grade cards render `na`, `nb`, and `ns` with daily/monthly limits; modal footer contains only cancel/save actions.
- Record-grade-inline pass: `smallCount` is 0; option text is `na 日 150 月 2000`, `nb 日 100 月 2000`, and `ns 日 200 月 3000`; card heights are 52 px and grade/limit vertical top delta is 1 px.
- Attendance-drawer pass: fields are `员工`, `班次`, `特殊状态`, `起始日期`, and `结束日期`; shift options include `早班`, `中班`, `晚班`, and `全天班`; special status includes `休息`.
- Add-package-drawer pass: fields are `规则包名称` and `选择意向分类`; category options are `S10`, `S10N`, and `K10`; safety package selection is a single `select` dropdown with `不绑定安全包` selected by default; close icon renders as `×` and sits 22 px from the drawer right edge.
- Custom-rule-modal pass: the record tab `规则自定义` action opens a modal with `开始日期`, `结束日期`, and `自定义目标数量`; target quantity uses numeric text input and save validation.
- Safety-package-list pass: table headers are `安全包名称`, `启用`, `创建时间`, `更新时间`, and `操作`; list rows contain two standard switch controls; first row operations are `查看`, `编辑`, and `删除` with no icons.
- Safety-package-modal pass: `新增安全包` opens a modal with `安全包名称`, `选择生效方式`, and `生效范围`; both `按客服号选择` and `按加微包选择` reveal searchable multi-select dropdowns, and the old checkbox-card grid count is 0.
- Distribution-result-actions pass: no button with text `导出结果` exists in the distribution result pane.

## Findings

- No actionable P0, P1, or P2 visual mismatch remains in the affected list-page scope.

## Follow-up Polish

- P3: the local preview still reports a harmless missing `favicon.ico` request; this is unrelated to the list layout.

final result: passed
