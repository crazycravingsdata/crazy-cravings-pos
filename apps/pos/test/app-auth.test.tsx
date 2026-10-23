// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { cents, hashPin } from '@crazy-cravings/domain';
import { AppView } from '../src/App';
import type { AuthService, AuthState } from '../src/auth/auth-service';
import type { DriverRecord } from '../src/db/schema';
import { MAX_PIN_FAILURES } from '../src/features/drivers/drivers';
import { openShift } from '../src/features/shift/shift';
import type { FirebaseServices } from '../src/firebase';
import { db } from '../src/state/db';
import { buildOutboxEvent } from '../src/sync/outbox';

// O jsdom não traz WebCrypto completo; usa o do Node, que é o mesmo algoritmo do navegador.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

const FAST = 1_000;

async function makeDriver(
  id: string,
  name: string,
  pin: string,
  active = true,
): Promise<DriverRecord> {
  const h = await hashPin(pin, FAST);
  return { id, name, active, pinSalt: h.salt, pinHash: h.hash, pinIterations: h.iterations, updatedAt: 1 };
}

function fakeFirebase(
  initial: AuthState,
  opts: { signIn?: ReturnType<typeof vi.fn>; drivers?: DriverRecord[] } = {},
) {
  const signIn = opts.signIn ?? vi.fn().mockResolvedValue(undefined);
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
  const fetchDrivers = vi.fn().mockResolvedValue(opts.drivers ?? []);
  const firebase: FirebaseServices = { auth, sender, fetchDrivers };
  return { firebase, signIn, signOut, sender, fetchDrivers };
}

const van = (vanId: string): AuthState => ({
  kind: 'signed-in',
  uid: 'u1',
  email: `${vanId}@crazycravings.ca`,
  role: 'operator',
  vanId,
});

function pickDriverAndPin(name: string, pin: string) {
  fireEvent.change(screen.getByLabelText('Driver'), {
    target: { value: Array.from(screen.getByLabelText('Driver').querySelectorAll('option')).find(
      (o) => o.textContent === name,
    )?.value },
  });
  fireEvent.change(screen.getByLabelText('PIN'), { target: { value: pin } });
}

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
  it('abre direto no turno, com nome livre e escolha de van liberada', async () => {
    render(<AppView firebase={undefined} />);
    expect(await screen.findByRole('heading', { name: 'Open shift' })).toBeTruthy();
    expect((screen.getByLabelText('Van') as HTMLSelectElement).disabled).toBe(false);
    expect(screen.getByLabelText('Operator')).toBeTruthy();
    expect(screen.queryByLabelText('PIN')).toBeNull();
  });
});

describe('login do tablet da van', () => {
  it('mostra a tela de login quando não há sessão', async () => {
    const { firebase } = fakeFirebase({ kind: 'signed-out' });
    render(<AppView firebase={firebase} />);
    expect(await screen.findByRole('heading', { name: 'Activate tablet' })).toBeTruthy();
    expect(screen.queryByLabelText(/email/i)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Open shift' })).toBeNull();
  });

  it('monta o e-mail interno a partir do número da van e envia a senha', async () => {
    const { firebase, signIn } = fakeFirebase({ kind: 'signed-out' });
    render(<AppView firebase={firebase} />);
    fireEvent.change(await screen.findByLabelText('Van number'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Activation password'), { target: { value: 'segredo123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith('van-01@vans.crazycravings.ca', 'segredo123'),
    );
  });

  it('mostra o erro quando a ativação falha', async () => {
    const signIn = vi.fn().mockRejectedValue(new Error('Wrong van number or activation password.'));
    const { firebase } = fakeFirebase({ kind: 'signed-out' }, { signIn });
    render(<AppView firebase={firebase} />);
    fireEvent.change(await screen.findByLabelText('Van number'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Activation password'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Wrong van number or activation password.',
    );
  });

  it('exige número da van e senha antes de chamar a ativação', async () => {
    const { firebase, signIn } = fakeFirebase({ kind: 'signed-out' });
    render(<AppView firebase={firebase} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Activate' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/van number/);
    fireEvent.change(screen.getByLabelText('Van number'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/van number/);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('a tela de turno não mostra e-mail nem o resumo do turno anterior', async () => {
    const { firebase } = fakeFirebase(van('van-01'), {
      drivers: [await makeDriver('d1', 'Ana', '4821')],
    });
    render(<AppView firebase={firebase} />);
    await screen.findByRole('heading', { name: 'Open shift' });
    expect(screen.queryByText(/@/)).toBeNull();
    expect(screen.queryByText(/Last shift/)).toBeNull();
  });

  it('a van do claim fica travada e vale mais do que a van salva no tablet', async () => {
    await db.meta.put({ key: 'vanId', value: 'van-01' });
    const { firebase } = fakeFirebase(van('van-03'), { drivers: [await makeDriver('d1', 'Ana', '4821')] });
    render(<AppView firebase={firebase} />);
    await screen.findByRole('heading', { name: 'Open shift' });
    const select = screen.getByLabelText('Van') as HTMLSelectElement;
    expect(select.value).toBe('van-03');
    expect(select.disabled).toBe(true);
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
    await openShift(db, { vanId: 'van-01', operator: 'Ana', openingFloat: cents(10_000) });
    const { firebase } = fakeFirebase(van('van-02'));
    render(<AppView firebase={firebase} />);
    expect(await screen.findByRole('heading', { name: 'Shift open on another van' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Open shift' })).toBeNull();
  });

  it('permite sair do tablet quando não há vendas pendentes', async () => {
    const { firebase, signOut } = fakeFirebase(van('van-01'), {
      drivers: [await makeDriver('d1', 'Ana', '4821')],
    });
    render(<AppView firebase={firebase} />);
    const button = (await screen.findByRole('button', { name: 'Sign out tablet' })) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(signOut).toHaveBeenCalled();
  });

  it('bloqueia a saída enquanto houver vendas não enviadas', async () => {
    await db.outbox.add(buildOutboxEvent('van-01', 'sale.created', { n: 1 }));
    const { firebase, signOut } = fakeFirebase(van('van-01'), {
      drivers: [await makeDriver('d1', 'Ana', '4821')],
    });
    render(<AppView firebase={firebase} />);
    const button = (await screen.findByRole('button', { name: 'Sign out tablet' })) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(true));
    fireEvent.click(button);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('tenta enviar os eventos pendentes mesmo fora da tela de venda', async () => {
    await db.outbox.add(buildOutboxEvent('van-01', 'shift.closed', { n: 1 }));
    const { firebase, sender } = fakeFirebase(van('van-01'));
    render(<AppView firebase={firebase} />);
    await screen.findByRole('heading', { name: 'Open shift' });
    await waitFor(() => expect(sender).toHaveBeenCalled());
  });

  it('não sincroniza nem baixa motoristas sem conta logada', async () => {
    await db.outbox.add(buildOutboxEvent('van-01', 'sale.created', { n: 1 }));
    const { firebase, sender, fetchDrivers } = fakeFirebase({ kind: 'signed-out' });
    render(<AppView firebase={firebase} />);
    await screen.findByRole('heading', { name: 'Activate tablet' });
    await new Promise((r) => setTimeout(r, 50));
    expect(sender).not.toHaveBeenCalled();
    expect(fetchDrivers).not.toHaveBeenCalled();
  });
});

describe('fechamento de turno pela tela', () => {
  it('fecha o turno, grava a diferença e volta para a abertura sem mostrar resumo', async () => {
    await openShift(db, { vanId: 'van-01', operator: 'Ana', openingFloat: cents(10_000) });
    const { firebase } = fakeFirebase(van('van-01'), {
      drivers: [await makeDriver('d1', 'Ana', '4821')],
    });
    render(<AppView firebase={firebase} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Close shift' }));
    const dialog = await screen.findByRole('dialog', { name: 'Close shift' });
    expect(dialog.textContent).not.toMatch(/\$/); // fechamento cego
    fireEvent.change(screen.getByLabelText('Counted cash (CAD)'), { target: { value: '99.50' } });
    fireEvent.click(Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Close shift')!);

    expect(await screen.findByRole('heading', { name: 'Open shift' })).toBeTruthy();
    const shifts = await db.shifts.toArray();
    expect(shifts).toHaveLength(1);
    expect(shifts[0]).toMatchObject({ countedCash: 9_950, expectedCash: 10_000, cashDifference: -50 });
    expect(shifts[0]?.closedAt).toBeDefined();
    expect(screen.queryByText(/Last shift|Expected|difference/)).toBeNull();
  });
});

describe('abertura de turno por motorista e PIN', () => {
  it('baixa a lista e mostra só motoristas ativos, em ordem alfabética', async () => {
    const drivers = [
      await makeDriver('d2', 'Beto', '7391'),
      await makeDriver('d1', 'Ana', '4821'),
      await makeDriver('d3', 'Carla', '2580', false),
    ];
    const { firebase, fetchDrivers } = fakeFirebase(van('van-01'), { drivers });
    render(<AppView firebase={firebase} />);
    await waitFor(() => {
      const options = Array.from(
        (screen.getByLabelText('Driver') as HTMLSelectElement).querySelectorAll('option'),
      ).map((o) => o.textContent);
      expect(options).toEqual(['Select your name', 'Ana', 'Beto']);
    });
    expect(fetchDrivers).toHaveBeenCalled();
    expect(screen.queryByLabelText('Operator')).toBeNull();
  });

  it('abre o turno com o PIN certo e grava o motorista no turno', async () => {
    const { firebase } = fakeFirebase(van('van-02'), {
      drivers: [await makeDriver('d1', 'Ana', '4821')],
    });
    render(<AppView firebase={firebase} />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Ana' })).toBeTruthy());
    pickDriverAndPin('Ana', '4821');
    fireEvent.click(screen.getByRole('button', { name: 'Open shift' }));

    expect(await screen.findByRole('button', { name: 'Close shift' })).toBeTruthy();
    const shifts = await db.shifts.toArray();
    expect(shifts).toHaveLength(1);
    expect(shifts[0]).toMatchObject({ vanId: 'van-02', driverId: 'd1', openedBy: 'Ana' });
  });

  it('recusa PIN errado, avisa as tentativas e não abre o turno', async () => {
    const { firebase } = fakeFirebase(van('van-01'), {
      drivers: [await makeDriver('d1', 'Ana', '4821')],
    });
    render(<AppView firebase={firebase} />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Ana' })).toBeTruthy());
    pickDriverAndPin('Ana', '9999');
    fireEvent.click(screen.getByRole('button', { name: 'Open shift' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      `Wrong PIN. ${MAX_PIN_FAILURES - 1} attempts left.`,
    );
    expect(await db.shifts.count()).toBe(0);
    expect((screen.getByLabelText('PIN') as HTMLInputElement).value).toBe('');
  });

  it('bloqueia o motorista depois de vários erros, mesmo com o PIN certo', async () => {
    const { firebase } = fakeFirebase(van('van-01'), {
      drivers: [await makeDriver('d1', 'Ana', '4821')],
    });
    render(<AppView firebase={firebase} />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Ana' })).toBeTruthy());

    for (let i = 0; i < MAX_PIN_FAILURES; i += 1) {
      pickDriverAndPin('Ana', '9999');
      fireEvent.click(screen.getByRole('button', { name: 'Open shift' }));
      await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
      await waitFor(() =>
        expect((screen.getByRole('button', { name: 'Open shift' }) as HTMLButtonElement).disabled).toBe(false),
      );
    }
    expect(screen.getByRole('alert').textContent).toMatch(/Too many attempts/);

    pickDriverAndPin('Ana', '4821');
    fireEvent.click(screen.getByRole('button', { name: 'Open shift' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Too many attempts/));
    expect(await db.shifts.count()).toBe(0);
  });

  it('exige escolher o nome e digitar o PIN', async () => {
    const { firebase } = fakeFirebase(van('van-01'), {
      drivers: [await makeDriver('d1', 'Ana', '4821')],
    });
    render(<AppView firebase={firebase} />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Ana' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Open shift' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Select your name.');

    fireEvent.change(screen.getByLabelText('Driver'), { target: { value: 'd1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open shift' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Enter your PIN.'));
  });

  it('o campo de PIN só aceita dígitos, no máximo 6', async () => {
    const { firebase } = fakeFirebase(van('van-01'), {
      drivers: [await makeDriver('d1', 'Ana', '4821')],
    });
    render(<AppView firebase={firebase} />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Ana' })).toBeTruthy());
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '12ab34567' } });
    expect((screen.getByLabelText('PIN') as HTMLInputElement).value).toBe('123456');
  });

  it('sem lista de motoristas, explica e impede abrir o turno', async () => {
    const { firebase } = fakeFirebase(van('van-01'), { drivers: [] });
    render(<AppView firebase={firebase} />);
    expect(await screen.findByText(/No drivers loaded yet/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Open shift' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('sem internet, usa a lista que já estava salva no tablet', async () => {
    await db.drivers.put(await makeDriver('d1', 'Ana', '4821'));
    const { firebase, fetchDrivers } = fakeFirebase(van('van-01'));
    fetchDrivers.mockRejectedValue(new Error('offline'));
    render(<AppView firebase={firebase} />);
    await waitFor(() => expect(fetchDrivers).toHaveBeenCalled());
    expect(await screen.findByRole('option', { name: 'Ana' })).toBeTruthy();
    expect(screen.queryByText(/No drivers loaded yet/)).toBeNull();
  });

  it('motorista removido na gestão some da lista do tablet', async () => {
    await db.drivers.bulkPut([await makeDriver('d1', 'Ana', '4821'), await makeDriver('d2', 'Beto', '7391')]);
    const { firebase } = fakeFirebase(van('van-01'), {
      drivers: [await makeDriver('d1', 'Ana', '4821')],
    });
    render(<AppView firebase={firebase} />);
    // Espera o estado final: Ana na tela e Beto fora. (Checar só a ausência do Beto
    // passaria por vazio enquanto a tela ainda está carregando.)
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Ana' })).toBeTruthy();
      expect(screen.queryByRole('option', { name: 'Beto' })).toBeNull();
    });
    expect((await db.drivers.toArray()).map((d) => d.id)).toEqual(['d1']);
  });
});
