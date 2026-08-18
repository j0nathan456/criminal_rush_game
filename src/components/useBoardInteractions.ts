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
import type { GameAction, RoleAbilityPayload, PerkPayload, EventOptions, TradeItem } from '../engine';
import type { ActionMeta } from '../constants/theme';
import type { GameBoardHandlers, TargetMode } from './GameBoard';
import { CONFIGURABLE_EVENTS } from './panelConstants';

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
  /** The Event card (needing a target/option) being configured, or null. */
  eventCardId: string | null;
  /** The Criminal being Exposed, once a grid category needs a card choice, or null. */
  exposeTargetId: string | null;
  /** Whether the Trade panel is open for the viewer to initiate a trade. */
  tradeOpen: boolean;
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
  const [eventCardId, setEventCardId] = useState<string | null>(null);
  const [exposeTargetId, setExposeTargetId] = useState<string | null>(null);
  const [tradeOpen, setTradeOpen] = useState(false);

  const viewer = state.players[viewerIndex];
  const selectedCard = viewer?.hand.find((c) => c.id === selectedCardId);

  const reset = () => {
    setSelectedCardId(null);
    setTargeting(null);
    setNotice(null);
    setRoleAbilityOpen(false);
    setActivePerkId(null);
    setAllySupportCardId(null);
    setEventCardId(null);
    setExposeTargetId(null);
    setTradeOpen(false);
  };

  /**
   * Play a hand card. Ally Support and any Event needing a target/option
   * (Market Access, Tax Collection, Gain Influence, Business Opportunity,
   * Market Exchange, Spring Cleaning, Traffic Jam) open a panel to gather it
   * instead of dispatching blind — everything else dispatches immediately.
   */
  const playFromHand = (card: { id: string; type: string; name: string }) => {
    if (card.type === 'EVENT' && card.name === 'Ally Support') {
      setSelectedCardId(null);
      setRoleAbilityOpen(false);
      setActivePerkId(null);
      setEventCardId(null);
      setAllySupportCardId(card.id);
      return;
    }
    if (card.type === 'EVENT' && CONFIGURABLE_EVENTS.has(card.name)) {
      setSelectedCardId(null);
      setRoleAbilityOpen(false);
      setActivePerkId(null);
      setAllySupportCardId(null);
      setEventCardId(card.id);
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
        setSelectedCardId(null);
        setTargeting(null);
        setTradeOpen(true);
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
    if (targeting === 'attack') {
      dispatch({ type: 'ATTACK', targetId: playerId });
    } else if (targeting === 'expose') {
      // A category with more than one card needs the exposer to choose which
      // is spent — open that follow-up instead of dispatching blind.
      const needsChoice = Object.values(state.evidenceGrid).some((slot) => slot.cards.length > 1);
      if (needsChoice) setExposeTargetId(playerId);
      else dispatch({ type: 'EXPOSE', targetId: playerId });
    }
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
    onPlayPower: (cardId, side, byPlayerId, mirrorTargetCardId) =>
      dispatch({ type: 'PLAY_POWER', cardId, side, byPlayerId, mirrorTargetCardId }),
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
    onSubmitEvent: (targetId: string | undefined, options: EventOptions) => {
      if (eventCardId) {
        dispatch({ type: 'PLAY_CARD', cardId: eventCardId, targetId, options });
      }
      setEventCardId(null);
      setSelectedCardId(null);
    },
    onCancelEvent: () => setEventCardId(null),
    onUseMarketDiscount: (cardId: string) => dispatch({ type: 'USE_MARKET_DISCOUNT', cardId }),
    onSkipMarketDiscount: () => dispatch({ type: 'SKIP_MARKET_DISCOUNT' }),
    onResolveThreaten: (mode: 'MONEY' | 'DISCARD', cardId?: string) => dispatch({ type: 'RESOLVE_THREATEN', mode, cardId }),
    onResolveSheriff: (cardId: string, category?: EvidenceCategory) =>
      dispatch({ type: 'RESOLVE_SHERIFF', cardId, category }),
    onSubmitExpose: (targetId, evidenceChoices) => {
      dispatch({ type: 'EXPOSE', targetId, evidenceChoices });
      setExposeTargetId(null);
    },
    onCancelExpose: () => setExposeTargetId(null),
    onInitiateTrade: (targetId: string, give: TradeItem) => {
      dispatch({ type: 'INITIATE_TRADE', targetId, give });
      setTradeOpen(false);
    },
    onResolveTradeReturn: (give: TradeItem | null) => dispatch({ type: 'RESOLVE_TRADE_RETURN', give }),
    onCancelTrade: () => setTradeOpen(false),
    onResolveExpressShipping: (mode: 'MONEY' | 'DRAW') => dispatch({ type: 'RESOLVE_EXPRESS_SHIPPING', mode }),
  };

  return {
    selectedCardId, targeting, notice, roleAbilityOpen, activePerkId, allySupportCardId, eventCardId, exposeTargetId,
    tradeOpen, handlers, reset,
  };
}
