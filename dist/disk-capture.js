// Independent output tap. No synthesis, sequencing or musical settings here.
class DiskCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity = Math.ceil(sampleRate / 128) * 128;
    this.pcm = new Int16Array(this.capacity * 2);
    this.frames = 0;
    this.active = true;
    this.port.onmessage = ({ data }) => {
      if (data === 'stop') {
        this.active = false;
        this.flush();
        this.port.postMessage({ stopped: true });
      }
    };
  }
  flush() {
    if (!this.frames) return;
    const pcm = this.pcm.slice(0, this.frames * 2);
    this.port.postMessage({ pcm: pcm.buffer, frames: this.frames }, [pcm.buffer]);
    this.frames = 0;
  }
  process(inputs) {
    if (!this.active) return true;
    const input = inputs[0];
    const frames = input?.[0]?.length || 128;
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < 2; c++) {
        const value = Math.max(-1, Math.min(1, input?.[c]?.[i] ?? input?.[0]?.[i] ?? 0));
        this.pcm[(this.frames + i) * 2 + c] = value < 0 ? value * 32768 : value * 32767;
      }
    }
    this.frames += frames;
    if (this.frames >= this.capacity) this.flush();
    return true;
  }
}
registerProcessor('tangerine-disk-capture', DiskCapture);
