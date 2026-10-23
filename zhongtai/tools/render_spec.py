"""Synchronize the middle-platform specification without changing interactive examples."""
from pathlib import Path
from html import escape
import re,json
ROOT=Path(__file__).resolve().parents[1]
DOCS=ROOT/'docs'
ANCHORS=json.loads((DOCS/'reader-anchors.json').read_text())

def inline(text):
    text=escape(text)
    text=re.sub(r'`([^`]+)`',r'<code>\1</code>',text)
    text=re.sub(r'\*\*(.+?)\*\*',r'<strong>\1</strong>',text)
    return re.sub(r'\[([^]]+)\]\(([^)]+)\)',r'<a href="\2">\1</a>',text)

def render_body():
    lines=(DOCS/'UI设计规范.md').read_text().splitlines()[1:];out=[];nav=[];i=0;section=0
    while i<len(lines):
        line=lines[i]
        if not line.strip():i+=1;continue
        if line.startswith('```'):
            code=[];i+=1
            while i<len(lines) and not lines[i].startswith('```'):code.append(lines[i]);i+=1
            out.append('<pre><code>'+escape('\n'.join(code))+'</code></pre>');i+=1;continue
        if line.startswith('#'):
            level=len(line)-len(line.lstrip('#'));title=line[level:].strip();section+=1
            anchor=ANCHORS.get(title, f'added-section-{section}')
            out.append(f'<h{level} id="{anchor}">{inline(title)}</h{level}>')
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
    return '\n'.join(out)

def render():
    target=DOCS/'UI设计规范.html'
    html=target.read_text()
    start=html.index('-->',html.index('<!-- UI_SPEC_BODY_START'))+3
    end=html.index('<!-- UI_SPEC_BODY_END -->',start)
    target.write_text(html[:start]+'\n'+render_body()+'\n'+html[end:])
    print('Rendered zhongtai/docs/UI设计规范.html')
if __name__=='__main__':render()
