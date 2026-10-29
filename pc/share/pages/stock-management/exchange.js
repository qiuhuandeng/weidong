/* Small, dependency-free OOXML/CSV exchange for the inventory templates.
 * All rows are previewed and validated before an atomic import.
 */
window.StockExchange=(()=>{
  const enc=new TextEncoder(),dec=new TextDecoder();
  const xml=s=>String(s??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
  const crcTable=Array.from({length:256},(_,i)=>{for(let j=0;j<8;j++)i=(i&1)?0xedb88320^(i>>>1):i>>>1;return i>>>0;});
  const crc=bytes=>{let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
  const column=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
  function zip(files){
    let offset=0;const chunks=[],central=[];
    for(const [name,text] of Object.entries(files)){
      const filename=enc.encode(name),data=enc.encode(text),checksum=crc(data),head=new Uint8Array(30+filename.length),v=new DataView(head.buffer);
      v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint32(14,checksum,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,filename.length,true);head.set(filename,30);
      const c=new Uint8Array(46+filename.length),cv=new DataView(c.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint32(16,checksum,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,filename.length,true);cv.setUint32(42,offset,true);c.set(filename,46);
      chunks.push(head,data);central.push(c);offset+=head.length+data.length;
    }
    const end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,central.length,true);ev.setUint16(10,central.length,true);ev.setUint32(12,central.reduce((n,x)=>n+x.length,0),true);ev.setUint32(16,offset,true);
    return new Blob([...chunks,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  function download(name,headers,rows){
    const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const sheet='<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="'+ns+'"><sheetData>'+[headers,...rows].map((row,i)=>'<row r="'+(i+1)+'">'+row.map((value,j)=>'<c r="'+column(j)+(i+1)+'"'+(typeof value==='number'?' t="n"><v>'+value+'</v>':' t="inlineStr"><is><t xml:space="preserve">'+xml(value)+'</t></is>')+'</c>').join('')+'</row>').join('')+'</sheetData></worksheet>';
    const blob=zip({
      '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
      '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml':'<workbook xmlns="'+ns+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="库存数据" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml':sheet
    });
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function csv(text){
    const rows=[];let row=[],cell='',quote=false;
    for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++;}else quote=!quote;}else if(c===','&&!quote){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=c;}
    if(quote)throw Error('CSV 引号未闭合。');row.push(cell);if(row.some(Boolean))rows.push(row);return rows;
  }
  async function unzip(buffer){
    const bytes=new Uint8Array(buffer),v=new DataView(buffer);let end=bytes.length-22;
    while(end>=0&&v.getUint32(end,true)!==0x06054b50)end--;
    if(end<0)throw Error('不是有效的 xlsx 文件。');
    let pos=v.getUint32(end+16,true),count=v.getUint16(end+10,true),total=0;const files={};
    for(let n=0;n<count;n++){
      if(v.getUint32(pos,true)!==0x02014b50)throw Error('Excel 压缩目录损坏。');
      const method=v.getUint16(pos+10,true),size=v.getUint32(pos+20,true),length=v.getUint32(pos+24,true),nl=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true),off=v.getUint32(pos+42,true),name=dec.decode(bytes.slice(pos+46,pos+46+nl));
      total+=length;if(total>30*1024*1024)throw Error('工作簿解压后超过 30 MB，请拆分导入。');
      const start=off+30+v.getUint16(off+26,true)+v.getUint16(off+28,true),data=bytes.slice(start,start+size);
      if(name.endsWith('.xml')||name.endsWith('.rels')){
        if(method===0)files[name]=dec.decode(data);
        else if(method===8){const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));files[name]=await new Response(stream).text();}
        else throw Error('不支持此 Excel 压缩方式，请另存为标准 xlsx。');
      }
      pos+=46+nl+extra+comment;
    }
    return files;
  }
  async function read(file){
    if(file.size>8*1024*1024)throw Error('文件超过 8 MB，请拆分导入。');
    let rows;
    if(/\.csv$/i.test(file.name))rows=csv((await file.text()).replace(/^\uFEFF/,''));
    else if(/\.xlsx$/i.test(file.name)){
      const files=await unzip(await file.arrayBuffer()),parse=s=>{const doc=new DOMParser().parseFromString(s||'','application/xml');if(doc.querySelector('parsererror'))throw Error('Excel 内容格式错误。');return doc;};
      const strings=files['xl/sharedStrings.xml']?[...parse(files['xl/sharedStrings.xml']).getElementsByTagName('si')].map(x=>[...x.getElementsByTagName('t')].map(t=>t.textContent).join('')):[];
      const book=parse(files['xl/workbook.xml']),first=book.getElementsByTagName('sheet')[0],rel=first?.getAttribute('r:id');
      const relationships=parse(files['xl/_rels/workbook.xml.rels']),target=[...relationships.getElementsByTagName('Relationship')].find(x=>x.getAttribute('Id')===rel)?.getAttribute('Target');
      const path=target?.startsWith('/')?target.slice(1):'xl/'+target;
      if(!files[path])throw Error('未找到 Excel 第一个工作表。');
      rows=[...parse(files[path]).getElementsByTagName('row')].map(row=>{const cells=[];for(const c of row.getElementsByTagName('c')){const letters=c.getAttribute('r')?.replace(/\d/g,'')||'A';let index=0;for(const l of letters)index=index*26+l.charCodeAt(0)-64;const v=c.getElementsByTagName('v')[0]?.textContent||'';cells[index-1]=c.getAttribute('t')==='s'?strings[Number(v)]||'':c.getAttribute('t')==='inlineStr'?[...c.getElementsByTagName('t')].map(x=>x.textContent).join(''):v;}return cells;});
    }else throw Error('请选择 .xlsx 或 UTF-8 .csv 文件。');
    rows=rows.filter(row=>row.some(x=>String(x??'').trim()));
    if(rows.length<2)throw Error('文件没有待导入的数据。');
    const headers=rows.shift().map(x=>String(x).trim());
    if(new Set(headers).size!==headers.length)throw Error('表头存在重名列。');
    return rows.map((row,index)=>({line:index+2,...Object.fromEntries(headers.map((h,i)=>[h,String(row[i]??'').trim()]))}));
  }
  return {read,download};
})();
