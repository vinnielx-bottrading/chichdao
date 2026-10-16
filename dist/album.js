import {photoLimits,photoValidationError} from './model.js';
// On-device compression: originals up to 30 MB → ~200–600 KB photo (max 1600 px) + ~40–60 KB preview (480 px).
// Prefers WebP (25–35% smaller than JPEG at the same quality); falls back to JPEG where the browser can't encode WebP.
// Re-encoding through a canvas also drops EXIF/GPS metadata.
let webpOK=null;
async function canWebp(){if(webpOK!==null)return webpOK;const c=document.createElement('canvas');c.width=c.height=2;const b=await new Promise(r=>c.toBlob(r,'image/webp',.8));return webpOK=!!b&&b.type==='image/webp';}
function draw(img,maxSide){const ratio=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*ratio));c.height=Math.max(1,Math.round(img.naturalHeight*ratio));const ctx=c.getContext('2d');if(!ctx)throw new Error('Trình duyệt không xử lý được ảnh.');ctx.fillStyle='#10243a';ctx.fillRect(0,0,c.width,c.height);ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,c.width,c.height);return c;}
const encode=(canvas,type,q)=>new Promise(r=>canvas.toBlob(r,type,q));
async function encodeUnder(canvas,type,target,ladder){let blob=null;for(const q of ladder){blob=await encode(canvas,type,q);if(!blob)break;if(blob.size<=target)return blob;}return blob;}
export async function preparePhoto(file){
 const error=photoValidationError(file);if(error)throw new Error(error);
 const url=URL.createObjectURL(file),img=new Image();
 try{
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error(/hei[cf]/.test(file.type)?'Trình duyệt này chưa đọc được ảnh HEIC. Hãy chọn ảnh JPG hoặc chụp màn hình ảnh.':'File không phải ảnh hợp lệ hoặc không đọc được.'));img.src=url;});
  if(img.naturalWidth<200||img.naturalHeight<200)throw new Error('Ảnh cần ít nhất 200 × 200 px.');
  if(img.naturalWidth*img.naturalHeight>photoLimits.maxPixels)throw new Error('Ảnh quá lớn (trên 120 megapixel).');
  const type=(await canWebp())?'image/webp':'image/jpeg';
  const big=draw(img,photoLimits.maxDimension);
  let blob=await encodeUnder(big,type,photoLimits.targetBytes,[.85,.8,.76,.72]);
  if(!blob)throw new Error('Không chuyển đổi được ảnh.');
  if(blob.size>photoLimits.maxBytes)throw new Error('Ảnh sau khi nén vẫn quá lớn.');
  const small=draw(img,photoLimits.thumbDimension);
  const thumb=await encodeUnder(small,type,120*1024,[.78,.7,.62]);
  return {id:crypto.randomUUID(),blob,thumb:thumb&&thumb.size<=300*1024?thumb:null,originalBytes:file.size,caption:'',order:0};
 }finally{URL.revokeObjectURL(url);}
}
export const fmtSize=b=>b>=1048576?`${(b/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(b/1024))} KB`;
