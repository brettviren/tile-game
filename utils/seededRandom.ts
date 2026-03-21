/**
 * Creates a seeded pseudo-random number generator function.
 * @param seed The seed to initialize the generator.
 * @returns A function that returns a pseudo-random number between 0 (inclusive) and 1 (exclusive).
 */
export function createSeededRandom(seed: number): () => number {
  // Linear Congruential Generator (LCG) parameters
  // Constants commonly used in C standard library's rand()
  const m = 0x80000000; // 2**31
  const a = 1103515245;
  const c = 12345;

  let state = seed % m; // Initialize state with the provided seed

  return function() {
    state = (a * state + c) % m; // Update state
    return state / m; // Return a number between 0 and 1
  };
}