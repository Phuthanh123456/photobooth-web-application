import {useEffect,useState} from 'react';
import type {SessionState} from '@photobooth/shared';
import './SessionQr.css';

export function SessionQr({share}:{share:NonNullable<SessionState['share']>}) {
  const [attempt,setAttempt]=useState(0),[failed,setFailed]=useState(false);
  useEffect(()=> {
    if(!failed) return;
    const timer=setTimeout(()=>{setFailed(false);setAttempt(value=>value+1);},2000);
    return ()=>clearTimeout(timer);
  },[failed]);
  return <aside className="session-qr" aria-label="Tải ảnh bằng QR">
    <p className="qr-eyebrow">TAKE THE MEMORY</p>
    <h2>Quét mã để tải ảnh</h2>
    <p>Ảnh của riêng lượt chụp này.</p>
    <div className="qr-image-wrap">
      <img src={`${share.qrImagePath}?v=${attempt}`} width="320" height="320" alt="Mã QR tải ảnh của lượt chụp này" onError={()=>setFailed(true)} onLoad={()=>setFailed(false)} style={{visibility:failed ? 'hidden' : 'visible'}}/>
      {failed && <span role="status">Đang tải lại mã QR…</span>}
    </div>
    <p className="qr-instruction">Mở camera điện thoại và quét mã.</p>
    <p className="qr-network">Dùng 4G / 5G hoặc Wi-Fi</p>
  </aside>;
}
