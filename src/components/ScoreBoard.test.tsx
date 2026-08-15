import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreBoard } from './ScoreBoard';

describe('<ScoreBoard />', () => {
  it('shows each team score against its target', () => {
    render(
      <ScoreBoard
        scores={{ CIVILIAN: 2, CRIMINAL: 3 }}
        targets={{ CIVILIAN: 4, CRIMINAL: 5 }}
        winner={null}
      />,
    );

    expect(screen.getByText('Civilians')).toBeInTheDocument();
    expect(screen.getByText('2 VP')).toBeInTheDocument();
    expect(screen.getByText('goal: 4')).toBeInTheDocument();
    expect(screen.getByText('3 VP')).toBeInTheDocument();
    expect(screen.getByText('goal: 5')).toBeInTheDocument();
    expect(screen.queryByText(/win!/)).not.toBeInTheDocument();
  });

  it('announces the winner when one is set', () => {
    render(
      <ScoreBoard
        scores={{ CIVILIAN: 4, CRIMINAL: 3 }}
        targets={{ CIVILIAN: 4, CRIMINAL: 5 }}
        winner="CIVILIAN"
      />,
    );

    expect(screen.getByText('Civilians win!')).toBeInTheDocument();
  });
});
