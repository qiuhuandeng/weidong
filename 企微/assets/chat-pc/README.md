# 聊天 PC 本地样式

`聊天pc.html` 使用此目录下的 CSS 与图标字体，不再在浏览器内通过 CDN 编译 Tailwind。

- Tailwind CSS：3.4.17（与原 CDN 版本一致）；保留原主题配置。
- Phosphor Icons：2.1.2，仅保留页面使用的 regular、fill 字重，字体使用 WOFF2。许可证随资源保留。
- Google Fonts 与头像图片仍可在线加载；字体不可用时使用系统字体，布局及图标不依赖外网。

新增或修改 Tailwind 类名后，在仓库根目录重新生成并提交 `tailwind.css`：

```sh
npx --yes tailwindcss@3.4.17 --config weixin/assets/chat-pc/tailwind.config.cjs --input weixin/assets/chat-pc/tailwind.input.css --output weixin/assets/chat-pc/tailwind.css --minify
```

扫描范围包含页面内联 JavaScript，动态状态应使用完整类名，不要拼接类名片段。
