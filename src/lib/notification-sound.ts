/** Short two-tone chime via Web Audio — no asset file, instant playback. */

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext || audioContext.state === "closed") audioContext = new Ctx();
  return audioContext;
}

/** Call once after login / first click so autoplay policy allows sounds on any tab. */
export function primeNotificationSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
}

function playChime(ctx: AudioContext) {
  const t = ctx.currentTime;
  const master = ctx.createGain();
  master.connect(ctx.destination);
  master.gain.setValueAtTime(0.0001, t);
  master.gain.exponentialRampToValueAtTime(0.28, t + 0.012);
  master.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);

  const tone = (freq: number, start: number, duration: number, volume: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  };

  // Crisp notification ding — second note starts before first ends (tight, familiar feel)
  tone(880, t, 0.14, 1);
  tone(1318.51, t + 0.07, 0.22, 0.85);
}

/** Plays immediately in the same tick as the notification is created. */
export function playNotificationSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const run = () => {
    try {
      playChime(ctx);
    } catch {
      /* ignore */
    }
  };

  if (ctx.state === "suspended") {
    void ctx.resume().then(run);
    return;
  }
  run();
}

/** Attach once on dashboard — unlocks audio after any user gesture. */
export function installNotificationSoundUnlock() {
  if (typeof window === "undefined") return () => {};

  const unlock = () => {
    primeNotificationSound();
  };

  window.addEventListener("pointerdown", unlock, { capture: true, once: true });
  window.addEventListener("keydown", unlock, { capture: true, once: true });
  primeNotificationSound();

  return () => {
    window.removeEventListener("pointerdown", unlock, { capture: true });
    window.removeEventListener("keydown", unlock, { capture: true });
  };
}
