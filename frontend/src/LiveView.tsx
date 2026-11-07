import { useEffect, useState } from 'react';
import './LiveView.css';

/** Preview transport only. Session timing and shutters remain server controlled. */
export function LiveView({ url }: { url:string }) {
  const [image,setImage]=useState<string>();
  useEffect(()=> {
    let disposed=false, current:string|undefined, timer:ReturnType<typeof setTimeout>;
    let request:AbortController|undefined;
    let previousFrame='', lastNewFrame=performance.now();
    const clear=()=> {setImage(undefined);if(current) URL.revokeObjectURL(current);current=undefined;};
    const poll=async()=> {
      request=new AbortController();
      const timeout=setTimeout(()=>request?.abort(),1500);
      try {
        const response=await fetch(url.replace('.mjpg','.jpg'),{cache:'no-store',signal:request.signal});
        if(!response.ok || !response.headers.get('content-type')?.startsWith('image/jpeg')) throw new Error('Preview unavailable');
        const frame=response.headers.get('X-Frame-Id');
        if(!frame) throw new Error('Preview has no freshness information');
        const blob=await response.blob();
        if(disposed) return;
        if(frame!==previousFrame) {
          previousFrame=frame;lastNewFrame=performance.now();
          const next=URL.createObjectURL(blob),old=current;current=next;setImage(next);
          if(old) URL.revokeObjectURL(old);
        } else if(performance.now()-lastNewFrame>3000) clear();
      } catch {if(!disposed) clear();}
      finally {clearTimeout(timeout);if(!disposed) timer=setTimeout(poll,150);}
    };
    void poll();
    return ()=> {disposed=true;clearTimeout(timer);request?.abort();if(current) URL.revokeObjectURL(current);};
  },[url]);
  return image ? <img className="live-view" src={image} alt="Nikon Live View" onError={()=>setImage(undefined)}/> : <div className="preview-reconnecting" role="status">Live View reconnecting…</div>;
}
