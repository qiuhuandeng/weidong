"""Render the project's PC specification using its small, fixed Markdown subset."""
from pathlib import Path
from html import escape
import re
ROOT=Path(__file__).resolve().parent.parent

def inline(text):
    text=escape(text)
    text=re.sub(r'`([^`]+)`',r'<code>\1</code>',text)
    text=re.sub(r'\*\*(.+?)\*\*',r'<strong>\1</strong>',text)
    return re.sub(r'\[([^]]+)\]\(([^)]+)\)',r'<a href="\2">\1</a>',text)

def render():
    lines=(ROOT/'PC后台UI规范.md').read_text().splitlines();out=[];nav=[];i=0;section=0
    while i<len(lines):
        line=lines[i]
        if not line.strip():i+=1;continue
        if line.startswith('```'):
            code=[];i+=1
            while i<len(lines) and not lines[i].startswith('```'):code.append(lines[i]);i+=1
            out.append('<pre><code>'+escape('\n'.join(code))+'</code></pre>');i+=1;continue
        if line.startswith('#'):
            level=len(line)-len(line.lstrip('#'));title=line[level:].strip();section+=1
            out.append(f'<h{level} id="section-{section}">{inline(title)}</h{level}>')
            if level==2:nav.append(f'<a href="#section-{section}">{inline(title)}</a>')
            i+=1;continue
        if line.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].startswith('|'):rows.append([c.strip() for c in lines[i].strip('|').split('|')]);i+=1
            out.append('<div class="table-wrap"><table><thead><tr>'+''.join('<th>'+inline(c)+'</th>' for c in rows[0])+'</tr></thead><tbody>')
            for row in rows[2:]:out.append('<tr>'+''.join('<td>'+inline(c)+'</td>' for c in row)+'</tr>')
            out.append('</tbody></table></div>');continue
        if re.match(r'^(- |\d+\. )',line):
            ordered=line[0].isdigit();tag='ol' if ordered else 'ul';out.append('<'+tag+'>')
            while i<len(lines) and re.match(r'^(- |\d+\. )',lines[i]):out.append('<li>'+inline(re.sub(r'^(- |\d+\. )','',lines[i]))+'</li>');i+=1
            out.append('</'+tag+'>');continue
        paragraph=[]
        while i<len(lines) and lines[i].strip():paragraph.append(lines[i]);i+=1
        out.append('<p>'+inline(' '.join(paragraph))+'</p>')
    css='''*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f0f2f5;color:#606266;font:14px/1.8 "Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif}aside{position:fixed;inset:0 auto 0 0;width:220px;background:#304156;color:#bfcbd9;overflow:auto}aside b{display:block;background:#2b2f3a;padding:12px 20px;color:#fff;font-size:18px}aside a{display:block;color:#bfcbd9;padding:8px 20px;font-size:13px}aside a:hover{background:#263445;color:#409eff}a{color:#409eff;text-decoration:none}main{margin:20px 20px 20px 240px;background:white;padding:28px 36px;border-radius:4px;max-width:1300px}h1{font-size:26px;margin-top:0;color:#303133}h2{font-size:18px;color:#303133;margin:36px 0 16px;padding-bottom:10px;border-bottom:1px solid #ebeef5;scroll-margin-top:20px}p{margin:12px 0}li{margin:8px 0}.table-wrap{overflow:auto;margin:18px 0}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #e8eaec;text-align:left;padding:9px 12px;vertical-align:top}th{background:#f8f8f9;color:#303133}code{background:#f5f7fa;border-radius:3px;padding:2px 4px;font:12px/1.7 monospace}pre{padding:16px;background:#f5f7fa;overflow:auto;border:1px solid #ebeef5;border-radius:4px}pre code{padding:0}.links{font-size:13px;border-bottom:1px solid #ebeef5;padding-bottom:14px}@media(max-width:900px){aside{position:static;width:auto}aside a{display:inline-block;padding:6px 12px}main{margin:10px;padding:20px}}'''
    html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WEID微动 · PC 后台 UI 规范</title><style>'+css+'</style><aside><b>WEID微动 · PC 规范</b>'+''.join(nav)+'</aside><main><div class="links"><a href="pc.html#shops">打开后台示例</a> · <a href="PC后台UI规范.md">规范正文</a> · 由正文自动生成</div>'+''.join(out)+'</main></html>'
    (ROOT/'PC后台UI规范.html').write_text(html)
    print('Rendered PC后台UI规范.html')
if __name__=='__main__':render()
