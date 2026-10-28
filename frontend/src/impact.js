// Only forward playback into the terminal collision may produce audio.
// Scrubbing, controller changes, and camera changes stay silent.
export function enteredCollision(previous, current) {
  return !!(previous && previous.run === current.run && previous.playing &&
    previous.time < current.duration && current.time >= current.duration &&
    current.collision && current.fromPlayback);
}

export function createImpactAudio() {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return null;
  const context = new Context();
  // A quiet layered motor hum. Pitch follows simulated speed, not playback rate.
  const engineGain = context.createGain();
  engineGain.gain.value = 0;
  engineGain.connect(context.destination);
  const engineTones = [1, 2, 4].map((harmonic) => {
    const tone = context.createOscillator();
    const level = context.createGain();
    tone.type = 'triangle';
    level.gain.value = 1 / (harmonic * 3);
    tone.connect(level); level.connect(engineGain); tone.start();
    return {tone, level, harmonic};
  });
  return {
    engine(speed) {
      const now = context.currentTime;
      const active = speed !== null && Number.isFinite(speed);
      const velocity = active ? Math.max(0, speed) : 0;
      engineGain.gain.setTargetAtTime(active ? .10 : 0, now, .04);
      for (const {tone, harmonic} of engineTones)
        tone.frequency.setTargetAtTime((45 + Math.min(velocity, 50) * 2.8) * harmonic, now, .08);
    },
    async resume() { await context.resume(); },
    play() {
      if (context.state !== 'running') return false;
      const now = context.currentTime;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      gain.connect(context.destination);
      const tone = context.createOscillator();
      tone.type = 'triangle';
      tone.frequency.setValueAtTime(260, now);
      tone.frequency.exponentialRampToValueAtTime(70, now + 0.32);
      tone.connect(gain);
      tone.start(now);
      tone.stop(now + 0.4);
      tone.onended = () => { tone.disconnect(); gain.disconnect(); };
      // Mid-frequency contact noise remains audible on small laptop speakers.
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.18), context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      const noise = context.createBufferSource();
      noise.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 1800;
      const noiseGain = context.createGain();
      noiseGain.gain.setValueAtTime(0.12, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      noise.connect(filter); filter.connect(noiseGain); noiseGain.connect(context.destination);
      noise.start(now);
      noise.onended = () => { noise.disconnect(); filter.disconnect(); noiseGain.disconnect(); };
      return true;
    },
    close() { for (const {tone, level} of engineTones) { tone.stop(); tone.disconnect(); level.disconnect(); } engineGain.disconnect(); void context.close().catch(() => {}); },
  };
}
