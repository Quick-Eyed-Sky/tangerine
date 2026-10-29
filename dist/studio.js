import { DiskRecorder } from './disk-recorder.js';

export function initStudio({ getAudio, notify, startFromBeginning }) {
  const $ = (id) => document.getElementById(id);
  const duration = (seconds) => {
    const s = Math.max(0, Math.floor(seconds));
    return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  let available = false;
  let folder = '';
  const recorder = new DiskRecorder(renderRecording);
  const scroll = { play: 0, compose: 0, keep: 0 };
  function selectPanel(panel, target) {
    scroll[document.body.dataset.panel] = window.scrollY;
    document.body.dataset.panel = panel;
    document.querySelectorAll('[data-panel-target]').forEach((button) => {
      if (button.dataset.panelTarget === panel) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    if (window.innerWidth <= 740 || document.body.classList.contains('preview-phone')) {
      window.scrollTo({ top: scroll[panel] || 0, behavior: 'instant' });
    }
    if (target) $(target).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }
  document.querySelectorAll('[data-panel-target]').forEach((button) => button.addEventListener('click', () => selectPanel(button.dataset.panelTarget)));
  $('quickKeep').addEventListener('click', () => selectPanel('keep', 'keepSection'));
  $('hintToggle').addEventListener('click', () => {
    const on = document.body.classList.toggle('show-hints');
    $('hintToggle').setAttribute('aria-pressed', String(on));
    $('hintToggle').textContent = on ? 'Hide tips' : 'Show tips';
  });
  function preview(on) {
    document.body.classList.toggle('preview-phone', on);
    $('previewToggle').setAttribute('aria-pressed', String(on));
    $('previewToggle').textContent = on ? 'Desktop view' : 'Phone preview';
  }
  $('previewToggle').addEventListener('click', () => preview(!document.body.classList.contains('preview-phone')));
  preview(new URLSearchParams(location.search).get('preview') === 'phone');

  let activeOnly = false;
  function filterLayers() {
    document.querySelectorAll('.layer').forEach((card) => { card.hidden = activeOnly && card.classList.contains('off') && !card.classList.contains('soloed'); });
  }
  for (const [id, active] of [['showAllLayers', false], ['showActiveLayers', true]]) {
    $(id).addEventListener('click', () => {
      activeOnly = active; $('showAllLayers').setAttribute('aria-pressed', String(!active));
      $('showActiveLayers').setAttribute('aria-pressed', String(active)); filterLayers();
    });
  }
  new MutationObserver(filterLayers).observe($('layerList'), { attributes: true, attributeFilter: ['class'], subtree: true });
  document.querySelectorAll('.edit-layer').forEach((button) => button.addEventListener('click', () => {
    const card = button.closest('.layer');
    const editing = !card.classList.contains('editing');
    document.querySelectorAll('.layer.editing').forEach((other) => {
      other.classList.remove('editing'); other.querySelector('.edit-layer').setAttribute('aria-expanded', 'false');
    });
    card.classList.toggle('editing', editing);
    button.setAttribute('aria-expanded', String(editing));
  }));

  async function record(external = false) {
    if (recorder.state === 'recording') { await recorder.stop(); return; }
    if (recorder.active) return;
    if (!available) { if (!external) $('recordPassageButton').click(); return; }
    if (!external && !getAudio().playing) {
      selectPanel('play'); notify('Start the vine, then press Record. To keep an existing session, choose “Record an already playing Chrome tab”.'); return;
    }
    try { await recorder.start({ audio: getAudio(), external, seed: external ? null : getAudio().seed }); }
    catch (error) { notify(error.name === 'NotAllowedError' ? 'Tab sharing was cancelled. Your playing session is unchanged.' : error.message); }
  }
  $('recordButton').addEventListener('click', () => record());
  $('quickRecord').addEventListener('click', () => record());
  $('recordOtherTab').addEventListener('click', () => record(true));

  // Timed recording: a length slider, and one button that starts it from the beginning.
  const minutesLabel = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
  const timedSlider = $('timedMinutes');
  function renderTimed() {
    const m = Number(timedSlider.value);
    $('timedMinutesValue').textContent = minutesLabel(m);
    const seconds = (v) => (v >= 60 ? `${Math.floor(v / 60)} min${v % 60 ? ` ${v % 60} s` : ''}` : `${v} s`);
    $('timedIntroValue').textContent = seconds(Number($('timedIntro').value));
    $('timedOutroValue').textContent = seconds(Number($('timedOutro').value));
    const bytes = m * 60 * 44100 * 4;
    const size = bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1).replace('.', ',')} GB` : `${Math.round(bytes / 1e6)} MB`;
    $('timedSize').textContent = `About ${size} on your Mac (WAV, 44.1 kHz stereo).`;
    $('timedText').textContent = recorder.active
      ? (recorder.limitSeconds ? `Recording from the beginning · ${duration(recorder.seconds)} of ${minutesLabel(recorder.limitSeconds / 60)}` : 'Recording…')
      : `Start from the beginning and record ${minutesLabel(m)}`;
    $('timedRecord').disabled = recorder.active || !available;
  }
  // Open folder: the recording in progress or the last one, or the Recordings folder.
  document.querySelectorAll('.open-folder').forEach((button) => button.addEventListener('click', async () => {
    try {
      const response = await fetch('/__tangerine__/recordings/reveal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: recorder.session || null }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The folder could not be opened.');
      notify(`Opened in the Finder: ${result.name}`);
    } catch (error) { notify(error.message || 'The folder could not be opened.'); }
  }));
  for (const slider of [timedSlider, $('timedIntro'), $('timedOutro')]) slider.addEventListener('input', renderTimed);
  $('timedRecord').addEventListener('click', async () => {
    try { await startFromBeginning(recorder, Number(timedSlider.value), { intro: Number($('timedIntro').value), outro: Number($('timedOutro').value) }); }
    catch (error) { notify(error.message || 'The recording could not start.'); }
    renderRecording();
  });
  renderTimed();

  function renderRecording() {
    if (!available) {
      const active = !!getAudio().recording;
      $('quickRecord').disabled = false;
      $('quickRecord').setAttribute('aria-pressed', String(active));
      $('quickRecord').querySelector('span').textContent = active ? 'Stop recording' : 'Record';
      $('quickRecordTime').hidden = !active;
      $('quickRecordTime').textContent = $('memoryRecordTime').textContent;
      $('recordButton').disabled = true;
      $('diskStatus').textContent = 'The local download writes WAV directly to disk. In this demo, use Record a passage (up to 30 minutes).';
      return;
    }
    const active = recorder.state === 'recording';
    const busy = ['starting', 'stopping'].includes(recorder.state);
    const label = active ? 'Stop & finish files' : recorder.state === 'starting' ? 'Starting…' : recorder.state === 'stopping' ? 'Finishing files…' : 'Record to Mac';
    $('recordText').textContent = label;
    $('recordTime').textContent = duration(recorder.seconds);
    $('recordButton').disabled = busy || !available;
    $('recordButton').setAttribute('aria-pressed', String(active));
    $('quickRecord').disabled = busy || !available;
    $('quickRecord').setAttribute('aria-pressed', String(active));
    $('quickRecord').querySelector('span').textContent = active ? 'Stop recording' : 'Record';
    $('quickRecordTime').hidden = !active;
    $('quickRecordTime').textContent = duration(recorder.seconds);
    $('recordLight').classList.toggle('active', active);
    $('recordOtherTab').disabled = recorder.active || !available || !navigator.mediaDevices?.getDisplayMedia;
    document.querySelectorAll('.open-folder').forEach((button) => {
      button.textContent = recorder.session ? 'Open this recording’s folder ↗' : 'Open the Recordings folder ↗';
    });
    renderTimed();
    if (!available) $('diskStatus').textContent = 'Direct-to-Mac recording is available with the local launcher. Recent passages remain available below.';
    else if (recorder.error) $('diskStatus').textContent = `${recorder.error.message} ${duration(recorder.savedSeconds)} confirmed on disk.`;
    else if (active) $('diskStatus').textContent = `● Recording ${recorder.sourceName.toLowerCase()} · ${duration(recorder.savedSeconds)} written to disk${recorder.pendingBytes ? ' · writing…' : ''}`;
    else if (recorder.state === 'saved') $('diskStatus').textContent = `Saved on your Mac · ${duration(recorder.savedSeconds)} · ${recorder.files.length} WAV file${recorder.files.length === 1 ? '' : 's'}.`;
    else if (busy) $('diskStatus').textContent = recorder.state === 'stopping' ? 'Writing the last audio block and closing the WAV files…' : 'Preparing the audio capture and local files…';
    else $('diskStatus').textContent = 'Ready. Audio is written progressively to disk, not held until the end.';
    $('diskStatus').classList.toggle('recording', active);
    $('diskStatus').classList.toggle('record-error', !!recorder.error);
    $('recordingPath').textContent = recorder.folder || folder;
    const signature = `${recorder.session}:${recorder.files.join(',')}:${recorder.active}`;
    if ($('diskFiles').dataset.signature !== signature) {
      $('diskFiles').dataset.signature = signature;
      $('diskFiles').replaceChildren(...recorder.files.map((file, i) => {
        const li = document.createElement('li'); const link = document.createElement('a');
        link.textContent = `${file}${recorder.active && i === recorder.files.length - 1 ? ' · writing' : ''}`;
        if (!recorder.active || i < recorder.files.length - 1) {
          link.href = `/__tangerine__/recordings/${recorder.session}/files/${encodeURIComponent(file)}`;
          link.download = file;
        }
        li.append(link); return li;
      }));
    }
  }
  const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const browserDemo = new URLSearchParams(location.search).has('demo');
  const detect = localHost && !browserDemo
    ? fetch('/__tangerine__/recordings').then((r) => r.ok ? r.json() : null).catch(() => null)
    : Promise.resolve(null);
  detect.then((info) => {
    available = info?.available === true; folder = info?.folder || '';
    $('portableRecording').hidden = available;
    $('diskControls').hidden = !available;
    $('timedBlock').hidden = !available;
    $('recordingPath').hidden = !available;
    $('diskFiles').hidden = !available;
    $('localDownload').hidden = available;
    $('editionLabel').textContent = available ? 'TANGERINE II · LOCAL' : 'TANGERINE II · BROWSER';
    $('diskTitle').textContent = available ? 'Record to this computer' : 'Keep a long session';
    $('diskIntro').textContent = available
      ? 'Everything from Record until Stop. Saved as WAV directly in the local Recordings folder.'
      : 'Download the local edition to record continuously to disk, without the browser’s 30-minute passage limit.';
    if (!available) $('diskHelp').textContent = 'The download uses a small Python server on your own computer. No account or external audio service. WAV files are split into consecutive one-hour parts.';
    if (!navigator.mediaDevices?.getDisplayMedia) $('recordOtherTab').hidden = true;
    renderRecording();
  });
  new MutationObserver(() => { if (!available) renderRecording(); }).observe($('recordPassageButton'), { attributes:true, attributeFilter:['aria-pressed'], childList:true, subtree:true, characterData:true });
  window.addEventListener('tangerine:controls', () => { if (!available) renderRecording(); });
  window.addEventListener('beforeunload', (event) => {
    if (!recorder.active) return;
    event.preventDefault(); event.returnValue = '';
  });
  // Stop is best-effort at unload; each acknowledged block already has a valid WAV header.
  window.addEventListener('pagehide', () => {
    if (recorder.session && recorder.active) navigator.sendBeacon(`/__tangerine__/recordings/${recorder.session}/stop`, new Blob(['{}'], { type: 'application/json' }));
  });
  return { recorder };
}
