const status=document.querySelector('#status'),photo=document.querySelector('#photo'),download=document.querySelector('#download'),retry=document.querySelector('#retry');
let blobUrl;
function locationInfo() {
  const match=location.hash.match(/^#([a-z0-9]+)\/([a-z0-9][a-z0-9-]{1,62})\/([a-f0-9-]{36})\/([A-Za-z0-9_-]{32})\.jpg$/i);
  if(!match) throw new Error('Mã ảnh không hợp lệ. Hãy quét lại QR trên màn hình.');
  const [,project,bucket,owner,token]=match;
  return {url:`https://${project.toLowerCase()}.supabase.co/storage/v1/object/public/${bucket}/${owner}/${token}.jpg`,name:`CAP-${token}.jpg`};
}
async function load() {
  retry.hidden=true;download.hidden=true;photo.hidden=true;status.textContent='Đang mở ảnh của lượt chụp…';
  if(blobUrl) {URL.revokeObjectURL(blobUrl);blobUrl=undefined;}
  try {
    const {url,name}=locationInfo();
    const response=await fetch(url,{signal:AbortSignal.timeout(30_000),referrerPolicy:'no-referrer'});
    if(!response.ok) throw new Error('Chưa tải được ảnh. Kiểm tra kết nối mạng rồi thử lại.');
    const blob=await response.blob();
    if(!blob.type.startsWith('image/jpeg') || blob.size>10*1024*1024 || !blob.size) throw new Error('Ảnh không hợp lệ. Vui lòng liên hệ người tổ chức.');
    blobUrl=URL.createObjectURL(blob);photo.src=blobUrl;await photo.decode();photo.hidden=false;
    download.href=blobUrl;download.download=name;download.hidden=false;status.textContent='Ảnh của bạn đã sẵn sàng.';
  } catch(error) {status.textContent=error.name==='TimeoutError' ? 'Mạng chậm. Bạn hãy thử tải lại.' : error.message;retry.hidden=false;}
}
retry.addEventListener('click',load);window.addEventListener('hashchange',load);void load();
