# Criminal Rush — Implementation Progress Notes

> **Status: IN PROGRESS / NOT YET AN APPROVED PLAN.** This file captures decisions and research gathered so far so work isn't lost. A parallel agent is handling the UI; this thread is scoped to non-UI work (data model, engine, server).

## Context

The user asked to implement the entire "Criminal Rush" digital game based on `CLAUDE.md` (repo root) and the rulebook PDF `_Criminal Rush Rule Book for Claude.pdf` (repo root). Current code is an early, inconsistent prototype (type/reducer drift, only 2 of 17 roles stubbed, no card data, no UI beyond the Vite scaffold, no server). The user is running a second agent in parallel to build the UI, so **this thread's scope is data/constants + engine + server only — no React components/pages.**

## Decisions confirmed with the user so far

1. **Scope**: Full game — complete card/role data, full rules engine (turns, combat, markets, evidence, expose/convict, event/power resolution), not a stub or partial slice.
2. **Multiplayer model**: Real per-player links, not local pass-and-play. Each player gets a unique link and only sees their own hand contents; everything else (roles, teams, money, inventory, both markets, evidence grid, PL trackers, status tokens) is public to all players. This requires a **lightweight Node server holding authoritative game state in-memory (no database)** — chosen explicitly over Supabase/Firebase and over a client-only simulated-multiplayer approach.
3. **Role/team visibility**: **All roles and teams are public from the start.** "Expose" is NOT an identity reveal — it's purely a mechanical trigger (Criminal loses 1 PL, becomes attackable by Civilians). The *only* hidden information in the whole game is the actual card identities in a player's own hand — other players should see hand **count** only, never contents.
4. **UI fidelity**: N/A to this thread — UI owned by a separate parallel agent. (For reference, prior to the scope split the user had said "functional UI, clean layout" would be the target, in case that's useful context to relay to the UI agent.)

## Architecture per CLAUDE.md (repo root `/Users/jonathancheng/Documents/GitHub/criminal_rush_game/`)

- `src/engine/` — pure game logic (state, turn flow, rules, scoring, transitions). UI-agnostic. **Must not import from `constants`** — takes card/role data as parameters instead.
- `src/constants/` — pure data/config (roles, cards, board setup, labels). No logic, no engine imports.
- `src/setup/` — the only layer allowed to import both engine and constants; wires UI to engine (this is the boundary the UI agent will consume).
- Dependency direction: `constants → setup ← engine` (setup is the bridge).
- Rules: always run `npm run test` before calling work done; TypeScript only, no `.js` source.

## Current codebase state (as of this session)

Real project root is the **repo root itself**, not the `criminal-rush/` subfolder (that subfolder is a stale, empty leftover with just `node_modules` — ignore it).

```
src/
├── App.tsx              # still default Vite scaffold, no game UI
├── App.css, index.css, main.tsx
├── assets/ (hero.png, react.svg, vite.svg — placeholder/default)
├── constants/
│   ├── roles.ts          # only 2 of 17 roles stubbed (Detective, Robber)
│   └── setup.ts          # GAME_CONFIGS table for 4-8 players — needs verifying against rulebook p.3
├── engine/
│   └── scoring.ts        # determineWinner(scores, targets, current) — pure, already matches target style
├── hooks/
│   └── useGameState.ts   # rough reducer prototype — incomplete/inconsistent, treat as sketch not spec
└── types/
    ├── cards.ts
    └── game.ts            # Player.isConvicted exists on type but reducer actually uses
                            # convictedTokens: number / isEliminated, neither on the type — drift to resolve
```

- `package.json`: `"test": "vitest run"` already wired, vitest + jsdom installed, but **zero test files exist yet** and no `@testing-library/react`. **No server deps installed** (no express/ws/socket.io etc.) — will need adding.
- No `src/setup/` directory exists yet.

## Rulebook content extracted (full — from the 18-page PDF), for use in building `src/constants/`

### Game overview
"Criminal Rush — Save the City... or Control It." 30-60 min, ages 10+, 4-8 players. 160 cards, 23 tokens, 2 boards, 40 cubes. Civilians (rookie detectives) vs. Criminals (syndicate); Civilians gather evidence/expose/convict, Criminals attack civilians and expand their network.

### Setup / player-count config table (p.2-3)
| Players | VPs to win | Civilians | Criminals | Civ cards | Civ $ | Crim cards | Crim $ |
|---|---|---|---|---|---|---|---|
| 4 | Civ 4 / Crim 5 | 2 | 2 | 5 | 2 | 3 | 2 |
| 5 | Civ 5 / Crim 5 | 3 | 2 | 3 | 2 | 3 | 2 |
| 6 | Civ 6 / Crim 6 | 3 | 3 | 5 | 3 | 3 | 2 |
| 7 | Civ 6 / Crim 6 | 4 | 3 | 3 | 3 | 3 | 2 |
| 8 | Civ 8 / Crim 8 | 4 | 4 | 5 | 3 | 3 | 2 |

**⚠ NOTE:** existing `src/constants/setup.ts` had 5-player row as `vpTargets: { CIVILIAN: 5, CRIMINAL: 5 }` — matches. But needs a full line-by-line diff against this table during implementation; don't assume it's fully correct.

Setup steps: choose role counts per table; deal roles alternating Civ/Crim; each player gets 2 large cubes (PL tracker, Money tracker) + 3 small cubes (action tracker); deal starting cards/money; set up Market (5 cards) and Black Market (3 cards + Expand Network); set up Evidence Grid + VP chart; Civilians go first, play clockwise (in odd-player games, the Civilian *after* another Civilian starts; otherwise Civilians choose the starting player).

### Objective / scoring
- First team to reach target VP (per table above) wins.
- Civilians: +1 VP each time they **expose** OR **capture** a Criminal.
- Criminals: +1 VP each time they **successfully attack** a Civilian OR **purchase Expand Network**.
- Both teams: +1 VP when the draw deck runs out (discard reshuffled into new draw pile).
- **Tiebreaker**: if both teams hit their VP target on the same update, **Civilians win**.
- Expand Network: Black Market perk, starts at $5, gets more expensive with each purchase (see Black Market table — "$5-$8... costs $1 more for captured criminals"), grants 1 VP instantly, cannot be sold/traded, occupies 1 of the 4 perk slots.

### Turn overview (p.4)
Resolve start-of-turn perk/token triggers first. Then 3 actions per turn, chosen from (any order, can repeat unless noted):
1. Draw a card
2. Play a card
3. Purchase a perk or weapon (once per turn)
4. Sell a perk or weapon
5. Role or perk action (each once per turn)
6. Trade with a teammate
7. Expose (Civilians only) or Expand Network (Criminals only)
8. Combat (counts as 2 actions, neighbors only, once per turn even with extra actions)

End of turn: injured Civilians discard Injury token (healed); reset action cubes.

Example token: **Virus token** = -1 action on your turn.

### Role card anatomy (p.4)
Each role card has: Role Name, Team + Base Power Level, PL Tracker (reset to sum of role + weapon base PLs after each combat), Role Action (each usable once/turn, action cube marks used), Money Tracker (adjustable; if money >8, use action cubes as $1 each), Action Tracker (checkbox grid per action type, cube placed per use), post-turn "reset action cubes here" reminder.

### Action details (p.5-8)

**Draw a card**: from top of deck into hand. If draw pile empties, shuffle discard into new draw pile and **both teams score 1 VP**.

**Play a card**:
- *Money cards*: move Money tracker by the card's value.
- *Event cards*: place in discard, resolve effect immediately.
- *Evidence cards*: Civilians play into the matching Evidence Grid category (wild-category or multi-category cards let the player choose at play time). Criminals may instead **burn** an Evidence card: discard it to draw 2 new cards. If **all Criminals are exposed**, Civilians may play Evidence cards to **gain $2 each** instead of/as well as grid-filling (rulebook: "Civilians can play Evidence Cards to gain $2 each").
- *Power cards*: can ONLY be played during Combat (Power phase), not as a normal "play a card" action.

**Purchase a perk or weapon**: pay listed cost, replace bought card with a new one from the top of that market's deck. Civilians: Market only. Criminals: Market OR Black Market. Once per turn (as a direct action) — BUT effects like Market Access, Credit Card, Spring Cleaning, Trash Can, Crime Lord's ability, or Evil Scientist's ability do **NOT** count toward this once-per-turn limit; only **one purchase directly from the Market or Black Market per turn** is capped (see Rules Clarification, "Limit of Buying from Market or Black Market"). Max 4 perks + 2 weapons per player total. If a perk grants "Action", you may spend an action to use it immediately upon purchase.

**Sell a perk or weapon**: discard for $1, into a discard pile by that market (frees a market slot for replenishment). (Business Opportunity event: sell for cost+$1 instead.)

**Role or perk action**: if a role/perk says "Action", spend an action to trigger it. Each such action usable once per turn. **Injured/captured players cannot use role abilities.** Mark with an action cube.

**Trade with a teammate**: give 1 weapon OR 1 card from hand OR $1; teammate must give back 1 weapon OR 1 card OR $1 (their choice). Cannot give a weapon if teammate already has 2. Cannot trade perks.

**Expose (Civilians only)**: discard 1 Evidence card from **each** of the 4 categories (full grid) to expose 1 target Criminal. Civilians score 1 VP. That Criminal **loses 1 PL for the rest of the game** and becomes attackable by Civilians. ("Leaving Evidence": defender who wins combat vs. an attacking Civilian may take up to 2 of the discarded Evidence cards and shuffle them back into the draw pile — see Combat section.)

**Expand Network (Criminals only)**: purchase the Expand Network card from Black Market, gain 1 VP instantly; stays permanently, occupies 1 of the 4 perk slots.

**Combat (2 actions)**: once per turn even with bonus actions. Attack only a neighbor unless a weapon allows otherwise. Civilians may only attack Criminals who have been Exposed.

### Combat resolution (p.8-10)
Attacker vs. defender (person initiating = attacker).
1. Resolve pre-combat weapon effects (e.g., Portal, Barbed Wire) first.
2. Base power = role's base PL + PL of up to 2 equipped weapons + any perk/token PL bonuses (Vitamin, Bodyguard token, etc.). Track with the PL cube.
3. **Power phase**: players may play Power cards from hand to add power (in addition to the base calc), then pass/play in turn; adjust PL cube. Exception: Unexpected Allies can only be played *for a teammate*, not yourself.
4. After all pass, resolve: higher power wins; **defender wins ties**.

**If Criminal attacks and wins**: Criminal team +1 VP; Civilian is injured (gets Injured token: cannot use role ability/attack/be attacked until healed at end of their next turn); *Leaving Evidence* — the (losing) Civilian may take up to 2 discarded Evidence cards and shuffle into the draw pile.

**If Civilian attacks and wins** (only possible vs. an Exposed Criminal): Civilian team +1 VP; Criminal is **captured** (flip Exposed token to Captured side: can no longer attack or be attacked, loses role ability **permanently**); *Weakened Network* — captured Criminal must pay **+$1** to purchase Expand Network from then on.

**If attacker loses**: nothing happens except the attacker spent 2 actions.

**Worked example (p.9-10)**: Hitman (Criminal, base PL 3, ability "+1 PL per weapon when attacking") equips Hammer (2 PL, "before combat draw 1 card") + Barbed Wire (1 PL, "before combat opponent discards 1 card") → base 3 + 2(Hammer)+1(Barbed Wire, both weapons get ability bonus) = 8 PL pre-power-phase (ability applies to *each* weapon: 2 weapons × +1 = +2, i.e. 3 base +2(Hammer PL)+1(BarbedWire PL)+2(ability bonus)=8). Defender: Mayor (Civilian, base PL 2, ability "+1 action/turn") equips Harpoon (+2 PL, "+2 PL if opponent has Melee weapon" → since Hammer is Melee, Harpoon = 4 PL) + Parasites ("equivalent to opponent's role base PL" = 3 PL, since Hitman's base PL is 3) → 2+4+3 = 9 PL. Power phase: Hitman plays Surge (+2 PL) → 10. Mayor has no Power cards but teammate plays Unexpected Allies (+2 PL, teammate-only) → 11. Hitman, thanks to Hammer's draw, drew into Mirror (copies the PL of an opponent's just-played Power card) → copies Unexpected Allies' +2 → Hitman 12, Mayor passes. **Hitman wins** (12 vs 11). Criminal team +1 VP, Mayor injured, Mayor's team notes they're missing "Time" evidence and shuffles 2 Time Evidence cards into the draw pile (this "shuffle in needed evidence" bit reads as flavor/strategy commentary, not a hard rule — flag as ambiguous, see Risks below).

### Strategy tips (p.10) — flavor, not rules; skip for engine, could be useful copy for UI later.

### APPENDIX — Full card/role data (p.11-18)

#### Event Cards — 22 total, 11 unique × 2 copies each. Resolve immediately on play, then discard.
| Name | Effect |
|---|---|
| Receive Package | Draw 3 cards. |
| Market Access | Purchase a perk/weapon from the Market for $1 discount. |
| Tax Collection | Force a player to give you $1. |
| Gain Influence | Choose a player; randomly take a card from their hand. If Evidence, you may immediately play it (or burn it if you're a Criminal). |
| Market Exchange | Give a perk to a teammate or take a perk from a teammate. Then draw a card. |
| Ally Support | Copy a role or perk action of a teammate. |
| Business Opportunity | Sell a perk/weapon for its cost + $1 back. |
| Lottery | Reveal top 3 cards of deck. Immediately play any Money cards. Discard the rest. |
| Spring Cleaning | Discard 3 cards from the Market and replace them. Then may purchase 1 perk from Market at $1 discount. |
| Generational Wealth | You and your teammates each get $1. |
| Traffic Jam | Give an opponent a Traffic token (trading with them costs 2 actions; Action: pay $1 to discard the token). |

#### Power Cards — 16 total, 5 unique. Played only during Combat's Power phase to add power. Except Unexpected Allies, only playable for yourself.
| Name | Effect | Copies |
|---|---|---|
| Boost | +1 PL | 7 |
| Surge | +2 PL | 3 |
| Shield | +3 PL. Defense only. | 2 |
| Unexpected Allies | +2 PL. Only playable for a teammate. | 3 |
| Mirror | Copies the PL of another player's Power card (played earlier in the same combat). | 1 |

#### Money Cards — 21 total, 3 unique.
| Name | Value | Copies |
|---|---|---|
| Spare Change | $1 | 5 |
| Profit | $2 | 11 |
| Collection | $3 | 5 |

#### Evidence Cards — 21 total, category breakdown.
| Category | Copies |
|---|---|
| Time (single) | 3 |
| Location (single) | 3 |
| Means (single) | 3 |
| Motive (single) | 3 |
| Wild (any category) | 3 |
| Time + Location | 1 |
| Time + Means | 1 |
| Time + Motive | 1 |
| Location + Means | 1 |
| Location + Motive | 1 |
| Means + Motive | 1 |

(Multi-category cards: player chooses which single category to fill when played, per the "Play a Card" section.)

#### Public Market — Perks (22 total: 2 copies each except 4 starred = 1 copy each). Always 5 cards available for purchase at a time.
| Name | Cost | Copies | Effect |
|---|---|---|---|
| Alarm Clock | $3 | 2 | Action: play an Event card, then draw 1 card AND gain $1. |
| Radio | $2 | 2 | May trade for one less action, once per turn. |
| Recycling Bin * | $2 | 1 | Action: discard a card to pick up a card of the same type from discard pile, then gain $1 OR draw 1 card. |
| Journal * | $1 | 1 | After playing an Event card, may discard this to repeat the Event's effect. |
| Express Shipping | $2 | 2 | After you trade during your turn, gain $1 OR draw 1 card. (Only triggers on trades during your own turn — not e.g. Drones exchanges.) |
| Water Bottle * | $1 | 1 | Discard for an extra action. |
| Credit Card | $2 | 2 | Action: purchase a perk/weapon from Market at $1 discount, OR discard this card for a $2 discount. |
| Investment | $2 | 2 | Start of turn: gain $1. Cannot be sold. |
| Computer | $2 | 2 | Start of turn: draw a card. |
| Bank | $3 | 2 | Action: play a Money card for +$1 value AND draw a card. |
| Coffee Machine | $3 | 2 | On purchase, give yourself or a teammate a Coffee token. Action: replenish the Coffee (may move it to another teammate). Coffee token: start of turn gain +1 action and draw 1 card, then flip the token over (spent). |
| Vitamin | $3 | 2 | Start of turn: advance the vitamin tracker to next stage, gaining: 1) draw a card, 2) gain $1, 3) +1 PL permanent, 4) +1 PL permanent. (Note: reward is gained at start of NEXT turn, not immediately on purchase; at final stage +2 PL applies at all times per Rules Clarification.) |
| Trash Can * | $2 | 1 | Start of turn: discard 1 perk/weapon from the Market, place beneath this card. Action: purchase from the trash can pile at $1 discount. |

#### Public Market — Weapons (20 total, 2 copies each unless noted).
| Name | Cost | Type | Effect |
|---|---|---|---|
| Bat | $3 | Melee | +2 power |
| Pocket Knife | $4 | Melee | +1 power per perk and weapon you have (including itself) |
| Switch Blade | $4 | Melee | +2 power; +2 more if opponent has a Chemical weapon |
| Hammer | $4 | Melee | +2 power. Before combat: draw a card. |
| Axe | $5 | Melee | +5 power |
| Arrows | $3 | Ranged | +2 power |
| Pistol | $4 | Ranged | +4 power. Before combat: must discard a card (if possible). |
| Harpoon | $4 | Ranged | +2 power; +2 more if opponent has a Melee weapon |
| Catapult | $4 | Ranged | You may attack non-neighbors OR +1 power. (2 base power; +1 more — 3 total — only when the fight is within normal neighbor range. Reaching past a neighbor via Catapult forgoes the +1.) |
| Machine Gun | $5 | Ranged | +3 power. Power phase: may discard any # of Money cards, each +1 power. May attack non-neighbors. |
| Electric Baton | $3 | Tech | +2 power |
| Missile | $4 | Tech | +2 power. After combat, if won: destroy one of opponent's perks. |
| Magnetic Deflector | $4 | Tech | +2 power; +2 more if opponent has a Ranged weapon |
| Signal Jammer | $5 | Tech | +2 power. Opponent may not play Power cards. |
| Robot Soldier | $4 | Tech | +1 power per card you hold, max +5 |
| Toxic Gas | $3 | Chemical | +2 power |
| Viruses | $4 | Chemical | +2 power. After combat: give opponent a Virus token (-1 action next turn). |
| Corrosion Cannisters | $4 | Chemical | +2 power; +2 more if opponent has a Tech weapon |
| Parasites | $4 | Chemical | Power = equal to opponent's role base PL |
| Mosquitos | $5 | Chemical | +3 power. Before combat: randomly make opponent discard a card. |

#### Black Market — 3 perks (+ Expand Network) available at a time, cheapest→priciest ordering for Expand Network purchases. 11 perks + 4 Expand Network total.
| Name | Cost | Effect |
|---|---|---|
| Hacked Passwords | $3 | Action: choose a player, randomly steal a card from their hand. |
| Mafia Alliance | $2 | All Power cards you play are worth +1 power. |
| Getaway Car | $3 | Initiating combat costs only 1 action. Start of turn: may give this perk + 1 card to a teammate. |
| Manipulate | $2 | Action: look at top 3 of deck, take 1 to hand, discard 1, put 1 back on top. |
| Bribery | $1 | When sold, pay $1 to a Civilian, who discards 1 Evidence card from the grid. |
| Laboratory | $3 | Start of turn: draw a card. All your Chemical/Tech weapons are +1 PL. |
| Ironworks | $3 | Start of turn: gain $1. All your Melee/Ranged weapons are +1 PL. |
| Shady Press | $2 | Action: choose a player, see all their Event cards, choose 1 to play immediately. (If they hold exactly 1 unplayable Event card, e.g. Business Opportunity with nothing to sell, discard it instead.) |
| Corrupt Connections | $3 | Start of turn: gain an extra action this turn. |
| Disguise | $1 | On purchase, draw 2 cards. Cannot be Exposed while holding this. Start of turn: discard this perk. |
| Loan Shark's Favor | $0 | On purchase, gain $5 minus the combined VP scored so far by both teams (min $0). Start of turn: discard 1 card (holder's choice) if you have any. Cannot be sold or given away. |
| **Expand Network** | $5-$8 (rises with each purchase) | Gain 1 VP on acquisition. Cannot be sold/traded. +$1 more if buyer is a captured Criminal. 4 copies. |

#### Black Market — Weapons (8 total).
| Name | Cost | Type | Effect |
|---|---|---|---|
| Barbed Wire | $2 | Melee | +1 power. Before combat, opponent must discard 1 card first (if possible). |
| Brass Knuckles | $2 | Melee | +1 power. If attacking, before combat steal $1 from opponent (if possible). |
| Molotov Cocktail | $3 | Ranged | +2 power. After combat: destroy 1 of opponent's perks; Civilian regains that perk's cost in money. |
| Cannon | $3 | Ranged | +1 power per card opponent holds, max +4 |
| Portal | $3 | Tech | Before combat: draw 2 cards, OR pay $1 to swap this weapon with a teammate's weapon. |
| Drones | $3 | Tech | +2 power. Before combat: may exchange a card with a teammate. |
| Nerve Agents | $2 | Chemical | +1 power. Attacks against you cost 1 extra action. |
| Mutants | $3 | Chemical | +1 power. Copies the effect of one of opponent's weapons. |

#### Roles — 17 total. `*` = recommended for first game.
| Role | Team | Base PL | Ability |
|---|---|---|---|
| Mayor * | Civilian | 2 | +1 action per turn. |
| Attorney * | Civilian | 3 | Whenever a teammate plays an Evidence card into the grid, collect $1. |
| Collector * | Civilian | 3 | Action: buy a perk/weapon, then collect $1. |
| Sheriff * | Civilian | 3 | Action: force an opponent to show all their Evidence cards; choose 1 to play immediately. |
| Vigilante | Civilian | 2 | Each time a Criminal scores a VP, draw a card and gain +1 PL (permanent, max +3 total). Cannot be injured. |
| Nurse | Civilian | 3 | Whenever a teammate is injured, may discard 1 card to immediately heal them. |
| Bodyguard | Civilian | 3 | Start of game: give a teammate the Bodyguard token. That teammate gains +2 PL on defense and the Bodyguard may play Power cards for them. Action: move the token to another teammate. |
| Witness | Civilian | 3 | Whenever a teammate is injured, may take 1 discarded Evidence card into hand OR play 1 Evidence card from hand. |
| Crime Lord * | Criminal | 4 | Action: purchase Expand Network for $1 less. |
| Hitman * | Criminal | 3 | Each weapon has +1 PL when attacking. |
| Spy * | Criminal | 4 | Start of turn: look at top 2 cards of the deck. |
| Evil Scientist * | Criminal | 3 | Action: buy a Tech or Chemical weapon at $1 discount and draw a card. |
| Robber | Criminal | 2 | Action: steal $1 from a Civilian with $3+, OR steal 1 card from a Civilian with 3+ cards. |
| Arsonist | Criminal | 3 | Action: choose an opponent — they must discard 1 card or lose $1. |
| Smuggler | Criminal | 3 | Action: move a perk/weapon from Market into Black Market; it can then be bought from Black Market for $1 cheaper. |
| Forger | Criminal | 3 | Action: discard 1 Evidence card to discard 1 Evidence card of the same category from the Evidence Grid. |

(That's 8 Civilian + 8 Criminal = 16 listed by name in the table, but rulebook states 17 roles total and Crime Lord's card image on p.4 example also lists "Attack (Neighbor Only)" as an action row alongside Draw/Play/Buy/Sell/Trade/Expand Network — **role count discrepancy to verify during implementation**: table on p.17 lists exactly 8 Civilian + 8 Criminal = 16 rows; the intro text says "17 roles" — recount directly against the PDF table during implementation, this may be an off-by-one in the summary text or an uncaptured 17th row.)

### Rules Clarification section (p.18) — verbatim rulings
- **Market Exchange + Alarm Clock**: using Alarm Clock's ability then giving Alarm Clock away via Market Exchange still lets you keep the Alarm Clock ability that triggered before the trade.
- **(mislabeled "Satellite Ban" heading)**: Other players may still play Unexpected Allies for you; opponent may still discard money via Machine Gun to gain PL; a Bodyguard protecting your opponent may still play Reinforcement-type cards for their teammate.
- **Mirror**: only copies the PL of a Power card played *earlier in the same combat, before* the Mirror. If defender played Shield (+3), attacker's Mirror copies +3. If combined with Mafia Alliance (+1 to your own Power cards), Mirror gets +1 additional on top of the copy; if the *opponent* has Mafia Alliance, Mirror copies only the base PL of their card (not their Mafia-Alliance-boosted total).
- **Bodyguard**: Bodyguard may play Unexpected Allies for the teammate they protect. If the Bodyguard is injured after a fight, flip the Bodyguard token — the protected teammate loses the +2 PL defense bonus and the Bodyguard cannot play Power cards for them until the Bodyguard heals.
- **Portal**: use the new weapon's type (post-swap) when resolving type-based interactions (Harpoon, Invasive Species [likely "Corrosion Cannisters" — naming inconsistency in doc], Bladed Shield [not found elsewhere in doc — possibly a cut/renamed card, flag as ambiguous]). If no swap occurs, Portal counts as a Tech weapon.
- **Ally Support**: cannot copy a Role Action from a player who is currently injured or captured.
- **Gain Influence**: if a Criminal draws an Evidence card via Gain Influence, they may immediately burn it to draw 2. A Forger may NOT use their ability immediately on that same Evidence card (timing restriction).
- **Mutants**: copies a weapon's *effect*, never its flat printed power. Three cases:
  - Resource-scaling weapons (Pocket Knife, Robot Soldier, Cannon) count as an effect and copy in full, caps included (Robot Soldier still maxes at +5) — using the same "you"/"your opponent" the printed text always has, just re-pointed at the new holder. Pocket Knife/Robot Soldier scale with the *copying holder's own* stat ("cards/perks YOU hold"); Cannon scales with "your opponent['s]" hand — the holder's actual opponent, i.e. the weapon's original owner.
  - A conditional "+2 more if opponent has an X weapon" clause (Harpoon, Switch Blade, Magnetic Deflector, Corrosion Cannisters) transfers as just that +2 — evaluated against the copying holder's own actual opponent — never the weapon's own base power.
  - Parasites (a role-identity stat, not a countable resource) copies 0 power. Catapult's own conditional — +1 for fighting within neighbor range — copies the same way as Harpoon's, never its flat 2 base; its non-neighbor *targeting* is a separate effect (a Mutants holder may attack a non-neighbor who themselves carries Catapult or Machine Gun, on the strength of the copy they intend to make), handled by canReachNonNeighbors, not power at all.
  - Non-power effects transfer fully regardless of category: Hammer draws, Barbed Wire/Mosquitos force a discard, Brass Knuckles steals, Pistol offers the holder their own fresh discard choice, a copied Signal Jammer still locks its original owner out of Power cards, a copied Viruses still hands over a Virus token after combat, and a copied Machine Gun still lets its holder discard Money in the Power phase for +1 power each.
  - Portal and Drones are never actually reachable as a copy target: both are Black Market/Criminal-only, and a Mutants holder (always a Criminal, per Mutants' own Black Market listing) always fights a Civilian opponent — who can never hold either.
- **Mutants / Barbed Wire / Hammer / Pistol / Mosquitos stacking**: resolution order — (1) Mutants chooses which weapon to copy first; (2) resolve "before combat" effects for attacker then defender (Hammer, Mosquitos, etc.).
- **Vitamin**: reward is granted at the **start of your NEXT turn**, not immediately on purchase. At the final stage, the +2 PL is a permanent, always-on bonus.
- **Express Shipping**: only triggers on trades made during your own turn's Trade action — does NOT trigger from Drones' exchange effect.
- **Market purchase limit**: using Market Access, Credit Card, Spring Cleaning, Trash Can, Crime Lord's ability, or Evil Scientist's ability does **not** count against the once-per-turn direct-purchase limit. You may still only buy 1 thing **directly** from the Market or Black Market per turn.
- **Shady Press**: if the target only has 1 Event card and it's unplayable in the moment (e.g. Business Opportunity but they have nothing to sell), discard that card instead of forcing a play.

## Notes for the parallel UI-building agent (coordination points)

- The engine boundary (`src/setup/`) should expose whatever state/action shape the UI needs — this hasn't been finalized yet in this thread (design work interrupted before the engine/server plan was finished).
- Hidden info model the UI must respect: **only hand contents are private**; hand *counts*, roles, teams, money, inventory, both markets, evidence grid, PL, and status tokens are all public. This should simplify UI development significantly (only one thing to ever redact).
- Server will hold authoritative state in-memory; UI will need per-player unique links and either WebSocket or polling to receive updates (exact mechanism TBD — was about to be designed when this thread was interrupted).
- Prior (now superseded-scope) UI-fidelity guidance from the user, in case useful: "functional UI, clean layout" — real component structure, clear layout, reasonable styling, not pixel-perfect card art.

## Next steps (not yet done)

1. Finalize engine design: full reducer covering all 8 actions, combat resolution matching the p.8-10 worked example, market purchase/sell, evidence/expose/convict, event/power resolution, end-of-turn effects, deck-out scoring, win condition. Engine takes card/role data as parameters (no `constants` imports).
2. Design `src/constants/` data files transcribing all tables above into typed TS data.
3. Resolve `Player` type drift (`isConvicted` vs. `convictedTokens`/`isEliminated`) into one correct shape.
4. Design server: package choice (e.g. Express + ws), room/state keying, per-player token/link scheme, state-push mechanism, per-player view filtering (redact other hands to counts only).
5. Design `src/setup/` wiring layer and its exported surface for both server and UI to consume.
6. Testing plan per CLAUDE.md (`npm run test` must pass): engine unit tests first (turn flow, combat math against worked example, market limits, expose/convict, scoring/win, key bespoke card interactions), then server-level tests (view filtering).
7. File-by-file plan and build sequencing.
8. Flag open risks to user: the "17 roles" vs. 16-row table discrepancy; the "shuffle in needed evidence" line in the worked example (flavor vs. rule?); Portal's clarification referencing card names not found elsewhere in the doc ("Invasive Species", "Bladed Shield") — possible naming drift/cut content; the mislabeled "Satellite Ban" clarification heading.
