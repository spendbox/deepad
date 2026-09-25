/** Bigger sprays throw more confetti: more pieces per wave, and more waves. */
export function confettiVolume(amountKobo: number): { waves: number; perWave: number } {
  const naira = Math.max(100, amountKobo / 100);
  const perWave = Math.round(Math.min(70, Math.max(16, 10 + 14 * Math.log10(naira / 100))));
  const waves = naira < 2_000 ? 1 : naira < 10_000 ? 2 : naira < 50_000 ? 3 : naira < 200_000 ? 4 : 5;
  return { waves, perWave };
}
