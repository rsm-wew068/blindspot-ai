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
  return {
    async resume() { await context.resume(); },
    play() {
      if (context.state !== 'running') return;
      const now = context.currentTime;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      gain.connect(context.destination);
      const tone = context.createOscillator();
      tone.type = 'triangle';
      tone.frequency.setValueAtTime(115, now);
      tone.frequency.exponentialRampToValueAtTime(38, now + 0.2);
      tone.connect(gain);
      tone.start(now);
      tone.stop(now + 0.25);
      tone.onended = () => { tone.disconnect(); gain.disconnect(); };
    },
    close() { void context.close().catch(() => {}); },
  };
}
