// @vitest-environment jsdom
// src/components/patrimoine/__tests__/AccountsList.test.jsx
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import AccountsList from '../AccountsList';

describe('AccountsList', () => {
  it('groupe les comptes auto par banque et ignore le manuel', () => {
    render(<AccountsList positions={[
      { id: 'eb-1', source: 'enablebanking', bank: 'BNP', type: 'checking', label: 'CC', value: 3000 },
      { id: 'eb-2', source: 'enablebanking', bank: 'BNP', type: 'savings', label: 'Livret', value: 2000 },
      { id: 'man-1', source: 'manual', bank: 'Bourso', type: 'pea', label: 'PEA', value: 42000 },
    ]} />);
    expect(screen.getByText('BNP')).toBeInTheDocument();
    expect(screen.getByText(/5[\s ]?000/)).toBeInTheDocument(); // total BNP
    expect(screen.queryByText('PEA')).not.toBeInTheDocument();
  });
});
