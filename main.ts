import{mkdirSync as M,readdirSync as R,readFileSync as F,writeFileSync as W}from'node:fs';
const I=process.env.MAKEFUN_INPUT_DIR??'/input',O=process.env.MAKEFUN_OUTPUT_DIR??'/output',S='0Aq46:;?........999999959995999.999.............PTTP0...........58..............4414';
let B=Buffer.alloc(65536),L=0;
function V(p,i){
const n=p.length,D=new Int32Array(256),C=[],X=new Int32Array(256);
let s=0,u=0,k=0,q=0,t=1e6,a,b,r;
L=0;
for(;;){
if(!t--)return 10;
if(q<0||q>=n)return 9;
const o=p[q],h=S.charCodeAt(o)-48;
if(!(h>=0))return 5;
const m=h>>4,e=h>>2&3,w=h&3;
if(q+m>=n)return 9;
if(s<e)return 2;
if(s-e+w>256)return 3;
q+=m+1;
switch(o){
case 0:return 0;
case 1:D[s++]=p[q-1]<<24>>24;break;
case 2:D[s++]=p[q-4]|p[q-3]<<8|p[q-2]<<16|p[q-1]<<24;break;
case 3:s--;break;
case 4:D[s]=D[s-1];s++;break;
case 5:a=D[s-1];D[s-1]=D[s-2];D[s-2]=a;break;
case 6:D[s]=D[s-2];s++;break;
case 7:a=D[s-3];D[s-3]=D[s-2];D[s-2]=D[s-1];D[s-1]=a;break;
case 23:D[s-1]*=-1;break;
case 27:D[s-1]=~D[s-1];break;
case 48:case 49:case 50:
r=(p[q-2]|p[q-1]<<8)<<16>>16;b=o>48?D[--s]:0;
if(o<49||(o==49)!==!!b)q+=r;
break;
case 51:if(u==64)return 7;C[u++]=q;q=p[q-2]|p[q-1]<<8;break;
case 52:if(!u)return 8;q=C[--u];break;
case 64:a=D[s-1];if(a>>>0>255)return 6;D[s-1]=X[a];break;
case 65:a=D[s-1];b=D[s-2];if(a>>>0>255)return 6;s-=2;X[a]=b;break;
case 80:r=''+D[s-1];if(L+r.length>65536)return 11;L+=B.write(r,L);s--;break;
case 81:if(L>65535)return 11;B[L++]=D[--s]&255;break;
case 82:D[s++]=k<i.length?i[k++]:-1;break;
case 83:return D[--s]&255;
default:
a=D[s-2];b=D[s-1];
if(o>18&&o<23&&!b)return 4;
r=o==16?a+b|0:o==17?a-b|0:o==18?Math.imul(a,b):o==19?a/b|0:o==20?a%b|0:o==21?(a>>>0)/(b>>>0)|0:o==22?(a>>>0)%(b>>>0)|0:o==24?a&b:o==25?a|b:o==26?a^b:o==28?a<<(b&31):o==29?a>>(b&31):o==30?a>>>(b&31)|0:o==32?+(a==b):o==33?+(a<b):+((a>>>0)<(b>>>0));
D[--s-1]=r;
}}}
for(const d of R(I)){const p=I+'/'+d,c=V(F(p+'/program.bin'),F(p+'/input.bin')),o=O+'/'+d;M(o,{recursive:!0});W(o+'/stdout.bin',B.subarray(0,L));W(o+'/exit.txt',c+'\n');}
