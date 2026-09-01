import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { MarketCard } from '../types/cards';
import { Market } from './Market';

const perk: MarketCard = { id: 'm1', name: 'Radio', description: '', cost: 2, source: 'PUBLIC', type: 'PERK' };
const weapon: MarketCard = { id: 'w1', name: 'Bat', description: '', cost: 3, source: 'PUBLIC', type: 'WEAPON', weaponType: 'MELEE', power: 2 };

describe('<Market />', () => {
  it('dims a weapon once weaponCapReached is set, but leaves a perk clickable', () => {
    const onBuy = vi.fn();
    // Radio and Bat both have printed art, so they render as image buttons
    // (see Card.tsx) — the name only surfaces via alt text, not plain text.
    render(<Market title="Market" cards={[perk, weapon]} affordableUpTo={10} weaponCapReached onBuy={onBuy} />);

    expect(screen.getByAltText('Bat').closest('button')).toBeDisabled();
    fireEvent.click(screen.getByAltText('Radio'));
    expect(onBuy).toHaveBeenCalledWith(perk);

    onBuy.mockClear();
    fireEvent.click(screen.getByAltText('Bat'));
    expect(onBuy).not.toHaveBeenCalled(); // disabled — the weapon slot is full
  });

  it('leaves a weapon clickable when weaponCapReached is false', () => {
    const onBuy = vi.fn();
    render(<Market title="Market" cards={[weapon]} affordableUpTo={10} weaponCapReached={false} onBuy={onBuy} />);
    expect(screen.getByAltText('Bat').closest('button')).toBeEnabled();
    fireEvent.click(screen.getByAltText('Bat'));
    expect(onBuy).toHaveBeenCalledWith(weapon);
  });
});
