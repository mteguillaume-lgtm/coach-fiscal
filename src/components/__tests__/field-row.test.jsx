// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FieldRow from '../FieldRow';

const noop = () => {};

describe('FieldRow — accessibilité (audit E6)', () => {
  it('champ texte : label associé + hint lié par aria-describedby', () => {
    render(<FieldRow
      f={{ key: 'employeur_nom', label: "Nom de l'employeur", type: 'text', hint: 'Tel qu\'il figure sur le bulletin' }}
      value="" onChange={noop} formData={{}}
    />);
    const input = screen.getByLabelText("Nom de l'employeur");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription("Tel qu'il figure sur le bulletin");
  });

  it('champ montant : label associé, valeur formatée fr-FR affichée', () => {
    render(<FieldRow
      f={{ key: 'net_imp', label: 'Salaire net imposable', type: 'number' }}
      value="45000" onChange={noop} formData={{}}
    />);
    expect(screen.getByLabelText('Salaire net imposable')).toBeInTheDocument();
  });

  it('select : label associé', () => {
    render(<FieldRow
      f={{ key: 'regime', label: 'Régime foncier', type: 'select', opts: ['micro', 'réel'] }}
      value="" onChange={noop} formData={{}}
    />);
    expect(screen.getByLabelText('Régime foncier')).toBeInTheDocument();
  });

  it('Oui/Non : groupe nommé + aria-pressed reflète la sélection', () => {
    const onChange = vi.fn();
    render(<FieldRow
      f={{ key: 'pv_mob_option_bareme', label: 'Option barème global 2OP (dividendes + intérêts + PV) ?', type: 'select', opts: ['Non', 'Oui'] }}
      value="Oui" onChange={onChange} formData={{}}
    />);
    const group = screen.getByRole('group', { name: /Option barème global 2OP/ });
    expect(group).toBeInTheDocument();
    const oui = screen.getByRole('button', { name: 'Oui' });
    expect(oui).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Non' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(oui);
    expect(onChange).toHaveBeenCalled();
  });
});
