import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../online/protocol';
import { TEAM_META } from '../constants/theme';

export const MAX_CHAT_MESSAGE_LENGTH = 200;

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend?: (text: string) => void;
}

/**
 * The room's live chat, shown below the viewer's hand when the host has
 * enabled it. Scrolls independently, like the Case Log, and auto-follows new
 * messages. Each sender's name is colored by team — red for Criminals, blue
 * for Civilians — same as everywhere else in the UI.
 */
export function ChatPanel({ messages, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const submit = () => {
    const trimmed = draft.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH);
    if (!trimmed) return;
    onSend?.(trimmed);
    setDraft('');
  };

  return (
    <section className="panel flex min-h-0 flex-col overflow-hidden" aria-label="Chat">
      <header className="panel-head">
        <h2 className="panel-title">Chat</h2>
      </header>
      <ol ref={listRef} className="flex min-h-0 max-h-[220px] flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
        {messages.length === 0 && <li className="text-xs text-fog/60">No messages yet — say hello.</li>}
        {messages.map((m) => (
          <li key={m.id} className="rounded-md bg-panel-2/60 px-2.5 py-1.5 text-[13px] text-chalk">
            <span className="font-semibold" style={{ color: TEAM_META[m.team].color }}>
              {m.name}
            </span>
            : {m.text}
          </li>
        ))}
      </ol>
      <div className="mt-2 flex items-center gap-2">
        <input
          className="input flex-1 py-1.5 text-sm"
          placeholder="Say something…"
          value={draft}
          maxLength={MAX_CHAT_MESSAGE_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <button type="button" className="btn px-3 py-1.5 text-sm" disabled={!draft.trim()} onClick={submit}>
          Send
        </button>
      </div>
    </section>
  );
}
