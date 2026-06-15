// Mise a jour automatique depuis GitHub (compatible installation par ZIP, sans git).
// Lance au demarrage par Demarrer.bat AVANT le serveur : si une version plus
// recente existe sur GitHub, on telecharge l'archive et on remplace les fichiers
// applicatifs (en preservant data/, downloads/, .env et node_modules).
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, cpSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = 'TARNCOMPTA/urssaf-scraper';
const BRANCHE = 'main';
const URL_PKG = `https://raw.githubusercontent.com/${REPO}/${BRANCHE}/package.json`;
const URL_ZIP = `https://codeload.github.com/${REPO}/zip/refs/heads/${BRANCHE}`;

// Fichiers/dossiers locaux a NE jamais ecraser (donnees + config + launcher en cours).
const PRESERVER = new Set(['data', 'downloads', 'node_modules', '.env', '.git']);
const estLauncherEnCours = (nom) => /^d[eé]marrer\.bat$/i.test(nom); // ce .bat tourne pendant la maj

function versionParts(v) { return String(v || '0').split('.').map((n) => parseInt(n, 10) || 0); }
function plusRecente(a, b) {
  const A = versionParts(a), B = versionParts(b);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    if ((A[i] || 0) > (B[i] || 0)) return true;
    if ((A[i] || 0) < (B[i] || 0)) return false;
  }
  return false;
}

async function main() {
  const localPkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'));
  const vLocale = localPkg.version || '0.0.0';

  let vDistante;
  try {
    const r = await fetch(URL_PKG, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    vDistante = JSON.parse(await r.text()).version;
  } catch (e) {
    console.log(`Verification des mises a jour impossible (${e.message}). Demarrage de la v${vLocale}.`);
    return;
  }

  if (!plusRecente(vDistante, vLocale)) {
    console.log(`Application a jour (v${vLocale}).`);
    return;
  }

  console.log(`Mise a jour disponible : v${vLocale} -> v${vDistante}. Telechargement...`);
  const tmp = resolve(__dirname, '_maj_tmp');
  const zip = resolve(__dirname, '_maj.zip');
  try {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(zip, { force: true });

    const resp = await fetch(URL_ZIP);
    if (!resp.ok) throw new Error('telechargement HTTP ' + resp.status);
    writeFileSync(zip, Buffer.from(await resp.arrayBuffer()));

    mkdirSync(tmp, { recursive: true });
    execFileSync('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${tmp}' -Force`],
      { stdio: 'ignore', windowsHide: true });

    const racine = resolve(tmp, `urssaf-scraper-${BRANCHE}`);
    if (!existsSync(racine)) throw new Error('archive inattendue (dossier racine absent)');

    for (const entree of readdirSync(racine)) {
      if (PRESERVER.has(entree) || estLauncherEnCours(entree)) continue;
      cpSync(resolve(racine, entree), resolve(__dirname, entree), { recursive: true, force: true });
    }

    console.log('Fichiers mis a jour. Verification des dependances...');
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['install', '--no-audit', '--no-fund'], { cwd: __dirname, stdio: 'ignore', windowsHide: true });

    console.log(`Mise a jour vers la v${vDistante} terminee.`);
  } catch (e) {
    console.log(`Echec de la mise a jour (${e.message}). Demarrage de la v${vLocale}.`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(zip, { force: true });
  }
}

await main();
