import { createRoot } from 'react-dom/client';
import { useSession } from './useSession';
import './styles.css';

function App() {
  const display = location.pathname === '/display';
  const { state, connected, error, pending, command } = useSession(!display);
  const status = state?.status ?? 'IDLE';
  const saved = state?.captures.filter(c => c.status === 'saved').length ?? 0;
  const mock = state?.camera !== 'nikon';
  const message = !connected ? 'Reconnecting…' : status === 'COMPLETE' ? 'Your photos are ready!' : status === 'COUNTDOWN' ? `Photo ${state?.photo} of 4` : status === 'CAPTURING' ? 'Smile!' : status === 'SAVING' || status === 'COMPOSING' ? 'Saving your photo…' : status === 'ERROR' ? 'Please wait for assistance' : status === 'CANCELLED' ? 'Session cancelled' : 'Get Ready';
  const frame = state?.previewUrl ?? `/templates/page-${state?.templatePage ?? 1}.png`;
  if (display) return <main className="display">
    <header><span className="wordmark">CAP <small>PHOTOBOOTH</small></span><span className="badge">{mock ? 'MOCK · TEST PREVIEW' : 'NIKON Z30'}</span><span className="connection">{connected ? 'Connected' : 'Reconnecting'}</span></header>
    <section className="customer-preview" aria-label={mock ? 'Mock camera preview' : 'Nikon Live View'}>
      {state?.liveViewUrl && connected ? <img className="live-view" src={state.liveViewUrl} alt="Nikon Live View"/> : <div className="preview-placeholder" aria-hidden="true"><div className="lens"/></div>}
      <div className={`guidance${state?.liveViewUrl ? ' over-live' : ''}`}><p className="eyebrow">{status === 'COUNTDOWN' ? 'LOOK AT THE CAMERA' : 'MAKE A MEMORY'}</p>
        {connected && status === 'COUNTDOWN' && <div className="countdown">{state?.remainingSeconds}</div>}
        <h1>{message}</h1><p>{status === 'COMPLETE' ? 'All four photos are safely saved.' : mock ? 'Mock mode · no real camera image' : status === 'ERROR' ? 'Your operator will help you.' : 'Your operator will guide the session.'}</p>
      </div>
      {connected && status === 'CAPTURING' && <div className="flash" key={`${state?.sessionId}-${state?.photo}`} aria-hidden="true"/>}
    </section><footer><span>UNIVERSITY MEDIA TEAM</span><span>{connected && state?.photo ? `Photo ${state.photo} of 4` : 'FOUR FRAMES. ONE MEMORY.'}</span></footer>
    {status === 'COMPLETE' && connected && <div className="customer-result"><img src={frame} alt="Completed double photo strip"/></div>}
  </main>;
  return <main className="operator">
    <header><div className="wordmark">CAP <small>MEDIA TEAM / PHOTOBOOTH</small></div><div className="header-right"><span className="connection">{connected ? 'Connected' : 'Reconnecting'}</span><a href="/display" target="_blank" rel="noreferrer">Open iPad display ↗</a></div></header>
    <div className="workspace"><aside className="controls"><div className="intro"><p className="eyebrow">OPERATOR WORKSPACE</p><h1>Let’s make memories.</h1><p>Four frames. A moment to keep.</p></div>
      <div className={`mode ${mock ? 'mock' : 'real'}`}><strong>{mock ? 'MOCK CAMERA — TEST IMAGES' : 'REAL NIKON Z30'}</strong><span>{mock ? 'No physical shutter will be triggered.' : state?.cameraStatus ?? 'Hardware validation required'}</span></div>
      <div className="status-row"><h2>{status}</h2><span>{saved} / 4 saved</span></div>
      <dl><div><dt>Camera connection</dt><dd>{state?.cameraStatus ?? (connected ? 'Mock ready' : 'Disconnected')}</dd></div><div><dt>Countdown</dt><dd>{connected && status === 'COUNTDOWN' ? `${state?.remainingSeconds}s` : '—'}</dd></div><div><dt>Current photo</dt><dd>{state?.photo ?? 0} / 4</dd></div><div><dt>Verification</dt><dd>{saved === 4 ? 'All originals verified' : `${saved} verified JPEGs`}</dd></div><div><dt>Final output</dt><dd>{state?.output ? 'Verified · ready' : status === 'COMPOSING' ? 'Generating…' : 'Pending'}</dd></div></dl>
      <div className="actions"><button className="primary" disabled={!connected || pending || state?.busy || state?.canStartSession === false || !['IDLE','COMPLETE'].includes(status)} onClick={() => command('START')}>Start Session <span aria-hidden="true">→</span></button><div className="secondary-actions"><button disabled={!connected || pending || !state?.busy || ['CANCELLED','ERROR','RESETTING'].includes(status)} onClick={() => command('CANCEL')}>Cancel Session</button><button disabled={!connected || pending || status === 'IDLE'} onClick={() => {
        if (status === 'COMPLETE' && !window.confirm('Retake this completed session? Its final JPG, PDF and manifest will be permanently deleted. Earlier sessions will be kept.')) return;
        command('RESET', status === 'COMPLETE');
      }}>{['ERROR','CANCELLED'].includes(status) ? 'Acknowledge & reset' : 'Reset / Retake'}</button></div></div>
      <div className="slots">{Array.from({length:4}, (_,i) => <figure key={i}>{state?.captures[i]?.status === 'saved' ? <img src={`/media/${state.sessionId}/photo/${i+1}`} alt={`Saved mock photo ${i+1}`}/> : <div className="empty-slot">0{i+1}</div>}<figcaption>Photo {i+1}</figcaption></figure>)}</div>
      <div className="error-region" role="alert">{(error || state?.error) && <p className="error">{error || state?.error}</p>}</div>
      <div className="storage-note">{!mock && <p>Live View: {state?.liveViewStatus ?? 'Unavailable'}</p>}<span className="eyebrow">OUTPUT FOLDER</span><p>{state?.outputFolder ?? 'storage/output'}</p>{state?.output && <div><a href={state.output.jpgUrl} download>Download JPG</a> · <a href={state.output.pdfUrl} download>Print PDF</a></div>}</div>
    </aside><section className="frame-panel"><div className="panel-heading"><div><p className="eyebrow">YOUR DOUBLE STRIP</p><h2>{status === 'COMPLETE' ? 'Ready to keep.' : 'A little moment, twice.'}</h2></div><span className="badge">{saved} / 4 PHOTOS</span></div><div className="frame-stage"><img src={frame} alt="Progressive Frame CAP double strip"/></div><div className="frame-caption"><span>Frame CAP · {state?.templatePage === 2 ? 'Blue / Green' : 'Coral / Sky'}</span><span>Original artwork · cover crop</span></div></section></div>
    <footer><span>10 SECONDS PER PHOTO · SERVER SYNCHRONIZED</span><span className="session-id">{state?.sessionId ?? 'No session started'}</span></footer>
    <span className="sr-only" role="status">{connected ? `Session ${status}. Photo ${state?.photo ?? 0} of 4.` : 'Connection lost. Waiting for server.'}</span>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
