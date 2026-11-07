'use strict';
// Offline OOXML ZIP reader. No external dependencies, no macros or embedded content executed.
const zlib=require('zlib');
const math=require('./math-format');
const MAX_ZIP=9*1024*1024, MAX_XML=12*1024*1024, MAX_ENTRIES=1000, MAX_OUTPUT=32*1024*1024;
const unescapeXML=(x)=>String(x||'').replace(/&(?:amp|lt|gt|quot|apos|#x[0-9a-fA-F]+|#\d+);/g,v=>{const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};if(named[v])return named[v];let n=v.startsWith('&#x')?parseInt(v.slice(3,-1),16):parseInt(v.slice(2,-1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):''});
const stripTags=t=>unescapeXML(t.replace(/<[^>]*>/g,''));
function unzip(input){const b=Buffer.isBuffer(input)?input:Buffer.from(input);if(b.length>MAX_ZIP)throw Error('文件超过9MB限制');
 // Central directory entries are authoritative. Reject ZIP64 and encrypted entries.
 let pos=-1;for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--){if(b.readUInt32LE(i)===0x06054b50){pos=i;break;}}
 if(pos<0)throw Error('不是有效的 DOCX/XLSX 文件');const count=b.readUInt16LE(pos+10),central=b.readUInt32LE(pos+16);if(count>MAX_ENTRIES||b.readUInt16LE(pos+8)!==count)throw Error('压缩包文件数量异常');
 const out=new Map();let cur=central,size=0;
 for(let i=0;i<count;i++){
  if(cur+46>b.length||b.readUInt32LE(cur)!==0x02014b50)throw Error('ZIP目录异常');
  const flag=b.readUInt16LE(cur+8),method=b.readUInt16LE(cur+10),compressed=b.readUInt32LE(cur+20),uncompressed=b.readUInt32LE(cur+24),nl=b.readUInt16LE(cur+28),el=b.readUInt16LE(cur+30),cl=b.readUInt16LE(cur+32),offset=b.readUInt32LE(cur+42),name=b.subarray(cur+46,cur+46+nl).toString('utf8');cur+=46+nl+el+cl;
  if(flag&1)throw Error('不支持加密Word/Excel文件');if(compressed===0xffffffff||uncompressed===0xffffffff)throw Error('不支持ZIP64');
  if(uncompressed>MAX_XML||size+uncompressed>MAX_OUTPUT)throw Error('文档内容过大，请拆分导入');
  const needed=/^(word\/document\.xml|word\/_rels\/document\.xml\.rels|word\/media\/[^/]+|xl\/workbook\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/sharedStrings\.xml|xl\/worksheets\/sheet\d+\.xml|xl\/styles\.xml|\[Content_Types\]\.xml)$/.test(name);
  if(!needed)continue;
  if(offset+30>b.length||b.readUInt32LE(offset)!==0x04034b50)throw Error('ZIP数据异常');
  const start=offset+30+b.readUInt16LE(offset+26)+b.readUInt16LE(offset+28);
  if(start+compressed>b.length)throw Error('ZIP数据截断');
  const raw=b.subarray(start,start+compressed);let value;
  if(method===0)value=raw;else if(method===8)value=zlib.inflateRawSync(raw,{maxOutputLength:MAX_OUTPUT});else throw Error('暂不支持当前DOCX/XLSX压缩格式');
  if(value.length!==uncompressed)throw Error('ZIP大小校验失败');size+=value.length;
  out.set(name,name.startsWith('word/media/')?value:value.toString('utf8'));
 }
 return out;
}
function mediaMime(name){const ext=String(name||'').toLowerCase().split('.').pop();return ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',bmp:'image/bmp',mp4:'video/mp4',webm:'video/webm',ogg:'video/ogg',mov:'video/quicktime'})[ext]||'application/octet-stream';}
function docxToRows(input){const z=unzip(input),xml=z.get('word/document.xml');if(!xml)throw Error('Word文档缺少正文，确认是.docx格式');
 // Keep embedded media as data URLs. The question parser attaches media to the
 // nearest readable question, while formulas are reduced to their visible text.
 const relXml=z.get('word/_rels/document.xml.rels')||'',relMap={};
 for(const m of relXml.matchAll(/<Relationship\b[^>]*\/?>/g)){const tag=m[0],id=tag.match(/\bId="([^"]+)"/)?.[1],target=tag.match(/\bTarget="([^"]+)"/)?.[1];if(id&&target&&!target.includes('..')){const clean=target.replace(/^\//,'').replace(/^word\//,'');relMap[id]=clean.startsWith('media/')?'word/'+clean:clean;}}
 const dataForRel=id=>{const name=relMap[id],buf=name&&z.get(name);if(!name||!Buffer.isBuffer(buf))return null;return {kind:mediaMime(name).startsWith('video/')?'video':'image',mime:mediaMime(name),data:'data:'+mediaMime(name)+';base64,'+buf.toString('base64'),name:name.split('/').pop()};};
 const mediaIn=block=>{const out=[];for(const m of block.matchAll(/(?:r:embed|r:id|rel:id)="([^"]+)"/g)){const v=dataForRel(m[1]);if(v&&!out.some(x=>x.data===v.data))out.push(v);}return out;};
 const mediaDetected=/<(?:w:drawing|w:pict|w:object|m:oMath|o:OLEObject|v:shape)\b/.test(xml)||[...z.keys()].some(n=>n.startsWith('word/media/'));
 const body=xml.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/)?.[1]||xml;
 const textP=block=>{const a=[];for(const m of block.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)){const formatted=math.wordParagraphText(m[0]),line=formatted.text.replace(/\t+/g,'\t').replace(/[ \t]+\n/g,'\n').trim(),media=mediaIn(m[0]);if(line||media.length)a.push({text:line,media,formatWarnings:formatted.warnings});}return a};
 const output=[];const tokens=body.match(/<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)||[];
 for(const chunk of tokens){if(chunk.startsWith('<w:tbl')){const trs=[...chunk.matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)];const rows=[],tableMedia=[],tableWarnings=[];for(const tr of trs){const cells=[];for(const tc of tr[1].matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g)){const parts=textP(tc[1]);cells.push(parts.map(x=>x.text).filter(Boolean).join(' '));for(const part of parts){for(const media of part.media||[])if(!tableMedia.some(x=>x.data===media.data))tableMedia.push(media);for(const warning of part.formatWarnings||[])if(!tableWarnings.includes(warning))tableWarnings.push(warning);}}rows.push(cells);}if(rows.length)output.push({kind:'table',rows,media:tableMedia,formatWarnings:tableWarnings});}else{const parts=textP(chunk);output.push({kind:'line',text:parts.map(x=>x.text).filter(Boolean).join(' '),media:parts.flatMap(x=>x.media||[]),formatWarnings:parts.flatMap(x=>x.formatWarnings||[])});}}
 output.mediaDetected=mediaDetected;
 return output;
}
function xlsxToRows(input){const z=unzip(input),workbook=z.get('xl/workbook.xml');if(!workbook)throw Error('Excel文档缺少工作表，确认是.xlsx格式');
 const strings=[];const sx=z.get('xl/sharedStrings.xml')||'';for(const m of sx.matchAll(/<(?:[\w-]+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?si>/g)){const seg=[...m[1].matchAll(/<(?:[\w-]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?t>/g)].map(x=>unescapeXML(x[1]));strings.push(seg.join(''));}
 let sheets=[...z.entries()].filter(([name])=>/^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort(([a],[b])=>(Number(a.match(/sheet(\d+)/)?.[1]||0)-Number(b.match(/sheet(\d+)/)?.[1]||0)));
 // Sheet definitions follow workbook relation ids, rather than relying on sheet filenames.
 const relXml=z.get('xl/_rels/workbook.xml.rels')||'', rels={};for(const m of relXml.matchAll(/<Relationship\b[^>]*\/>/g)){let v=m[0];const id=v.match(/\bId="([^"]+)"/)?.[1],target=v.match(/\bTarget="([^"]+)"/)?.[1];if(id&&target&&!target.includes('..'))rels[id]='xl/'+target.replace(/^\//,'').replace(/^xl\//,'');}
 const configured=[...workbook.matchAll(/<(?:[\w-]+:)?sheet\b[^>]*\/>/g)].map(m=>{const a=m[0];return {name:unescapeXML(a.match(/\bname="([^"]+)"/)?.[1]||'工作表'),file:rels[a.match(/\br:id="([^"]+)"/)?.[1]]};});
 if(configured.some(x=>x.file&&z.has(x.file)))sheets=configured.filter(x=>x.file&&z.has(x.file)).map(x=>[x.file,z.get(x.file),x.name]);
 const output=[];for(const [filename,xml,alias] of sheets){const rows=[];for(const m of xml.matchAll(/<(?:[\w-]+:)?row\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?row>/g)){const cells=[];for(const c of m[1].matchAll(/<(?:[\w-]+:)?c\b([^>]*?)(?:\/\s*>|>([\s\S]*?)<\/(?:[\w-]+:)?c>)/g)){const col=c[1].match(/\br="([A-Z]+)\d+"/)?.[1]||'',typ=c[1].match(/\bt="([^"]+)"/)?.[1]||'',raw=c[2]||'';const v=raw.match(/<(?:[\w-]+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?v>/)?.[1]||'';let value=typ==='s'?strings[Number(v)]||'':typ==='inlineStr'?[...raw.matchAll(/<(?:[\w-]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?t>/g)].map(x=>unescapeXML(x[1])).join(''):unescapeXML(v);if(typ==='b')value=v==='1'?'正确':'错误';if(!value&&/\bt="str"/.test(c[1]))value=stripTags(raw);let ci=0;for(const ch of col)ci=ci*26+ch.charCodeAt(0)-64;ci--;if(ci>=0&&ci<90)cells[ci]=value;}
 if(cells.some(x=>String(x||'').trim()))rows.push(cells.map(x=>String(x||'').trim()));}
 output.push({kind:'table',rows,sheet:alias||filename});}
 return output;
}
module.exports={unzip,docxToRows,xlsxToRows,unescapeXML};
