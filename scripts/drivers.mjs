#!/usr/bin/env node
/**
 * Cadastro de motoristas (identificação por PIN no tablet da van).
 * Rode numa máquina de confiança, com credenciais de serviço FORA do repositório.
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/caminho/fora/do/git/chave.json
 *   node scripts/drivers.mjs add --project <id> --name "Ana Souza" --generate-pin
 *   node scripts/drivers.mjs list --project <id>
 *   node scripts/drivers.mjs deactivate --project <id> --id <driver-id>
 *   node scripts/drivers.mjs activate --project <id> --id <driver-id>
 *   node scripts/drivers.mjs reset-pin --project <id> --id <driver-id> --generate-pin
 *
 * O PIN pode vir de --generate-pin (gerado e mostrado UMA vez), da variável DRIVER_PIN
 * ou de --pin (fica no histórico do terminal; prefira as duas primeiras).
 * Só o hash do PIN vai para o Firestore. Use --dry-run para ver o registro sem gravar nada.
 */
import { randomInt, randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { hashPin, validatePinFormat } from '../packages/domain/src/pin.ts';

/** Gera um PIN de 4 dígitos que passa nas regras de formato (sem sequência nem repetição). */
export function generatePin() {
  for (;;) {
    const pin = String(randomInt(0, 10_000)).padStart(4, '0');
    if (validatePinFormat(pin) === null) return pin;
  }
}

/** Monta o registro do motorista. O PIN nunca entra: só sal e hash. */
export async function buildDriverDoc({ name, pin, now = Date.now() }) {
  const clean = String(name ?? '').trim();
  if (clean.length < 1 || clean.length > 60) throw new Error('--name deve ter de 1 a 60 caracteres');
  const h = await hashPin(pin);
  return {
    name: clean,
    active: true,
    pinSalt: h.salt,
    pinHash: h.hash,
    pinIterations: h.iterations,
    updatedAt: now,
  };
}

function resolvePin(values) {
  if (values['generate-pin']) return { pin: generatePin(), generated: true };
  const pin = values.pin ?? process.env.DRIVER_PIN;
  if (!pin) throw new Error('Informe o PIN com --generate-pin, DRIVER_PIN ou --pin');
  const problem = validatePinFormat(pin);
  if (problem) throw new Error(problem);
  return { pin, generated: false };
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      project: { type: 'string' },
      name: { type: 'string' },
      id: { type: 'string' },
      pin: { type: 'string' },
      'generate-pin': { type: 'boolean' },
      'dry-run': { type: 'boolean' },
    },
  });

  const command = positionals[0];
  const COMMANDS = ['add', 'list', 'deactivate', 'activate', 'reset-pin'];
  if (!COMMANDS.includes(command)) {
    throw new Error(`Comando inválido. Use: ${COMMANDS.join(', ')}`);
  }
  if (!values['dry-run'] && !values.project) throw new Error('Informe --project <id>');
  if (['deactivate', 'activate', 'reset-pin'].includes(command) && !values.id) {
    throw new Error('Informe --id <driver-id> (veja com o comando list)');
  }

  if (command === 'add' || command === 'reset-pin') {
    const { pin, generated } = resolvePin(values);
    if (command === 'add' && !values.name) throw new Error('Informe --name "Nome do motorista"');

    if (values['dry-run']) {
      const doc = await buildDriverDoc({ name: values.name ?? 'dry-run', pin });
      console.log('DRY RUN. Nada foi gravado. Registro que iria para drivers/<id>:');
      console.log(JSON.stringify(doc, null, 2));
      if (generated) console.log(`PIN gerado (anote, não será mostrado de novo): ${pin}`);
      return;
    }

    const db = await connect(values.project);
    if (command === 'add') {
      const doc = await buildDriverDoc({ name: values.name, pin });
      const same = await db.collection('drivers').where('active', '==', true).get();
      if (same.docs.some((d) => d.data().name?.toLowerCase() === doc.name.toLowerCase())) {
        throw new Error(`Já existe um motorista ativo chamado "${doc.name}". Use um nome diferente.`);
      }
      const id = randomUUID();
      await db.collection('drivers').doc(id).set(doc);
      console.log(`OK: ${doc.name} cadastrado (id ${id}).`);
    } else {
      const { name: _ignored, active: _a, ...pinFields } = await buildDriverDoc({ name: 'x', pin });
      await requireDriver(db, values.id);
      await db.collection('drivers').doc(values.id).update(pinFields);
      console.log(`OK: PIN de ${values.id} redefinido.`);
    }
    if (generated) console.log(`PIN (anote, não será mostrado de novo): ${pin}`);
    return;
  }

  const db = await connect(values.project);

  if (command === 'list') {
    const snap = await db.collection('drivers').get();
    if (snap.empty) return console.log('Nenhum motorista cadastrado.');
    for (const d of snap.docs) {
      const v = d.data();
      console.log(`${v.active ? 'ativo  ' : 'inativo'}  ${v.name}  (id ${d.id})`);
    }
    return;
  }

  await requireDriver(db, values.id);
  const active = command === 'activate';
  await db.collection('drivers').doc(values.id).update({ active, updatedAt: Date.now() });
  console.log(`OK: ${values.id} ${active ? 'ativado' : 'desativado'}. O tablet atualiza na próxima sincronização.`);
}

async function connect(project) {
  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  initializeApp({ credential: applicationDefault(), projectId: project });
  return getFirestore();
}

async function requireDriver(db, id) {
  const snap = await db.collection('drivers').doc(id).get();
  if (!snap.exists) throw new Error(`Motorista ${id} não encontrado`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`Erro: ${err.message}`);
    process.exit(1);
  });
}
