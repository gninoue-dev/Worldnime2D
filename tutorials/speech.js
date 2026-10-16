// Texte de narration : version prononcée (pour la voix) et découpage en sous-titres.
// Les sous-titres gardent l'orthographe normale ; seule la voix reçoit les graphies phonétiques.

// Mots anglais ou abréviations que la voix française lit mal. L'ordre compte (expressions d'abord).
const SPEECH = [
  [/Worldnime2D/g, 'Ouorldnime 2 D'],
  [/\bCtrl\b/g, 'Contrôle'],
  [/\bMaj\b/g, 'Majuscule'],
  [/\bSuppr\b/g, 'Suppression'],
  [/(?<!\p{L})Échap(?!\p{L})/gu, 'Échappe'],
  [/\btimelines?\b/gi, 'taïme laïne'],
  [/\bruntimes?\b/gi, 'rune taïme'],
  [/\bskins\b/gi, 'skinnes'],
  [/\bskin\b/gi, 'skinne'],
  [/\bslots\b/gi, 'sllottes'],
  [/\bslot\b/gi, 'sllotte'],
  [/\bJSON\b/g, 'djé-sonne'],
  [/\bIK\b/g, 'I-K'],
  [/\bWebM\b/g, 'ouèbe-èm'],
  [/\bWebGL\b/g, 'ouèbe-G-L'],
  [/\bSpine\b/g, 'Spaïne'],
  [/\bGIF\b/g, 'jif'],
  [/\bORA\b/g, 'O-R-A'],
  [/\bFFD\b/g, 'F-F-D'],
  [/\bAppImage\b/g, 'App-image'],
  [/\bclipping\b/gi, 'clipinng'],
  [/\bGitHub\b/g, 'Guitt-Heub'],
  [/\.wn2d\b/g, 'point W-N-2-D'],
  [/\bwn2d\b/g, 'W-N-2-D'],
  [/\bonion\b/gi, 'oignon'],
  [/\s*\+\s*/g, ' plus '],
  [/ : /g, ', '],
  [/«\s*|\s*»/g, ''],
  [/\s*—\s*/g, ', '],
  [/(\d+)\s*%/g, '$1 pour cent'],
  [/(\d+)\s*°/g, '$1 degrés'],
];

export function forSpeech(text) {
  let s = text;
  for (const [re, rep] of SPEECH) s = s.replace(re, rep);
  return s;
}

// Découpe un texte en sous-titres de deux lignes au plus, répartis sur la durée de la narration
// en proportion du nombre de lettres.
export function subtitleChunks(text, duration, maxLen = 84) {
  const sentences = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s+/);
  const chunks = [];
  for (const s of sentences) {
    if (s.length <= maxLen) {
      chunks.push(s);
      continue;
    }
    // Phrase longue : coupe aux virgules, sinon aux espaces.
    let cur = '';
    for (const word of s.split(' ')) {
      const next = cur ? `${cur} ${word}` : word;
      if (next.length > maxLen && cur) {
        chunks.push(cur);
        cur = word;
      } else {
        cur = next;
      }
      if (/[,;:]$/.test(word) && cur.length > maxLen * 0.55) {
        chunks.push(cur);
        cur = '';
      }
    }
    if (cur) chunks.push(cur);
  }
  const letters = chunks.reduce((a, c) => a + c.length, 0) || 1;
  let t = 0;
  return chunks.map((c) => {
    const len = (c.length / letters) * duration;
    const from = t;
    t += len;
    // Retour à la ligne vers le milieu pour les sous-titres longs.
    let textOut = c;
    if (c.length > 44) {
      const mid = c.length / 2;
      let best = -1;
      for (let i = 0; i < c.length; i++) if (c[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
      if (best > 0) textOut = `${c.slice(0, best)}\n${c.slice(best + 1)}`;
    }
    return { from, to: t - 0.05, text: textOut };
  });
}
