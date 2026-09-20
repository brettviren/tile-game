# Exponentile strategy

Strategies for maximising score, derived from the rules in `about.txt` and verified
against the implementation in `hooks/useBoard.ts`.

## The two formulas that matter

For a match of `k` tiles of value `v` (`k` counts the seed tile):

    new seed value = v + k - 2
    score awarded  = 2^(v + k - 2)

The score awarded by a match is exactly the number printed on the tile the match
produces. The game score is the running sum of those numbers over every match,
including every match formed by the cascade that follows a swap.

## Match shapes

A direction pair (up/down, left/right) contributes only if it holds at least two
further tiles of the seed's value. When both the horizontal and the vertical pair
qualify, both contribute to the same match. This makes corner and junction shapes
as valuable as long straight lines, and much easier to build on an 8-wide board.

| shape                                  | tiles | new value |
|----------------------------------------|-------|-----------|
| 3 in a line                            | 3     | `v+1`     |
| 4 in a line                            | 4     | `v+2`     |
| 5 in a line                            | 5     | `v+3`     |
| L-corner or T, 3 and 3 sharing the seed| 5     | `v+3`     |
| plus with two-tile arms                | 9     | `v+7`     |

## The material economy

Track the board's "mass", the sum of `2^value` over all 64 tiles. A match converts
`k * 2^v` of mass into `2^(v+k-2)`, a ratio of `2^(k-2) / k`:

| k          | 3    | 4    | 5    | 6    | 7    | 9     |
|------------|------|------|------|------|------|-------|
| mass ratio | 0.67 | 1.00 | 1.60 | 2.67 | 4.57 | 14.2  |

Three-matches destroy a third of the material fed to them. Four-matches are free.
Five and above are profitable. Per tile consumed, a longer match is always worth
more, and the advantage compounds because the surviving tile is higher-valued.

## The self-replenishing band

New tiles are only ever created with values 1 to 4, so values 1-4 are a band that
refills itself. Any tile of value 5 or more is sediment: it can leave the board
only by finding two more tiles of its own value.

A match keeps the board inside the band when `v + k - 2 <= 4`. So three 1s, 2s or
3s cost nothing at all; three 4s produce the first sediment tile. Larger matches on
low tiles leave the band sooner, which is why grabbing every four-in-a-row is a
trap in the early board.

Merging sediment is the only way to reclaim space: `k` sediment tiles become one
higher tile plus `k-1` fresh low tiles.

## Strategy

1. **Survival beats greed.** Score accumulates per match with no move limit, so the
   number of moves you get is the dominant term. Do not cash a match merely because
   it is the biggest one on the screen.

2. **Churn 1s, 2s and 3s freely.** These matches stay inside the refill band and add
   no dead weight. Matching three 4s is the first irreversible act on the board.

3. **Build L and T shapes rather than lines.** A seed at the junction takes `v+3`
   from five tiles where a line of three gives `v+1`.

4. **Never three-match a high tile you could four-match.** At `v=9` that is 1024
   points against 2048, and the four-match is mass-neutral instead of burning a
   third of hard-won material.

5. **Choose where the merged tile lands.** The result appears in the cell the swapped
   tile moves into, so completing a line from one end or the other places the new
   tile where you want it. Always finish from the end that puts the result in line
   with, or adjacent to, an existing tile of that same new value. This is the main
   lever for building a ladder instead of orphans.

6. **Keep sediment clustered.** Scattered high tiles are dead board. Aim merge
   outputs into the same rows and columns as their future partners.

7. **Predict cascade landings.** In a cascade the seed is the tile with the highest
   resulting value; ties go to the left-most tile, and to the top-most tile in a
   purely vertical run. A vertical run's merged tile then falls to the bottom of the
   run under gravity.

## Simulation evidence

Eighty complete games per policy, played against the real `swapTile`:

| policy                                | mean score | median moves |
|---------------------------------------|------------|--------------|
| always take the cheapest match        | 15.5k      | 261          |
| keep merges inside values 1-4         | 14.1k      | 278          |
| greedy, always take the highest score  | 13.6k      | 210          |
| grab any match of four or more        | 9.7k       | 144          |

Greedy play loses. Cashing in big matches early buries the board in sediment and
ends the game roughly 40% sooner than the extra points are worth.

A caveat on these numbers: every policy tested plateaued at a maximum tile value
around 9 to 11, because none of them plan ahead or choose where the merged tile
lands. Since score is exponential in tile value, a player who applies point 5
deliberately should beat all of these figures. The simulation establishes that
patience wins; it does not establish a ceiling.

# Running the strategies

Every strategy above is encoded as a function in `lib/strategies.ts` and can be
applied automatically, either from the command line or from the web app. Both
paths drive the very same `swapTile` the game itself uses, through the shared
headless engine in `lib/engine.ts`, so a run in either place plays the same game.

## Combining strategies

A strategy scores each legal move; higher is preferred. Several may be applied
at once, as a comma separated specification of `NAME` or `NAME:WEIGHT`:

    cheapest:3,company:2,first:1

The two combine modes give the weight two different meanings.

**lexico** (the default) applies the strategies in descending weight order, each
settling the ties left by the one above it. This suits a main policy with
tie-breakers behind it: take the cheapest move; among equally cheap moves prefer
one whose result has company; failing that, take the one nearest the upper left.

**weighted** rescales each strategy's preference across the moves currently on
offer and sums the results with the given weights, so the strategies genuinely
trade against one another rather than one always overruling the next.

Either way the board scan order settles any remaining tie, so a run with a fixed
seed replays exactly.

## Command line

    ./exponentile-trials --help

    # One game with the original upper-left scanning autoplay.
    ./exponentile-trials

    # Fifty games across eight workers, tagged for later comparison.
    ./exponentile-trials -n 50 -j 8 -s inband:2,cheapest:1 -t inband-trial

    # What has been collected so far.
    ./exponentile-trials summary

    # What each strategy prefers.
    ./exponentile-trials strategies

Results append to `trials.ndjson`, one JSON record per game, holding the seed,
the duration, the move count, the final score and the highest tile. Choose
another store with `-o`. `deno task trials -- <command>` reaches the same runner
without the wrapper.

## Web app

The flask icon beside the history icon opens the strategy lab. Strategies are
chosen and ordered there, games are run in batches across web workers, and the
results are kept in the browser through the same Preferences store the game uses
for its own history. "Watch one game" hands the chosen strategy to the board and
plays it in front of you; the autoplay toggle stops it.

## Reproducibility

Strategies deliberate using a generator of their own, separate from the one
dealing tiles, so judging moves never disturbs the board. Giving a base seed
makes a whole batch replay exactly: game *i* uses `seed + i`.
