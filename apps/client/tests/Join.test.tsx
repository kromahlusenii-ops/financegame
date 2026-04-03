import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Join from '../src/pages/Join';

globalThis.fetch = vi.fn();

afterEach(() => {
  cleanup();
});

const renderJoin = () => {
  return render(
    <MemoryRouter>
      <Join />
    </MemoryRouter>
  );
};

describe('Join page', () => {
  it('renders code and name inputs', () => {
    renderJoin();
    const codeInputs = screen.getAllByPlaceholderText('ABCDEF');
    const nameInputs = screen.getAllByPlaceholderText('Enter your name');
    expect(codeInputs.length).toBeGreaterThanOrEqual(1);
    expect(nameInputs.length).toBeGreaterThanOrEqual(1);
  });

  it('join button is disabled until both fields are filled', () => {
    renderJoin();
    const buttons = screen.getAllByRole('button', { name: /join game/i });
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables button when both fields are valid', () => {
    renderJoin();
    const codeInput = screen.getAllByPlaceholderText('ABCDEF')[0];
    const nameInput = screen.getAllByPlaceholderText('Enter your name')[0];

    fireEvent.change(codeInput, { target: { value: 'ABCDEF' } });
    fireEvent.change(nameInput, { target: { value: 'Alice' } });

    const button = screen.getAllByRole('button', { name: /join game/i })[0];
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('has maxLength attribute on name input', () => {
    renderJoin();
    const nameInput = screen.getAllByPlaceholderText('Enter your name')[0] as HTMLInputElement;
    expect(nameInput.maxLength).toBe(20);
  });
});
