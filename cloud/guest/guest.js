const status=document.querySelector('#status'),photo=document.querySelector('#photo'),download=document.querySelector('#download'),retry=document.querySelector('#retry');
let blobUrl,timer,activeController,generation=0;
function locationInfo() {
  const match=location.hash.match(/^#([a-z0-9]+)\/([a-z0-9][a-z0-9-]{1,62})\/([a-f0-9-]{36})\/([A-Za-z0-9_-]{32})\.jpg$/i);
  if(!match) throw new Error('Mã ảnh không hợp lệ. Hãy quét lại QR trên màn hình.');
  const [,project,bucket,owner,token]=match;
  return {url:`https://${project.toLowerCase()}.supabase.co/storage/v1/object/public/${bucket}/${owner}/${token}.jpg`,name:`CAP-${token}.jpg`};
}
async function load() {
  const attempt=++generation;
  clearTimeout(timer);activeController?.abort();
  retry.hidden=true;download.hidden=true;photo.hidden=true;
  status.textContent='Ảnh đang được tải lên. Trang sẽ tự cập nhật, bạn không cần quét lại QR.';
  if(blobUrl) {URL.revokeObjectURL(blobUrl);blobUrl=undefined;}
  let info;
  try {info=locationInfo();}
  catch(error) {status.textContent=error.message;retry.hidden=false;return;}
  const controller=new AbortController();activeController=controller;
  let timeout=setTimeout(()=>controller.abort(),15_000);
  try {
    // Avoid cached missing-object responses while the laptop is uploading.
    const url=`${info.url}?ready=${Date.now()}`;
    const options={signal:controller.signal,referrerPolicy:'no-referrer',cache:'no-store'};
    const head=await fetch(url,{...options,method:'HEAD'});
    if(attempt!==generation) return;
    if(head.status===400 || head.status===404) {timer=setTimeout(load,3000);return;}
    if(!head.ok && head.status!==405 && head.status!==501) throw new Error('Chưa kết nối được kho ảnh. Trang sẽ tự thử lại.');
    clearTimeout(timeout);timeout=setTimeout(()=>controller.abort(),120_000);
    status.textContent='Ảnh đã sẵn sàng. Đang mở ảnh của bạn…';
    const response=await fetch(url,options);
    if(!response.ok) throw new Error('Ảnh đang được đồng bộ. Trang sẽ tự thử lại.');
    const blob=await response.blob();
    if(attempt!==generation) return;
    if(!blob.type.startsWith('image/jpeg') || blob.size>25*1024*1024 || !blob.size) throw new Error('Ảnh chưa hợp lệ. Vui lòng liên hệ người tổ chức.');
    blobUrl=URL.createObjectURL(blob);photo.src=blobUrl;await photo.decode();
    if(attempt!==generation) return;
    photo.hidden=false;download.href=blobUrl;download.download=info.name;download.hidden=false;
    status.textContent='Ảnh của bạn đã sẵn sàng.';
  } catch(error) {
    if(attempt!==generation) return;
    status.textContent=error.name==='AbortError' ? 'Mạng đang chậm. Trang sẽ tự thử lại; bạn có thể giữ đường link này để tải sau.' : error.message;
    retry.hidden=false;timer=setTimeout(load,5000);
  } finally {clearTimeout(timeout);}
}
retry.addEventListener('click',load);window.addEventListener('hashchange',load);
document.addEventListener('visibilitychange',()=>{if(!document.hidden && download.hidden) void load();});
void load();
