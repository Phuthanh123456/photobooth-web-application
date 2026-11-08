import type { DesktopSaveState } from '@photobooth/shared';

export function DesktopSaveNotice({state,reopen,disabled}:{state:DesktopSaveState;reopen:()=>void;disabled:boolean}) {
  return <div className="desktop-save-notice">
    <p role="status">{state.status==='saved' ? `JPEG saved: ${state.path}` : state.status==='choosing' ? 'Choose your folder and press Save in the laptop Save As window.' : state.status==='queued' ? 'Save As will open when the previous save finishes.' : state.status==='saving' ? 'Saving and verifying your JPEG…' : state.status==='cancelled' ? 'Save cancelled. Your final JPEG is still kept in the output folder.' : `Save As failed: ${state.error}`}</p>
    {['saved','cancelled','error'].includes(state.status) && <button disabled={disabled} onClick={reopen}>Save image as…</button>}
  </div>;
}
