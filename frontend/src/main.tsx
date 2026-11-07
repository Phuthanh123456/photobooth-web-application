import { createRoot } from 'react-dom/client';
import type { SessionState } from '@photobooth/shared';
import { useSession } from './useSession';
import './styles.css';

function Slots({ state }: { state: SessionState | null }) {
  return <div className="slots">{Array.from({ length: 4 }, (_, i) => {
    const record = state?.captures[i];
    return <figure className={state?.photo === i + 1 ? 'selected' : ''} key={i}>
      {record?.status === 'saved' && record.file ? <img src={`/images/${state!.sessionId}/${record.file}`} alt={`Saved mock photo ${i + 1}`} /> : <div className="empty-slot"><span>0{i + 1}</span></div>}
      <figcaption>Photo {i + 1}<span>{record?.status ?? 'pending'}</span></figcaption>
    </figure>;
  })}</div>;
}
function App() {
  const display = location.pathname === '/display';
  const { state, connected, error, pending, command } = useSession(!display);
  const status = state?.status ?? 'IDLE';
  const canStart = connected && !pending && !state?.busy && ['IDLE', 'COMPLETE'].includes(status);
  const message = !connected ? 'Connecting to the booth…' : status === 'COMPLETE' ? 'That’s a wrap.' : status === 'COUNTDOWN' ? 'Look at the camera' : status === 'CAPTURING' ? 'Hold that pose' : status === 'SAVING' ? 'Saving your photo…' : status === 'ERROR' ? 'Session paused' : status === 'CANCELLED' ? 'Session cancelled' : 'Your moment, captured.';
  return <main className={display ? 'display' : 'operator'}>
    <header><div className="brand"><span className="brand-mark" aria-hidden="true">▣</span><div>MEDIA TEAM<small>UNIVERSITY PHOTOBOOTH</small></div></div><div className="badges"><span className="badge">Mock Camera</span><span className={`connection ${connected ? 'online' : ''}`}>{connected ? 'Connected' : 'Reconnecting'}</span></div></header>
    {!display && <div className="page-heading"><div><p className="eyebrow">OPERATOR WORKSPACE</p><h1>Make a little history.</h1><p>Four photos. Ten seconds to make each one yours.</p></div><a href="/display" target="_blank" rel="noreferrer">Open display ↗</a></div>}
    <div className="workspace"><section className="preview" aria-label="Mock camera preview">
      <div className="preview-top"><span>MOCK PREVIEW · NO LIVE VIEW</span><span>{state?.photo ? `Photo ${state.photo} of 4` : 'Four photos per session'}</span></div>
      <div className="frame-corner tl"/><div className="frame-corner tr"/><div className="frame-corner bl"/><div className="frame-corner br"/>
      <div className="preview-center">
        {connected && status === 'COUNTDOWN' && <div className="countdown">{state?.remainingSeconds}</div>}
        {status === 'COMPLETE' && connected && <div className="complete-symbol" aria-hidden="true">✓</div>}
        {(!connected || !['COUNTDOWN', 'COMPLETE'].includes(status)) && <div className="lens" aria-hidden="true"><div/></div>}
        <h2>{message}</h2><p>{status === 'COMPLETE' ? 'All four photos are safely saved.' : display ? 'Your operator will guide the session.' : 'Mock camera · ready for a test session'}</p>
      </div>
      {connected && status === 'CAPTURING' && <div className="flash" key={`${state?.sessionId}-${state?.photo}`} aria-hidden="true"/>}
      <div className="preview-bottom"><span>UNIVERSITY MEDIA TEAM</span><span>04 FRAMES / 10 SEC</span></div>
    </section>
    {!display && <aside className="controls"><p className="eyebrow">SESSION CONTROL</p><div className="status-row"><h2>{status}</h2><span>{String(state?.photo ?? 0).padStart(2, '0')} / 04</span></div><p className="explanation">Each photo starts with a full 10-second countdown. The next begins once the image is saved and the camera is ready.</p><dl><div><dt>Countdown</dt><dd>{connected && status === 'COUNTDOWN' ? `${state?.remainingSeconds}s` : '—'}</dd></div><div><dt>Camera mode</dt><dd>Mock adapter</dd></div><div><dt>Saved images</dt><dd>{state?.captures.filter(c => c.status === 'saved').length ?? 0} of 4</dd></div></dl>
      <button className="primary" disabled={!canStart} onClick={() => command('START')}>Start Session <span aria-hidden="true">→</span></button>
      <button disabled={!connected || pending || !state?.busy || ['ERROR', 'CANCELLED'].includes(status)} onClick={() => command('CANCEL')}>Cancel Session</button>
      {['ERROR', 'CANCELLED'].includes(status) && <button disabled={!connected || pending || state?.busy} onClick={() => command('RESET')}>Acknowledge & reset</button>}
      <p className="operator-note">Laptop controls the session.<br/>The iPad is a display only.</p>
      <div role="alert">{(state?.error || error) && <p className="error">{state?.error || error}</p>}</div>
    </aside>}</div>
    {!display && <section className="captures"><div className="section-heading"><h2>The four frames</h2><span>Verified images appear here</span></div><Slots state={state}/><img style={{maxHeight:500, maxWidth:'100%',marginTop:16}} src={state?.previewUrl ?? '/templates/page-1.png'} alt="Progressive Frame CAP double strip"/></section>}
    {display && status === 'COMPLETE' && connected && <Slots state={state}/>}
    <footer><span>{display ? 'DISPLAY ONLY' : 'MOCK CAMERA TEST ENVIRONMENT'}</span><span className="session-id">{state?.sessionId ?? 'No session started'}</span></footer>
    <span className="sr-only" role="status">{connected ? `Session ${status}. Photo ${state?.photo ?? 0} of 4.` : 'Connection lost. Waiting for server.'}</span>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
