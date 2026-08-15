/**
 * src/components/useBoardInteractions.ts
 *
 * Translates GameBoard interactions (selecting cards, targeting, buying, etc.)
 * into engine actions. Shared by the local (GameController) and online
 * (OnlineController) drivers so the interaction rules live in one place.
 */

import { useState } from 'react';
import type { GameState } from '../types/game';
import type { AnyCard, EvidenceCategory } from '../types/cards';
import type { GameAction, RoleAbilityPayload, PerkPayload, EventOptions } from '../engine';
import type { ActionMeta } from '../constants/theme';
import type { GameBoardHandlers, TargetMode } from './GameBoard';

export interface BoardInteractions {
  selectedCardId: string | null;
  targeting: TargetMode;
  notice: string | null;
  /** Whether the role-ability panel is open for the viewer. */
  roleAbilityOpen: boolean;
  /** The perk whose action panel is open, or null. */
  activePerkId: string | null;
  /** The Ally Support event card being played, or null. */
  allySupportCardId: string | null;
  handlers: GameBoardHandlers;
  /** Clear transient selection/targeting (e.g. after ending a turn). */
  reset: () => void;
}

export function useBoardInteractions(
  state: GameState,
  viewerIndex: number,
  dispatch: (action: GameAction) => void,
): BoardInteractions {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [targeting, setTargeting] = useState<TargetMode>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [roleAbilityOpen, setRoleAbilityOpen] = useState(false);
  const [activePerkId, setActivePerkId] = useState<string | null>(null);
  const [allySupportCardId, setAllySupportCardId] = useState<string | null>(null);

  const viewer = state.players[viewerIndex];
  const selectedCard = viewer?.hand.find((c) => c.id === selectedCardId);

  const reset = () => {
    setSelectedCardId(null);
    setTargeting(null);
    setNotice(null);
    setRoleAbilityOpen(false);
    setActivePerkId(null);
    setAllySupportCardId(null);
  };

  /** Play a hand card — Ally Support opens a copy panel; everything else dispatches. */
  const playFromHand = (card: { id: string; type: string; name: string }) => {
    if (card.type === 'EVENT' && card.name === 'Ally Support') {
      setSelectedCardId(null);
      setRoleAbilityOpen(false);
      setActivePerkId(null);
      setAllySupportCardId(card.id);
      return;
    }
    dispatch({ type: 'PLAY_CARD', cardId: card.id });
    setSelectedCardId(null);
  };

  const onAction = (action: ActionMeta) => {
    setNotice(null);
    switch (action.type) {
      case 'DRAW_CARD':
        dispatch({ type: 'DRAW_CARD' });
        setSelectedCardId(null);
        break;
      case 'PLAY_CARD':
        if (selectedCard && selectedCard.type === 'EVIDENCE' && viewer?.team === 'CRIMINAL') {
          playFromHand(selectedCard);
        } else if (selectedCard && selectedCard.type !== 'EVIDENCE' && selectedCard.type !== 'POWER') {
          playFromHand(selectedCard);
        } else {
          setNotice('Select a Money or Event card to play, or click a grid slot to place evidence.');
        }
        break;
      case 'PURCHASE_MARKET':
        setNotice('Click a card in the Market to buy it.');
        break;
      case 'SELL_ITEM':
        setNotice('Click an item under "Items" to sell it for $1.');
        break;
      case 'ROLE_ABILITY':
        setSelectedCardId(null);
        setTargeting(null);
        setRoleAbilityOpen(true);
        break;
      case 'TRADE':
        setNotice('Trading is resolved manually at the table for now.');
        break;
      case 'SPECIAL_GOAL':
        if (viewer?.team === 'CIVILIAN') setTargeting('expose');
        else setNotice('Buy an Expand Network card from the Black Market to score a VP.');
        break;
      case 'COMBAT':
        setTargeting('attack');
        break;
      default:
        break;
    }
  };

  const onSelectCard = (card: AnyCard) => {
    setTargeting(null);
    setNotice(null);
    setSelectedCardId((cur) => (cur === card.id ? null : card.id));
  };

  const onPlayEvidence = (category: EvidenceCategory) => {
    if (selectedCard && selectedCard.type === 'EVIDENCE') {
      dispatch({ type: 'PLAY_CARD', cardId: selectedCard.id, category });
      setSelectedCardId(null);
    } else {
      setNotice('Select an Evidence card in your hand first, then click a category.');
    }
  };

  const onPlaySelected = () => {
    if (selectedCard) playFromHand(selectedCard);
  };

  const onSelectTarget = (playerId: string) => {
    if (targeting === 'attack') dispatch({ type: 'ATTACK', targetId: playerId });
    else if (targeting === 'expose') dispatch({ type: 'EXPOSE', targetId: playerId });
    setTargeting(null);
  };

  const handlers: GameBoardHandlers = {
    onAction,
    onEndTurn: () => {
      dispatch({ type: 'END_TURN' });
      reset();
    },
    onSelectCard,
    onPlayEvidence,
    onPlaySelected,
    onBuy: (card) => {
      dispatch({ type: 'PURCHASE', cardId: card.id });
      setSelectedCardId(null);
    },
    onSell: (card) => dispatch({ type: 'SELL', cardId: card.id }),
    onSelectTarget,
    onCancelTargeting: () => setTargeting(null),
    onPlayPower: (cardId, side, byPlayerId) => dispatch({ type: 'PLAY_POWER', cardId, side, byPlayerId }),
    onPassCombat: (side) => dispatch({ type: 'PASS_COMBAT', side }),
    onDiscardMoney: (side, cardIds) => dispatch({ type: 'COMBAT_DISCARD_MONEY', side, cardIds }),
    onCombatChoice: (input) => dispatch({ type: 'COMBAT_CHOICE', input }),
    onSubmitRoleAbility: (payload: RoleAbilityPayload) => {
      dispatch({ type: 'USE_ROLE_ABILITY', payload });
      setRoleAbilityOpen(false);
    },
    onCancelRoleAbility: () => setRoleAbilityOpen(false),
    onUsePerk: (perkId: string) => {
      setRoleAbilityOpen(false);
      setTargeting(null);
      setActivePerkId(perkId);
    },
    onSubmitPerk: (perkId: string, payload: PerkPayload) => {
      dispatch({ type: 'USE_PERK', perkId, payload });
      setActivePerkId(null);
    },
    onCancelPerk: () => setActivePerkId(null),
    onClearTraffic: () => dispatch({ type: 'CLEAR_TRAFFIC' }),
    onSubmitAllySupport: (teammateId: string, options: EventOptions) => {
      if (allySupportCardId) {
        dispatch({ type: 'PLAY_CARD', cardId: allySupportCardId, targetId: teammateId, options });
      }
      setAllySupportCardId(null);
      setSelectedCardId(null);
    },
    onCancelAllySupport: () => setAllySupportCardId(null),
  };

  return { selectedCardId, targeting, notice, roleAbilityOpen, activePerkId, allySupportCardId, handlers, reset };
}
