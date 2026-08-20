import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ChatMessage } from '../online/protocol';
import { ChatPanel } from './ChatPanel';

function msg(over: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'text'>): ChatMessage {
  return { seat: 0, name: 'Ava', team: 'CIVILIAN', sentAt: 0, ...over };
}

describe('<ChatPanel />', () => {
  it('shows an empty-state message with no history', () => {
    render(<ChatPanel messages={[]} />);
    expect(screen.getByText(/No messages yet/)).toBeInTheDocument();
  });

  it("renders each message with the sender's name colored by team", () => {
    const messages = [
      msg({ id: 'm1', name: 'Ava', team: 'CIVILIAN', text: 'hello' }),
      msg({ id: 'm2', name: 'Ben', team: 'CRIMINAL', text: 'hi there' }),
    ];
    render(<ChatPanel messages={messages} />);

    const ava = screen.getByText('Ava');
    const ben = screen.getByText('Ben');
    expect(ava.style.color).toBe('rgb(43, 108, 255)'); // civilian blue
    expect(ben.style.color).toBe('rgb(224, 59, 59)'); // criminal red
    expect(screen.getByText(/hello/)).toBeInTheDocument();
    expect(screen.getByText(/hi there/)).toBeInTheDocument();
  });

  it('sends the trimmed draft on click and clears the input', () => {
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} onSend={onSend} />);

    const input = screen.getByPlaceholderText('Say something…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  hey table  ' } });
    fireEvent.click(screen.getByText('Send'));

    expect(onSend).toHaveBeenCalledWith('hey table');
    expect(input.value).toBe('');
  });

  it('also sends on Enter, and refuses to send a blank draft', () => {
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} onSend={onSend} />);

    const input = screen.getByPlaceholderText('Say something…');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'go go go' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('go go go');
  });

  it('caps the input at 200 characters', () => {
    render(<ChatPanel messages={[]} />);
    const input = screen.getByPlaceholderText('Say something…') as HTMLInputElement;
    expect(input.maxLength).toBe(200);
  });
});
