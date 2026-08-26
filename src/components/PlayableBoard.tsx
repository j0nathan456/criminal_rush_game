import type { GameState } from '../types/game';
import type { GameAction } from '../engine';
import type { ChatMessage } from '../online/protocol';
import { GameBoard } from './GameBoard';
import { useBoardInteractions } from './useBoardInteractions';

interface PlayableBoardProps {
  state: GameState;
  viewerIndex: number;
  dispatch: (action: GameAction) => void;
  /** Room chat, when the host has enabled it (online play only). */
  chat?: ChatMessage[];
  chatEnabled?: boolean;
  onSendChat?: (text: string) => void;
  /**
   * True while a dispatched action's server round-trip is still in flight
   * (online play only — see OnlineController's `game.connecting`). Every
   * handler is already optional throughout GameBoard's tree (every call
   * site uses `on*?.()`), so withholding them here — rather than teaching
   * each of dozens of buttons its own busy check — disables the whole
   * board for that one request, giving instant feedback that the click
   * registered instead of a silent wait with no visible response.
   */
  busy?: boolean;
}

/**
 * A GameBoard wired to a dispatch via the shared interaction hook. Chrome-free
 * so both the local and online drivers can frame it however they like. Chat
 * is passed straight through rather than via useBoardInteractions — it isn't
 * a GameAction, so it has no business going through the engine dispatch.
 */
export function PlayableBoard({ state, viewerIndex, dispatch, chat, chatEnabled, onSendChat, busy }: PlayableBoardProps) {
  const {
    selectedCardId, targeting, notice, roleAbilityOpen, activePerkId, perkPickerOpen, allySupportCardId, eventCardId,
    exposeTargetId, tradeOpen, buyOpen, handlers,
  } = useBoardInteractions(state, viewerIndex, dispatch);
  return (
    <GameBoard
      state={state}
      viewerIndex={viewerIndex}
      selectedCardId={selectedCardId}
      targeting={targeting}
      notice={notice}
      roleAbilityOpen={roleAbilityOpen}
      activePerkId={activePerkId}
      perkPickerOpen={perkPickerOpen}
      allySupportCardId={allySupportCardId}
      eventCardId={eventCardId}
      exposeTargetId={exposeTargetId}
      tradeOpen={tradeOpen}
      buyOpen={buyOpen}
      chat={chat}
      chatEnabled={chatEnabled}
      onSendChat={onSendChat}
      busy={busy}
      {...(busy ? {} : handlers)}
    />
  );
}
