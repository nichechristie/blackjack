import { randomUUID } from "node:crypto";

export type Suit = "♠" | "♥" | "♦" | "♣";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export type Card = { rank: Rank; suit: Suit };

export type GameStatus =
  | "playing"
  | "player_blackjack"
  | "dealer_blackjack"
  | "player_bust"
  | "dealer_bust"
  | "player_stand"
  | "dealer_stand"
  | "player_win"
  | "dealer_win"
  | "push";

export type GameState = {
  id: string;
  fid?: number;
  bet: number;
  deck: Card[];
  playerHand: Card[];
  dealerHand: Card[];
  status: GameStatus;
  createdAt: number;
  updatedAt: number;
};

function createDeck(): Card[] {
  const suits: Suit[] = ["♠", "♥", "♦", "♣"];
  const ranks: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ rank, suit });
    }
  }
  // shuffle (Fisher–Yates)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardValue(rank: Rank): number {
  if (rank === "A") return 11;
  if (rank === "K" || rank === "Q" || rank === "J" || rank === "10") return 10;
  return Number(rank);
}

export function handTotals(hand: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    total += cardValue(card.rank);
    if (card.rank === "A") aces += 1;
  }
  let soft = false;
  while (total > 21 && aces > 0) {
    total -= 10; // count Ace as 1 instead of 11
    aces -= 1;
  }
  if (aces > 0 && total <= 21) soft = true;
  return { total, soft };
}

function isBlackjack(hand: Card[]): boolean {
  return hand.length === 2 && handTotals(hand).total === 21;
}

function deal(deck: Card[], n: number): Card[] {
  return deck.splice(0, n);
}

export class BlackjackStore {
  private games = new Map<string, GameState>();

  createGame(fid: number | undefined, bet: number | undefined): GameState {
    const id = randomUUID();
    const deck = createDeck();
    const playerHand = deal(deck, 2);
    const dealerHand = deal(deck, 2);
    let status: GameStatus = "playing";
    if (isBlackjack(playerHand) && isBlackjack(dealerHand)) status = "push";
    else if (isBlackjack(playerHand)) status = "player_blackjack";
    else if (isBlackjack(dealerHand)) status = "dealer_blackjack";
    const now = Date.now();
    const game: GameState = {
      id,
      fid,
      bet: bet ?? 0,
      deck,
      playerHand,
      dealerHand,
      status,
      createdAt: now,
      updatedAt: now,
    };
    this.games.set(id, game);
    return game;
  }

  getGame(id: string): GameState | undefined {
    return this.games.get(id);
  }

  hit(id: string): GameState | undefined {
    const game = this.games.get(id);
    if (!game) return undefined;
    if (game.status !== "playing") return game;
    game.playerHand.push(...deal(game.deck, 1));
    const player = handTotals(game.playerHand).total;
    if (player > 21) game.status = "player_bust";
    game.updatedAt = Date.now();
    return game;
  }

  stand(id: string): GameState | undefined {
    const game = this.games.get(id);
    if (!game) return undefined;
    if (game.status !== "playing") return game;
    // Dealer hits to 17 (stand on soft 17)
    while (true) {
      const { total, soft } = handTotals(game.dealerHand);
      if (total < 17) {
        game.dealerHand.push(...deal(game.deck, 1));
        continue;
      }
      if (total === 17 && soft) {
        // soft 17: hit once more
        game.dealerHand.push(...deal(game.deck, 1));
        continue;
      }
      break;
    }
    const player = handTotals(game.playerHand).total;
    const dealer = handTotals(game.dealerHand).total;
    if (dealer > 21) game.status = "dealer_bust";
    else if (player > dealer) game.status = "player_win";
    else if (dealer > player) game.status = "dealer_win";
    else game.status = "push";
    game.updatedAt = Date.now();
    return game;
  }
}

export const blackjackStore = new BlackjackStore();

