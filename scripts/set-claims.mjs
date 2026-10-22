#!/usr/bin/env node
/**
 * Define role e van de uma conta do Firebase Auth (custom claims).
 * Rode numa máquina de confiança, com credenciais de serviço FORA do repositório.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/caminho/fora/do/git/chave.json \
 *   node scripts/set-claims.mjs --project <id> --email ana@exemplo.ca --role operator --van van-01
 *   node scripts/set-claims.mjs --project <id> --email chefe@exemplo.ca --role manager
 *
 * ATENÇÃO: setCustomUserClaims SUBSTITUI todos os claims da conta.
 * A pessoa precisa sair e entrar de novo (ou esperar o token renovar) para valer.
 */
import { parseArgs } from 'node:util';

const ROLES = ['operator', 'manager', 'admin'];
const VAN_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** Valida os argumentos e monta os claims. Lança Error com mensagem clara se inválido. */
export function buildClaims({ role, van }) {
  if (!ROLES.includes(role)) {
    throw new Error(`--role deve ser um de: ${ROLES.join(', ')}`);
  }
  if (role === 'operator') {
    if (!van || !VAN_PATTERN.test(van)) {
      throw new Error('Operador precisa de --van válida, ex.: van-01 (letras minúsculas, números e hífen)');
    }
    return { role, vanId: van };
  }
  if (van) throw new Error(`--van só vale para operator (recebido para ${role})`);
  return { role };
}

async function main() {
  const { values } = parseArgs({
    options: {
      project: { type: 'string' },
      email: { type: 'string' },
      role: { type: 'string' },
      van: { type: 'string' },
    },
  });

  if (!values.project || !values.email) {
    throw new Error('Uso: --project <id> --email <email> --role <operator|manager|admin> [--van <van-id>]');
  }
  const claims = buildClaims({ role: values.role, van: values.van });

  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  initializeApp({ credential: applicationDefault(), projectId: values.project });

  const auth = getAuth();
  const user = await auth.getUserByEmail(values.email);
  await auth.setCustomUserClaims(user.uid, claims);

  console.log(`OK: ${values.email} (${user.uid}) -> ${JSON.stringify(claims)}`);
  console.log('A pessoa deve sair e entrar de novo para o novo acesso valer.');
}

import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`Erro: ${err.message}`);
    process.exit(1);
  });
}
