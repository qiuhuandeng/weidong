// 与页面原 CDN 配置保持一致；扫描 HTML 及内联 JavaScript 中的完整类名。
const config = {
            theme: {
                extend: {
                    fontFamily: {
                        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'PingFang SC', 'Microsoft YaHei', 'sans-serif']
                    },
                    colors: {
                        primary: {
                            50: '#eff6ff',
                            100: '#dbeafe',
                            200: '#bfdbfe',
                            300: '#93c5fd',
                            400: '#60a5fa',
                            500: '#3b82f6',
                            600: '#2563eb',
                            700: '#1d4ed8'
                        },
                        surface: {
                            50: '#f8fafc',
                            100: '#f1f5f9',
                            200: '#e2e8f0',
                            300: '#cbd5e1',
                            400: '#94a3b8',
                            500: '#64748b',
                            600: '#475569',
                            700: '#334155',
                            800: '#1e293b',
                            900: '#0f172a'
                        },
                        wechat: {
                            green: '#07C160',
                            greenHover: '#06B054',
                            bg: '#F3F3F3',
                            border: '#E2E2E2',
                            textDark: '#333333',
                            textGray: '#999999',
                            activeBlue: '#C5D9E8',
                            lightBlue: '#F2F6F9',
                            bubbleSelf: '#C6E6FC',
                            bubbleOther: '#FFFFFF'
                        }
                    }
                }
            }
        };
config.content = [require("path").join(__dirname, "../../聊天pc.html")];
module.exports = config;
