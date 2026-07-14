/**
 * Hypergeometric distribution utilities for Commander mana probability.
 *
 * Hypergeometric PMF:
 *   P(X = k | N, K, n) = C(K,k) * C(N-K, n-k) / C(N,n)
 *
 * where:
 *   N = population size (library)
 *   K = success states in population (coloured sources)
 *   n = number of draws (cards seen by target turn)
 *   k = required successes (pips needed)
 */

/** Log-gamma function (Lanczos approximation) — stable for positive integers */
function logGamma(x: number): number {
  if (x <= 1) return logGamma(x + 1) - Math.log(x);
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  const x0 = x - 1;
  let a: number = c[0]!
  for (let i = 1; i < g + 2; i++) a += c[i]! / (x0 + i)
  const t = x0 + g + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (x0 + 0.5) * Math.log(t) - t + Math.log(a)
}

/** Log of C(n, k) — numerically stable for large n */
export function logBinom(n: number, k: number): number {
  if (k < 0 || k > n || !isFinite(n) || !isFinite(k)) return -Infinity;
  if (k === 0 || k === n) return 0;
  // Exploit symmetry for faster convergence
  const kk = k > n - k ? n - k : k;
  return logGamma(n + 1) - logGamma(kk + 1) - logGamma(n - kk + 1);
}

/** Log of hypergeometric PMF: log P(X = k | N, K, n) */
function logHyperPMF(N: number, K: number, n: number, k: number): number {
  return logBinom(K, k) + logBinom(N - K, n - k) - logBinom(N, n);
}

/**
 * P(X >= minK) for X ~ Hypergeometric(N, K, n)
 * Upper-tail CDF — the probability of drawing at least minK coloured sources.
 */
export function hypergeomAtLeast(N: number, K: number, n: number, minK: number): number {
  if (K <= 0 || n <= 0 || minK <= 0) return minK <= 0 ? 1 : 0;
  if (K >= N) return 1;
  if (n >= N) return K >= minK ? 1 : 0;

  const maxDraw = Math.min(K, n);
  if (minK > maxDraw) return 0;

  let prob = 0;
  for (let k = minK; k <= maxDraw; k++) {
    const lp = logHyperPMF(N, K, n, k);
    if (isFinite(lp)) prob += Math.exp(lp);
  }
  return Math.min(1, Math.max(0, prob));
}

/**
 * Optimised P(X >= 1) = 1 - P(X = 0).
 * Used frequently for single-pip requirements.
 */
export function hypergeomAtLeastOne(N: number, K: number, n: number): number {
  if (K <= 0 || n <= 0) return 0;
  if (K >= N) return 1;
  const logP0 = logBinom(N - K, n) - logBinom(N, n);
  if (!isFinite(logP0)) return logP0 < 0 ? 1 : 0;
  return Math.max(0, 1 - Math.exp(logP0));
}

/**
 * Effective draw count for Commander mana probability.
 *
 * Commander model (Karsten 2022):
 *  - Library: 99 cards (after commander removed)
 *  - Opening hand: 7 cards
 *  - Free first mulligan look: keep on 3–5 lands — improves effective sources
 *  - First-turn draw (multiplayer rules: no skip)
 *  - Conditioning on adequate total lands (games with land-screw excluded)
 *
 * Calibration: with effectiveDraws = 7 + turn + 1.5 (mulligan bonus),
 * 19 sources in 99 cards gives ~90% by T1, matching Karsten's published table.
 */
export function commanderEffectiveDraws(targetTurn: number): number {
  const openingHand = 7;
  const t1Draw = 1;
  const mulliganQualityBonus = 1.5; // free mulligan filters for better hands
  return openingHand + targetTurn + t1Draw + mulliganQualityBonus;
}

/**
 * Estimated probability of casting a spell with `pipsRequired` coloured pips
 * of one colour, given `sources` effective sources in a `librarySize`-card deck,
 * by `targetTurn`.
 *
 * Uses hypergeometric distribution with Commander-calibrated effective draws.
 * This is an approximation — use the simulation worker for exact probabilities.
 */
export function estimateCastProbability(
  librarySize: number,
  sources: number,
  targetTurn: number,
  pipsRequired: number,
): number {
  if (sources <= 0) return 0;
  if (pipsRequired <= 0) return 1;

  const n = Math.min(librarySize, Math.round(commanderEffectiveDraws(targetTurn)));
  const K = Math.min(librarySize, Math.round(sources));
  return hypergeomAtLeast(librarySize, K, n, pipsRequired);
}

/**
 * Find the minimum number of sources K such that:
 *   P(X >= pips | N, K, n) >= targetProb
 *
 * Binary search over K in [0, N].
 */
export function sourcesNeededForProbability(
  librarySize: number,
  targetTurn: number,
  pipsRequired: number,
  targetProb: number,
): number {
  const n = Math.round(commanderEffectiveDraws(targetTurn));
  let lo = 0;
  let hi = librarySize;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const p = hypergeomAtLeast(librarySize, mid, n, pipsRequired);
    if (p >= targetProb) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
