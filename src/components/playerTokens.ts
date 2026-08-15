import type { Player } from '../types/game';
import { TOKEN_META } from '../constants/theme';

export interface PlayerToken {
  key: keyof typeof TOKEN_META;
  label: string;
  color: string;
  icon: string;
  hint: string;
  /** Present for counter tokens (e.g. virus stacks); omitted for one-shots. */
  count?: number;
}

/**
 * The temporary tokens a player currently holds (virus stacks, a traffic jam, a
 * pending coffee), in a fixed order. Shared by PlayerSeat and RoleCard so the
 * badge set stays consistent. Returns an empty array when the player is clean.
 */
export function playerTokens(player: Player): PlayerToken[] {
  const tokens: PlayerToken[] = [];
  if (player.virusTokens && player.virusTokens > 0) {
    tokens.push({ key: 'virus', ...TOKEN_META.virus, count: player.virusTokens });
  }
  if (player.trafficToken) {
    tokens.push({ key: 'traffic', ...TOKEN_META.traffic });
  }
  if (player.coffeeToken) {
    tokens.push({ key: 'coffee', ...TOKEN_META.coffee });
  }
  return tokens;
}
