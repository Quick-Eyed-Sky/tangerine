const API = '/__tangerine__/recordings';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, body, binary = false) {
  const response = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': binary ? 'application/octet-stream' : 'application/json' },
    body: binary ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The recording could not be written to disk.');
  return result;
}

export class DiskRecorder {
  constructor(onChange) {
    this.onChange = onChange;
    this.state = 'idle';
    this.frames = 0;
    this.writtenFrames = 0;
    this.pendingBytes = 0;
    this.files = [];
    this.error = null;
    this.chain = Promise.resolve();
  }
  get active() { return ['starting', 'recording', 'stopping'].includes(this.state); }
  get seconds() { return this.frames / (this.rate || 48000); }
  get savedSeconds() { return this.writtenFrames / (this.rate || 48000); }
  changed() { this.onChange?.(this); }

  async start({ audio, external = false, seed }) {
    if (this.active) return;
    this.state = 'starting'; this.error = null; this.frames = 0; this.writtenFrames = 0;
    this.pendingBytes = 0; this.sequence = 0; this.files = []; this.chain = Promise.resolve();
    this.folder = null; this.session = null; this.flushResolve = null; this.changed();
    try {
      // Ask from the click itself: never reload, pause or inspect the other tab.
      if (external) {
        this.stream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: 'browser', frameRate: 1 },
          audio: { suppressLocalAudioPlayback: false },
          selfBrowserSurface: 'exclude', systemAudio: 'exclude',
          surfaceSwitching: 'exclude', monitorTypeSurfaces: 'exclude',
        });
        if (!this.stream.getAudioTracks().length) throw new Error('No tab audio was shared. Choose a Chrome tab and enable “Share tab audio”.');
      } else {
        if (!audio?.graph || !audio.playing) throw new Error('Start the vine first, then record it.');
        this.tap = audio.ctx.createMediaStreamDestination();
        this.output = audio.graph.out;
        this.output.connect(this.tap);
        this.stream = this.tap.stream;
      }
      // Its own capture clock keeps working when the instrument is paused.
      this.ctx = new AudioContext({ latencyHint: 'playback' });
      await this.ctx.resume();
      this.rate = this.ctx.sampleRate;
      await this.ctx.audioWorklet.addModule('./disk-capture.js');
      this.source = this.ctx.createMediaStreamSource(new MediaStream(this.stream.getAudioTracks()));
      this.node = new AudioWorkletNode(this.ctx, 'tangerine-disk-capture', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
        channelCount: 2, channelCountMode: 'explicit',
      });
      const info = await request('/start', { sampleRate: this.rate, source: external ? 'other-tab' : 'tangerine', seed });
      this.session = info.id; this.folder = info.folder; this.sourceName = external ? 'Other Chrome tab' : 'This vine';
      this.node.port.onmessage = ({ data }) => {
        if (data.stopped) { this.flushResolve?.(); return; }
        if (!data.pcm || this.error) return;
        this.frames += data.frames;
        this.pendingBytes += data.pcm.byteLength;
        const sequence = this.sequence++;
        this.chain = this.chain.then(async () => {
          if (this.error) return;
          let saved;
          for (let attempt = 0; attempt < 3; attempt++) {
            try { saved = await request(`/${this.session}/chunk?sequence=${sequence}`, data.pcm, true); break; }
            catch (error) { if (attempt === 2) throw error; await delay(500); }
          }
          this.pendingBytes -= data.pcm.byteLength;
          this.writtenFrames += data.frames;
          this.files = saved.files;
          this.changed();
        }).catch((error) => {
          this.error = error; this.changed();
          if (this.state === 'recording') this.stop();
        });
        if (this.pendingBytes > this.rate * 4 * 60) {
          this.error = new Error('Disk writing has fallen over a minute behind. Recording stopped; the saved files remain on your Mac.');
          this.stop();
        }
        this.changed();
      };
      this.source.connect(this.node);
      // The worklet outputs silence: the original tab remains the only audible source.
      this.node.connect(this.ctx.destination);
      this.state = 'recording'; this.changed();
      for (const track of this.stream.getTracks()) track.addEventListener('ended', () => {
        if (this.state === 'recording') this.stop();
      });
    } catch (error) {
      if (this.session) { try { await request(`/${this.session}/stop`, {}); } catch { /* Keep the server-side file. */ } }
      this.error = error; this.state = 'error'; await this.cleanup(); this.changed();
      throw error;
    }
  }

  async stop() {
    if (this.state !== 'recording') return;
    this.state = 'stopping'; this.changed();
    const flushed = new Promise((resolve) => { this.flushResolve = resolve; });
    this.node.port.postMessage('stop');
    let timeout;
    await Promise.race([flushed, new Promise((resolve) => { timeout = setTimeout(() => {
      this.error ||= new Error('The last audio block could not be confirmed. Previously saved audio is safe.'); resolve();
    }, 3000); })]);
    clearTimeout(timeout);
    await this.chain;
    try {
      const result = await request(`/${this.session}/stop`, {});
      this.files = result.files;
    } catch (error) { this.error ||= error; }
    await this.cleanup();
    this.state = this.error ? 'error' : 'saved'; this.changed();
  }
  async cleanup() {
    try { this.output?.disconnect(this.tap); } catch { /* A context may already be closed. */ }
    this.output = null; this.tap = null;
    this.source?.disconnect(); this.node?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.ctx && this.ctx.state !== 'closed') await this.ctx.close();
    this.ctx = null;
  }
}
