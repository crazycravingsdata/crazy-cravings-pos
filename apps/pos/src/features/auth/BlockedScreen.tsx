type Props = {
  title: string;
  message: string;
  email?: string;
  /** Sair é bloqueado enquanto houver vendas não enviadas (senão elas ficariam presas). */
  canSignOut: boolean;
  onSignOut: () => void;
};

/** Tela de bloqueio: conta sem acesso ao caixa, ou turno de outra van aberto no tablet. */
export function BlockedScreen({ title, message, email, canSignOut, onSignOut }: Props) {
  return (
    <main className="center-screen">
      <div className="card form">
        <h1>{title}</h1>
        {email && <p className="muted">Signed in as {email}</p>}
        <p>{message}</p>
        <button className="btn big" onClick={onSignOut} disabled={!canSignOut}>
          Sign out
        </button>
        {!canSignOut && (
          <p className="muted">
            Sign out is disabled until the pending sales are sent. Connect to the internet and wait.
          </p>
        )}
      </div>
    </main>
  );
}
