// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { cents } from '@crazy-cravings/domain';
import { AppView } from '../src/App';
import type { AuthService, AuthState } from '../src/auth/auth-service';
import type { FirebaseServices } from '../src/firebase';
import { db } from '../src/state/db';
import { openShift } from '../src/features/shift/shift';
import { buildOutboxEvent } from '../src/sync/outbox';

function fakeFirebase(initial: AuthState, signIn = vi.fn().mockResolvedValue(undefined)) {
  const signOut = vi.fn().mockResolvedValue(undefined);
  const auth: AuthService = {
    subscribe(listener) {
      listener(initial);
      return () => {};
    },
    signIn,
    signOut,
  };
  // O envio falha de propósito: mantém os eventos pendentes, como se estivesse sem sinal.
  const sender = vi.fn().mockRejectedValue(new Error('offline'));
  const firebase: FirebaseServices = { auth, sender };
  return { firebase, signIn, signOut, sender };
}

const operator = (vanId: string): AuthState => ({
  kind: 'signed-in',
  uid: 'u1',
  email: 'ana@crazycravings.ca',
  role: 'operator',
  vanId,
});

beforeEach(async () => {
  vi.stubEnv('VITE_SEED_DEMO', 'false');
  // Limpa as tabelas sem fechar o banco: fechar enquanto consultas do teste
  // anterior ainda terminam gera DatabaseClosedError não tratado.
  await Promise.all(db.tables.map((table) => table.clear()));
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('AppView sem Firebase (modo local)', () => {
  it('abre direto no turno, com escolha de van liberada', async () => {
    render(<AppView firebase={undefined} />);
    expect(await screen.findByRole('heading', { name: 'Open shift' })).toBeTruthy();
    const van = screen.getByLabelText('Van') as HTMLSelectElement;
    expect(van.disabled).toBe(false);
  });
});

describe('AppView com login', () => {
  it('mostra a tela de login quando não há sessão', async () => {
    const { firebase } = fakeFirebase({ kind: 'signed-out' });
    render(<AppView firebase={firebase} />);
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Open shift' })).toBeNull();
  });

  it('envia email e senha ao entrar', async () => {
    const { firebase, signIn } = fakeFirebase({ kind: 'signed-out' });
    render(<AppView firebase={firebase} />);
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'ana@crazycravings.ca' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'segredo123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith('ana@crazycravings.ca', 'segredo123'));
  });

  it('mostra o erro quando o login falha', async () => {
    const signIn = vi.fn().mockRejectedValue(new Error('Wrong email or password.'));
    const { firebase } = fakeFirebase({ kind: 'signed-out' }, signIn);
    render(<AppView firebase={firebase} />);
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'a@b.ca' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Wrong email or password.');
  });

  it('exige email e senha antes de chamar o login', async () => {
    const { firebase, signIn } = fakeFirebase({ kind: 'signed-out' });
    render(<AppView firebase={firebase} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Enter your email/);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('operador entra com a van do claim travada e o nome preenchido', async () => {
    const { firebase } = fakeFirebase(operator('van-02'));
    render(<AppView firebase={firebase} />);
    expect(await screen.findByRole('heading', { name: 'Open shift' })).toBeTruthy();
    const van = screen.getByLabelText('Van') as HTMLSelectElement;
    expect(van.value).toBe('van-02');
    expect(van.disabled).toBe(true);
    expect((screen.getByLabelText('Operator') as HTMLInputElement).value).toBe('ana');
  });

  it('a van do claim vale mais do que a van salva no tablet', async () => {
    await db.meta.put({ key: 'vanId', value: 'van-01' });
    const { firebase } = fakeFirebase(operator('van-03'));
    render(<AppView firebase={firebase} />);
    await screen.findByRole('heading', { name: 'Open shift' });
    expect((screen.getByLabelText('Van') as HTMLSelectElement).value).toBe('van-03');
  });

  it('conta de gerente não acessa o caixa', async () => {
    const { firebase } = fakeFirebase({
      kind: 'no-access',
      email: 'chefe@crazycravings.ca',
      reason: 'This is a manager account. Sign in with an operator account to use the register.',
    });
    render(<AppView firebase={firebase} />);
    expect(await screen.findByRole('heading', { name: 'No access' })).toBeTruthy();
    expect(screen.getByText(/manager account/i)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Open shift' })).toBeNull();
  });

  it('bloqueia quando há turno aberto de outra van neste tablet', async () => {
    await openShift(db, { vanId: 'van-01', operator: 'ana', openingFloat: cents(10_000) });
    const { firebase } = fakeFirebase(operator('van-02'));
    render(<AppView firebase={firebase} />);
    expect(await screen.findByRole('heading', { name: 'Shift open on another van' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Open shift' })).toBeNull();
  });

  it('permite sair quando não há vendas pendentes', async () => {
    const { firebase, signOut } = fakeFirebase(operator('van-01'));
    render(<AppView firebase={firebase} />);
    const button = (await screen.findByRole('button', { name: 'Sign out' })) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(signOut).toHaveBeenCalled();
  });

  it('bloqueia a saída enquanto houver vendas não enviadas', async () => {
    await db.outbox.add(buildOutboxEvent('van-01', 'sale.created', { n: 1 }));
    const { firebase, signOut } = fakeFirebase(operator('van-01'));
    render(<AppView firebase={firebase} />);
    const button = (await screen.findByRole('button', { name: 'Sign out' })) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(true));
    fireEvent.click(button);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('tenta enviar os eventos pendentes mesmo fora da tela de venda', async () => {
    await db.outbox.add(buildOutboxEvent('van-01', 'shift.closed', { n: 1 }));
    const { firebase, sender } = fakeFirebase(operator('van-01'));
    render(<AppView firebase={firebase} />);
    await screen.findByRole('heading', { name: 'Open shift' });
    await waitFor(() => expect(sender).toHaveBeenCalled());
  });

  it('não sincroniza sem conta logada', async () => {
    await db.outbox.add(buildOutboxEvent('van-01', 'sale.created', { n: 1 }));
    const { firebase, sender } = fakeFirebase({ kind: 'signed-out' });
    render(<AppView firebase={firebase} />);
    await screen.findByRole('heading', { name: 'Sign in' });
    await new Promise((r) => setTimeout(r, 50));
    expect(sender).not.toHaveBeenCalled();
  });
});
