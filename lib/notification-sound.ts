/**
 * Som de notificacao tri-tone (estilo iPhone message) via Web Audio API.
 * Nao depende de arquivo de audio externo.
 * Em navegadores que exigem gesto do usuario para audio, o som pode so tocar apos a primeira interacao.
 */

let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioContext = new Ctx();
  }
  return audioContext;
}

/**
 * Toca um tri-tone curto similar ao som de mensagem do iPhone.
 * Tres notas ascendentes (B5 -> E6 -> B6) com envelope bell-like.
 * Falha em silencio se o navegador bloquear audio ou nao suportar.
 */
export function playNotificationSound(): void {
  try {
    const ctx = getContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.3, now);
    masterGain.connect(ctx.destination);

    // Tri-tone: three quick ascending notes
    const notes = [
      { freq: 988, start: 0, dur: 0.1 }, // B5
      { freq: 1319, start: 0.12, dur: 0.1 }, // E6
      { freq: 1976, start: 0.24, dur: 0.15 }, // B6
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, now + note.start);

      // Quick attack + smooth decay (bell-like envelope)
      gain.gain.setValueAtTime(0, now + note.start);
      gain.gain.linearRampToValueAtTime(1, now + note.start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.01, now + note.start + note.dur);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now + note.start);
      osc.stop(now + note.start + note.dur + 0.05);
    }
  } catch {
    // ignorar falhas (navegador sem suporte ou audio bloqueado)
  }
}
