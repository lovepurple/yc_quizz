/* SCHOOL_IMPORT_MATH_FORMAT_V2 */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.QuizzleMath=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
  const decode=s=>String(s||'').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,v)=>{
    if(entities[v])return entities[v];
    const n=v[0]==='#'?(v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):parseInt(v.slice(1),10)):0;
    return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
  });
  function xmlTree(source){
    if(/<!DOCTYPE|<!ENTITY/i.test(source))throw Error('Word XML包含不支持的文档声明');
    const root={name:'root',children:[]},stack=[root];let count=0;
    for(const token of String(source).match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<[^>]*>|[^<]+/g)||[]){
      if(++count>200000)throw Error('Word段落过于复杂，请拆分导入');
      if(token.startsWith('<!--')||token.startsWith('<?'))continue;
      if(token.startsWith('</')){const name=token.slice(2,-1).trim();if(stack.length<2||stack[stack.length-1].name!==name)throw Error('Word XML结构异常');stack.pop();continue;}
      if(token.startsWith('<')){
        const m=token.match(/^<([^\s/>]+)/);if(!m)continue;
        const attrs={};for(const a of token.matchAll(/([^\s=<>]+)\s*=\s*(["'])([\s\S]*?)\2/g))attrs[a[1]]=decode(a[3]);
        const node={name:m[1],attrs,children:[]};stack[stack.length-1].children.push(node);
        if(!/\/\s*>$/.test(token)){stack.push(node);if(stack.length>128)throw Error('Word XML嵌套层数过多');}
      }else stack[stack.length-1].children.push(decode(token));
    }
    if(stack.length!==1)throw Error('Word XML没有完整结束');return root;
  }
  const elements=n=>(n?.children||[]).filter(x=>typeof x!=='string');
  const child=(n,name)=>elements(n).find(x=>x.name===name);
  const attr=(n,name,other='')=>n?.attrs?.[name]??other;
  const text=n=>typeof n==='string'?n:(n?.children||[]).map(text).join('');
  function wordParagraphText(source){
    const tree=xmlTree(source),warnings=[];
    function convert(n){
      if(typeof n==='string')return '';
      const name=n.name;
      if(/(?:Pr|PrChange)$/.test(name)||['w:del','w:moveFrom','w:instrText','w:drawing','w:pict','w:object'].includes(name))return '';
      if(name==='w:t'||name==='m:t')return text(n);
      if(name==='w:tab')return '\t';if(name==='w:br'||name==='w:cr')return '\n';
      if(name==='mc:AlternateContent'){const one=child(n,'mc:Choice')||child(n,'mc:Fallback');return one?convert(one):'';}
      const group=key=>convert(child(n,'m:'+key));
      if(name==='m:f')return '\\frac{'+group('num')+'}{'+group('den')+'}';
      if(name==='m:sSup')return group('e')+'^{'+group('sup')+'}';
      if(name==='m:sSub')return group('e')+'_{'+group('sub')+'}';
      if(name==='m:sSubSup')return group('e')+'_{'+group('sub')+'}^{'+group('sup')+'}';
      if(name==='m:sPre')return '_{'+group('sub')+'}^{'+group('sup')+'}'+group('e');
      if(name==='m:rad'){
        const degree=group('deg');return degree?'\\root{'+degree+'}{'+group('e')+'}':'\\sqrt{'+group('e')+'}';
      }
      if(name==='m:d'){
        const p=child(n,'m:dPr'),start=attr(child(p,'m:begChr'),'m:val','('),end=attr(child(p,'m:endChr'),'m:val',')');
        const separator=attr(child(p,'m:sepChr'),'m:val','|');return start+elements(n).filter(x=>x.name==='m:e').map(convert).join(separator)+end;
      }
      if(name==='m:nary'){
        const p=child(n,'m:naryPr'),symbol=attr(child(p,'m:chr'),'m:val','∫');
        const lo=group('sub'),hi=group('sup');return symbol+(lo?'_{'+lo+'}':'')+(hi?'^{'+hi+'}':'')+group('e');
      }
      if(name==='m:eqArr')return elements(n).filter(x=>x.name==='m:e').map(convert).join('；');
      if(name==='m:r'||name==='w:r'){
        const content=elements(n).map(convert).join(''),pr=child(n,'w:rPr');
        const vertical=attr(child(pr,'w:vertAlign'),'w:val');
        if(!content)return '';
        return vertical==='superscript'?'^{'+content+'}':vertical==='subscript'?'_{'+content+'}':content;
      }
      if(['m:m','m:acc','m:bar','m:groupChr','m:limLow','m:limUpp'].includes(name))warnings.push('存在需人工核对的复杂公式结构：'+name.slice(2));
      return elements(n).map(convert).join('');
    }
    return {text:convert(tree),warnings:[...new Set(warnings)]};
  }
  function parseInline(source,depth=0){
    const s=String(source||'');if(depth>24||s.length>30000)return [{type:'text',text:s}];
    const result=[];let literal='';
    const flush=()=>{if(literal){result.push({type:'text',text:literal});literal='';}};
    function group(at){
      if(s[at]!=='{')return null;let level=1;
      for(let j=at+1;j<s.length;j++){if(s[j]==='{')level++;else if(s[j]==='}'&&--level===0)return {text:s.slice(at+1,j),end:j+1};if(level>30)return null;}
      return null;
    }
    for(let i=0;i<s.length;){
      const mark=s[i];
      if((mark==='^'||mark==='_')&&s[i+1]==='{'){
        const g=group(i+1);if(g){flush();result.push({type:mark==='^'?'sup':'sub',children:parseInline(g.text,depth+1)});i=g.end;continue;}
      }
      let matched=false;
      for(const [command,type,arity] of [['\\frac','frac',2],['\\sqrt','sqrt',1],['\\root','root',2]]){
        if(!s.startsWith(command+'{',i))continue;
        const a=group(i+command.length),b=arity===2&&a?group(a.end):null;
        if(a&&(arity===1||b)){flush();result.push({type,children:parseInline(a.text,depth+1),other:b?parseInline(b.text,depth+1):[]});i=b?b.end:a.end;matched=true;break;}
      }
      if(!matched){literal+=s[i];i++;}
    }
    flush();return result;
  }
  function hasFormatting(s){return /[\^_]\{|\\(?:frac|sqrt|root)\{/.test(String(s||''));}
  function renderInline(value,target){
    const doc=target.ownerDocument;
    function render(nodes,host){for(let i=0;i<nodes.length;i++){
      const n=nodes[i];if(n.type==='text'){host.append(doc.createTextNode(n.text));continue;}
      if(n.type==='sup'||n.type==='sub'){
        const next=nodes[i+1];
        if(next&&(next.type==='sup'||next.type==='sub')&&next.type!==n.type){
          const pair=doc.createElement('span');pair.className='quizzle-math-scripts';
          for(const x of [n,next]){const part=doc.createElement(x.type);render(x.children,part);pair.append(part);}host.append(pair);i++;continue;
        }
        const el=doc.createElement(n.type);el.className='quizzle-math-'+n.type;render(n.children,el);host.append(el);continue;
      }
      if(n.type==='frac'){
        const fraction=doc.createElement('span');fraction.className='quizzle-math-frac';fraction.setAttribute('role','math');
        const numerator=doc.createElement('span'),denominator=doc.createElement('span');numerator.className='quizzle-math-num';denominator.className='quizzle-math-den';
        render(n.children,numerator);render(n.other,denominator);fraction.append(numerator,denominator);host.append(fraction);continue;
      }
      const radical=doc.createElement('span');radical.className='quizzle-math-root';
      if(n.type==='root'){const degree=doc.createElement('sup');degree.className='quizzle-math-degree';render(n.children,degree);radical.append(degree);}
      radical.append(doc.createTextNode('√'));const contents=doc.createElement('span');contents.className='quizzle-math-radicand';render(n.type==='root'?n.other:n.children,contents);radical.append(contents);host.append(radical);
    }}
    target.replaceChildren();render(parseInline(value),target);return target;
  }
  const css='.quizzle-math{white-space:pre-wrap;line-height:1.9;overflow-wrap:anywhere}.quizzle-math-sup,.quizzle-math-sub{font-size:.72em;line-height:0;position:relative;vertical-align:baseline}.quizzle-math-sup{top:-.55em}.quizzle-math-sub{top:.28em}.quizzle-math-frac{display:inline-flex;vertical-align:-.5em;flex-direction:column;align-items:stretch;text-align:center;line-height:1.2;margin:0 .13em;font-size:.95em}.quizzle-math-num{display:block;padding:0 .16em .05em;border-bottom:1px solid currentColor}.quizzle-math-den{display:block;padding:.05em .16em 0}.quizzle-math-scripts{display:inline-grid;vertical-align:-.25em;grid-template-rows:1fr 1fr;line-height:1;font-size:.72em}.quizzle-math-scripts>sup,.quizzle-math-scripts>sub{font:inherit;position:static;grid-column:1}.quizzle-math-scripts>sup{grid-row:1}.quizzle-math-scripts>sub{grid-row:2}.quizzle-math-root{display:inline-block;white-space:nowrap}.quizzle-math-radicand{border-top:1px solid currentColor;padding:.08em .12em 0 0}.quizzle-math-degree{font-size:.6em;margin-right:-.1em}';
  return {wordParagraphText,parseInline,hasFormatting,renderInline,css};
});
