// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';

describe('Infra tests composants (jsdom par fichier)', () => {
  it('rend un élément et le retrouve par son rôle', () => {
    render(<button type="button">Bonjour</button>);
    expect(screen.getByRole('button', { name: 'Bonjour' })).toBeInTheDocument();
  });
});
