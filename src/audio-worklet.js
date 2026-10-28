class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunkFrames = Math.max(128, Math.round(sampleRate * 0.1));
    this.buffer = new Float32Array(this.chunkFrames);
    this.index = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length || !input[0]) return true;
    const channels = input.length;
    const frames = input[0].length;

    for (let i = 0; i < frames; i += 1) {
      let mixed = 0;
      for (let channel = 0; channel < channels; channel += 1) {
        mixed += input[channel][i] || 0;
      }
      mixed /= channels;
      this.buffer[this.index] = mixed;
      this.index += 1;
      if (this.index >= this.chunkFrames) this.flush();
    }
    return true;
  }

  flush() {
    const pcm = new Int16Array(this.chunkFrames);
    let sumSquares = 0;
    for (let i = 0; i < this.chunkFrames; i += 1) {
      const sample = Math.max(-1, Math.min(1, this.buffer[i]));
      pcm[i] = sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767);
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / this.chunkFrames);
    this.port.postMessage({ pcm: pcm.buffer, rms, sampleRate }, [pcm.buffer]);
    this.index = 0;
  }
}

registerProcessor('pcm-capture', PCMCaptureProcessor);
