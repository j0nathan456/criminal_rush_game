import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ActionCard } from '../types/cards';
import { EvidencePlayPanel } from './EvidencePlayPanel';

const single: ActionCard = {
  id: 'e1', name: 'College Campus', description: '', type: 'EVIDENCE', evidenceCategories: ['LOCATION'],
};
const wild: ActionCard = {
  id: 'e2', name: 'Forensic Files', description: '', type: 'EVIDENCE', evidenceCategories: ['MEANS', 'MOTIVE'],
};

describe('<EvidencePlayPanel />', () => {
  it('a single-category card offers one "Play into <category>" button, no category picker', () => {
    const onPlay = vi.fn();
    render(<EvidencePlayPanel card={single} team="CIVILIAN" onPlay={onPlay} onCancel={() => {}} />);
    expect(screen.getByText(/Play College Campus into Location/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Play into Location/ }));
    expect(onPlay).toHaveBeenCalledWith('LOCATION');
  });

  it('a wild card offers only its valid categories, and requires picking one before playing', () => {
    const onPlay = vi.fn();
    render(<EvidencePlayPanel card={wild} team="CIVILIAN" onPlay={onPlay} onCancel={() => {}} />);
    expect(screen.getByText(/Means/)).toBeInTheDocument();
    expect(screen.getByText(/Motive/)).toBeInTheDocument();
    expect(screen.queryByText(/Time/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Location/)).not.toBeInTheDocument();

    const playButton = screen.getByRole('button', { name: 'Play' });
    expect(playButton).toBeDisabled();

    fireEvent.click(screen.getByText(/Motive/));
    expect(playButton).not.toBeDisabled();
    fireEvent.click(playButton);
    expect(onPlay).toHaveBeenCalledWith('MOTIVE');
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    render(<EvidencePlayPanel card={single} team="CIVILIAN" onPlay={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('hides the cash-in option unless canCashIn is set', () => {
    render(<EvidencePlayPanel card={single} team="CIVILIAN" onPlay={() => {}} onCancel={() => {}} />);
    expect(screen.queryByText(/Cash in for \$2/)).not.toBeInTheDocument();
  });

  it('offers to cash in for $2 once every Criminal is exposed, independent of the category choice', () => {
    const onCashIn = vi.fn();
    render(
      <EvidencePlayPanel card={wild} team="CIVILIAN" onPlay={() => {}} onCancel={() => {}} canCashIn onCashIn={onCashIn} />,
    );
    expect(screen.getByText(/Every Criminal is already exposed/)).toBeInTheDocument();
    const cashInButton = screen.getByRole('button', { name: /Cash in for \$2/ });
    expect(cashInButton).toBeEnabled(); // no category needed to cash in

    fireEvent.click(cashInButton);
    expect(onCashIn).toHaveBeenCalled();
  });
});
