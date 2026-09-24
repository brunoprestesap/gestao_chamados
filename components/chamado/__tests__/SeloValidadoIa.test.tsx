// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SeloValidadoIa } from '../SeloValidadoIa';

/**
 * O selo "Validado automaticamente pela IA" (spec 0007, AC-15).
 */

describe('SeloValidadoIa', () => {
  it('mostra o selo quando validadoPelaIa é true', () => {
    render(<SeloValidadoIa validadoPelaIa />);

    expect(screen.getByText('Validado automaticamente pela IA')).toBeInTheDocument();
  });

  it('não mostra nada quando validadoPelaIa é false', () => {
    render(<SeloValidadoIa validadoPelaIa={false} />);

    expect(screen.queryByText('Validado automaticamente pela IA')).not.toBeInTheDocument();
  });

  it('não mostra nada quando validadoPelaIa é undefined ou null', () => {
    const { rerender } = render(<SeloValidadoIa validadoPelaIa={undefined} />);
    expect(screen.queryByText('Validado automaticamente pela IA')).not.toBeInTheDocument();

    rerender(<SeloValidadoIa validadoPelaIa={null} />);
    expect(screen.queryByText('Validado automaticamente pela IA')).not.toBeInTheDocument();
  });
});
