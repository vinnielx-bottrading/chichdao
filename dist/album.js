import {photoLimits,photoValidationError} from './model.js';
export async function preparePhoto(file){
 const error=photoValidationError(file);if(error)throw new Error(error);
 const url=URL.createObjectURL(file),img=new Image();
 try{
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('File không phải ảnh hợp lệ hoặc không đọc được.'));img.src=url;});
  if(img.naturalWidth<200||img.naturalHeight<200)throw new Error('Ảnh cần ít nhất 200 × 200 px.');
  if(img.naturalWidth*img.naturalHeight>photoLimits.maxPixels)throw new Error('Ảnh quá lớn. Hãy chọn ảnh dưới 40 megapixel.');
  const ratio=Math.min(1,photoLimits.maxDimension/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*ratio);canvas.height=Math.round(img.naturalHeight*ratio);
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Trình duyệt không xử lý được ảnh.');
  ctx.fillStyle='#10243a';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.87));
  if(!blob)throw new Error('Không chuyển đổi được ảnh.');
  return {id:crypto.randomUUID(),blob,caption:'',order:0};
 }finally{URL.revokeObjectURL(url);}
}
