// Connecteur URSSAF (tiers mandate) : recuperation des appels de cotisations PDF.
//
// Parcours (verifie sur compte reel) :
//   1. urssaf.fr/accueil/se-connecter -> combobox "Tiers mandate" -> login cabinet
//   2. tdbec.urssaf.fr/accueil -> recherche par SIRET (repli sur le nom) -> "Acceder"
//   3. webti.urssaf.fr -> onglet "Messagerie" -> dcl.urssaf.fr/messagerie
//   4. messages "APPEL DE COTISATIONS" (apercuMsg) -> showAttachement.action -> PDF.
//
// Fonctions exportees :
//   - listerClients(cabinet)        : liste tout le portefeuille (nom + SIRET) via l'API tdbec.
//   - scrapeClient(client, opts)    : un client (connexion dediee).
//   - scrapeAll(clients, opts)      : tous les clients sur UNE SEULE session cabinet (rapide).

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDocument, addRun, getDocumentByEventid } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOWNLOADS_DIR = resolve(__dirname, '..', 'downloads');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const TDBEC_ACCUEIL = 'https://tdbec.urssaf.fr/accueil';

function sanitize(name) {
  return String(name).replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '_').trim().slice(0, 120);
}
function addRunSafe(clientId, run) {
  try { addRun(clientId, run); } catch (e) { console.warn(`(historique non enregistre: ${e.message})`); }
}

async function fermerCookies(page) {
  for (let i = 0; i < 8; i++) {
    let done = false;
    for (const fr of page.frames()) {
      if (!/privacy|tmg|consent/i.test(fr.url())) continue;
      const b = fr.locator('button:has-text("Tout accepter")').first();
      if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); done = true; break; }
    }
    if (!done) {
      const b = page.locator('button:has-text("Tout accepter")').first();
      if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); done = true; }
    }
    if (done) break;
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => { const c = document.querySelector('#privacy-container, #privacy-iframe'); if (c) c.remove(); }).catch(() => {});
}

function dossierClient(client, baseFolder) {
  if (client.dossier && client.dossier.trim()) return client.dossier.trim();
  if (baseFolder && baseFolder.trim()) return resolve(baseFolder.trim(), sanitize(client.nom));
  return resolve(DOWNLOADS_DIR, sanitize(`${client.id}_${client.nom}`));
}

// Connexion au compte cabinet (tiers mandate) -> arrive sur tdbec.urssaf.fr.
async function connecterCabinet(page, cabinet, navTimeout, log) {
  log('Connexion au compte cabinet (tiers mandate)');
  await page.goto('https://www.urssaf.fr/accueil/se-connecter.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await fermerCookies(page);
  await page.locator('#public-combo-search').click().catch(() => {});
  await page.waitForTimeout(700);
  const ok = await page.evaluate(() => {
    const o = document.querySelector('[role="option"][data-value="login-tiers-declarant-tiers-mandate"]');
    if (o) { o.scrollIntoView(); o.click(); return true; }
    return false;
  });
  if (!ok) throw new Error("Option 'Tiers mandate' introuvable (page URSSAF modifiee ?).");
  await page.waitForTimeout(1800);
  await fermerCookies(page);
  await page.locator('#login-tiers-declarant-tiers-mandate-identifiant').fill(cabinet.login);
  await page.locator('#login-tiers-declarant-tiers-mandate-password').fill(cabinet.password);
  await Promise.all([
    page.waitForLoadState('domcontentloaded').catch(() => {}),
    page.locator('#login-tiers-declarant-tiers-mandate-password').press('Enter'),
  ]);
  await page.waitForURL(/tdbec\.urssaf\.fr/, { timeout: navTimeout }).catch(() => {});
  if (!/tdbec\.urssaf\.fr/.test(page.url())) {
    const e = new Error('Connexion cabinet refusee (identifiants cabinet ?)'); e.kind = 'mdp'; throw e;
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(6000);
  log('Connecte au tableau de bord cabinet.');
}

/**
 * Liste TOUS les clients du portefeuille cabinet (nom + SIRET) via l'API tdbec.
 * @param {{login:string,password:string}} cabinet
 * @returns {Promise<Array<{nom:string, siret:string}>>}
 */
export async function listerClients(cabinet, opts = {}) {
  const log = (m) => { const line = `[sync] ${m}`; console.log(line); opts.onLog?.(line); };
  const headless = String(process.env.HEADLESS ?? 'true').toLowerCase() !== 'false';
  const navTimeout = Number(process.env.NAV_TIMEOUT ?? 45000);
  if (!cabinet?.login || !cabinet?.password) throw new Error('Compte cabinet URSSAF non configure.');

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1600, height: 1000 }, locale: 'fr-FR' });
  const page = await context.newPage();
  page.setDefaultTimeout(navTimeout);

  let token = null, comptesUrl = null;
  page.on('request', (r) => {
    if (/api-tdbec\/v1\//i.test(r.url())) { const a = r.headers()['authorization']; if (a) token = a; }
    if (/api-tdbec\/v1\/comptes/i.test(r.url())) comptesUrl = r.url();
  });

  try {
    await connecterCabinet(page, cabinet, navTimeout, log);
    for (let i = 0; i < 20 && !token; i++) await page.waitForTimeout(500);
    if (!token) throw new Error("Jeton d'authentification non capture (page modifiee ?).");

    const base = (comptesUrl || 'https://api.urssaf.fr/api-tdbec/v1/comptes?etat=ACTIFS&page=0&size=10')
      .replace(/([?&])size=\d+/, '$1size=100');
    const rows = [];
    const vus = new Set();
    let totalPages = 1;
    for (let p = 0; p < 50; p++) {
      const url = base.replace(/([?&])page=\d+/, '$1page=' + p);
      const resp = await context.request.get(url, { headers: { authorization: token } });
      if (!resp.ok()) { log(`(page ${p} : HTTP ${resp.status()})`); break; }
      const j = await resp.json();
      totalPages = j.totalPages ?? totalPages;
      const arr = j.listeActive || j.content || j.comptes || [];
      for (const c of arr) {
        const nom = (c.raison_sociale || c.raisonSociale || c.nom || c.libelle || '').toString().trim();
        const siret = String(c.siret || c.siren || '').replace(/\s+/g, '');
        if (nom && siret && !vus.has(siret)) { vus.add(siret); rows.push({ nom, siret }); }
      }
      log(`Page ${p + 1}/${totalPages} : ${rows.length} client(s) cumules`);
      if (p >= totalPages - 1 || arr.length === 0) break;
    }
    log(`${rows.length} client(s) listes.`);
    return rows;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

// Traite UN client sur une page deja connectee (positionnee sur le tableau de bord tdbec).
// Recherche -> Acceder -> Messagerie -> telechargement des appels. Enregistre le run.
// Ne ferme PAS les onglets : c'est l'appelant qui nettoie et revient au tableau de bord.
async function recupererAppelsClient(context, page, client, { baseFolder, navTimeout, log }) {
  const docs = [];
  const siret = String(client.siret || '').replace(/\s+/g, '');
  const clientDir = dossierClient(client, baseFolder);
  mkdirSync(clientDir, { recursive: true });

  try {
    // 1. Recherche (par identifiant, repli sur le nom)
    async function rechercher(terme) {
      const champ = page.locator('#recherche, input.input-search').first();
      await champ.fill('');
      await champ.fill(terme);
      await page.locator('button:has-text("Rechercher")').first().click().catch(() => {});
      await page.waitForTimeout(3500);
      return page.locator('a:has-text("Accéder"), button:has-text("Accéder")').first();
    }
    log(`Recherche du compte ${siret}`);
    let acceder = await rechercher(siret);
    if (!(await acceder.count()) && client.nom) {
      log(`Aucun resultat par identifiant — recherche par nom « ${client.nom} »`);
      acceder = await rechercher(client.nom);
    }
    if (!(await acceder.count())) throw new Error(`Aucun client trouve (${siret} / ${client.nom}).`);

    // 2. Acceder au dossier client (webti)
    const popupP = page.waitForEvent('popup', { timeout: 12000 }).catch(() => null);
    await acceder.click();
    await page.waitForTimeout(4000);
    const cli = (await popupP) || page;
    await cli.waitForLoadState('networkidle').catch(() => {});
    await cli.waitForTimeout(5000);
    await fermerCookies(cli);
    log('Acces au dossier client.');

    // 3. Messagerie
    const popup2P = cli.waitForEvent('popup', { timeout: 12000 }).catch(() => null);
    await cli.locator('a:visible, button:visible', { hasText: 'Messagerie' }).first().click().catch(() => {});
    await cli.waitForTimeout(4000);
    const msg = (await popup2P) || cli;
    log('Ouverture de la messagerie...');
    await msg.waitForURL(/dcl\.urssaf\.fr\/messagerie|Rico\.action/, { timeout: navTimeout }).catch(() => {});
    await msg.waitForLoadState('networkidle').catch(() => {});
    await msg
      .waitForFunction(() => document.querySelectorAll('[onclick*="apercuMsg"]').length > 0, null, { timeout: 30000 })
      .catch(() => log('Avertissement : liste des messages non detectee (delai).'));
    await msg.waitForTimeout(1500);

    // 4. Appels de cotisations -> PDF.
    // On lit la liste des messages de DEUX manieres complementaires :
    //   a) le DOM deja affiche a l'ecran (fiable : la page est chargee),
    //   b) la pagination via RicoFil.action (pour aller au-dela de la 1ere page).
    // Le libelle teste est celui de la LIGNE entiere (<tr>), pas seulement de
    // l'element portant le onclick (souvent une icone sans texte).
    const detection = await msg.evaluate(async () => {
      const APPEL = /APPEL\s+DE\s+COTISATION/i;

      // Extrait les lignes {id, texte} d'un Document (DOM vivant ou page fetchee).
      function extraire(racine) {
        const lignes = [];
        for (const el of racine.querySelectorAll('[onclick*="apercuMsg"]')) {
          const m = (el.getAttribute('onclick') || '').match(/apercuMsg\('?(\d+)'?\)/);
          if (!m) continue;
          const ligne = el.closest('tr') || el.parentElement || el;
          const texte = (ligne.textContent || '').replace(/\s+/g, ' ').trim();
          lignes.push({ id: m[1], texte });
        }
        return lignes;
      }

      let lignes = extraire(document); // a) DOM vivant

      for (let p = 1; p <= 30; p++) { // b) pagination
        let html;
        try {
          const r = await fetch(`/messagerie/RicoFil.action?pageEnCours=${p}&timestamp=${Date.now()}`, { credentials: 'include' });
          html = await r.text();
        } catch { break; }
        if (!html || !/apercuMsg/i.test(html)) break;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const l = extraire(doc);
        if (!l.length) break;
        lignes = lignes.concat(l);
      }

      // Deduplication par identifiant de message.
      const vus = new Set();
      const uniques = [];
      for (const li of lignes) { if (!vus.has(li.id)) { vus.add(li.id); uniques.push(li); } }

      return {
        appels: uniques.filter((li) => APPEL.test(li.texte)).map((li) => li.id),
        total: uniques.length,
        echantillon: uniques.slice(0, 12).map((li) => li.texte.slice(0, 90)),
      };
    });

    const eids = [...new Set(detection.appels)];
    log(`${eids.length} appel(s) de cotisations detecte(s).`);
    if (eids.length === 0 && detection.total > 0) {
      log(`Diagnostic : ${detection.total} message(s) dans la messagerie, aucun libelle « APPEL DE COTISATION ».`);
      for (const t of detection.echantillon) log(`   • « ${t} »`);
    } else if (eids.length === 0) {
      log('Diagnostic : aucun message lu dans la messagerie (liste vide ou non chargee).');
    }

    let existants = 0;
    for (const eid of eids) {
      try {
        const dest = resolve(clientDir, `APPEL_DE_COTISATIONS_${eid}.pdf`);
        // Economie : si le fichier est deja present (ou deja enregistre), on ne re-telecharge pas.
        const dejaEnBase = getDocumentByEventid(client.id, eid);
        if (existsSync(dest) || (dejaEnBase && dejaEnBase.fichier && existsSync(dejaEnBase.fichier))) {
          existants++;
          // S'assure que la base reference bien le fichier present.
          try { addDocument(client.id, { libelle: `APPEL DE COTISATIONS (${eid})`, fichier: existsSync(dest) ? dest : dejaEnBase.fichier, eventid: eid }); } catch {}
          log(`Deja telecharge : APPEL_DE_COTISATIONS_${eid}.pdf (ignore)`);
          continue;
        }
        await msg.evaluate((id) => window.apercuMsg(id), eid);
        const href = await msg.waitForFunction((id) => {
          const a = [...document.querySelectorAll('a')].find((x) => /showAttachement\.action/i.test(x.href) && x.href.includes('EVENTID=' + id));
          return a ? a.href : null;
        }, eid, { timeout: 20000 }).then((h) => h.jsonValue()).catch(() => null);
        if (!href) { log(`(appel ${eid} : PDF introuvable)`); continue; }
        const resp = await msg.request.get(href, { timeout: navTimeout });
        if (!resp.ok()) throw new Error(`HTTP ${resp.status()}`);
        const buf = await resp.body();
        if (buf.length < 100 || buf.subarray(0, 4).toString() !== '%PDF') throw new Error('reponse non-PDF');
        writeFileSync(dest, buf);
        try { addDocument(client.id, { libelle: `APPEL DE COTISATIONS (${eid})`, fichier: dest, eventid: eid }); } catch (e) { log(`(doc non enregistre: ${e.message})`); }
        docs.push({ libelle: 'APPEL DE COTISATIONS', fichier: dest });
        log(`OK : APPEL_DE_COTISATIONS_${eid}.pdf (${Math.round(buf.length / 1024)} Ko)`);
      } catch (e) {
        log(`Echec appel ${eid} : ${e.message}`);
      }
    }

    const total = eids.length;
    let message;
    if (total === 0) { log('Aucun appel de cotisations disponible pour ce client.'); message = 'Aucun appel de cotisations disponible'; }
    else message = `${docs.length} nouveau(x), ${existants} deja present(s) sur ${total}`;
    addRunSafe(client.id, { statut: 'succes', message, nb_docs: docs.length });
    log(`Termine : ${docs.length} nouveau(x), ${existants} deja present(s).`);
    return { ok: true, docs };
  } catch (err) {
    const shot = resolve(clientDir, `_debug_${Date.now()}.png`);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    addRunSafe(client.id, { statut: err.kind === 'mdp' ? 'echec_mdp' : 'echec', message: err.message, nb_docs: docs.length });
    log(`ERREUR : ${err.message}`);
    return { ok: false, error: err.message, docs };
  }
}

// Ferme les onglets secondaires (webti/dcl) et revient au tableau de bord pour le client suivant.
async function retourTableauBord(context, page, navTimeout) {
  for (const p of context.pages()) { if (p !== page) await p.close().catch(() => {}); }
  await page.goto(TDBEC_ACCUEIL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3500);
}

/**
 * Recupere les appels de cotisations d'UN client (connexion dediee).
 * @param {{id:number, nom:string, siret:string, dossier?:string}} client
 * @param {{onLog?:(m:string)=>void, baseFolder?:string, cabinet?:{login:string,password:string}}} [opts]
 */
export async function scrapeClient(client, opts = {}) {
  const log = (m) => { const line = `[${client.nom}] ${m}`; console.log(line); opts.onLog?.(line); };
  const headless = String(process.env.HEADLESS ?? 'true').toLowerCase() !== 'false';
  const navTimeout = Number(process.env.NAV_TIMEOUT ?? 45000);
  const cabinet = opts.cabinet;
  if (!cabinet?.login || !cabinet?.password) {
    addRunSafe(client.id, { statut: 'echec', message: 'Compte cabinet URSSAF non configure (Reglages).', nb_docs: 0 });
    return { ok: false, error: 'Compte cabinet URSSAF manquant. Renseigne-le dans les reglages.' };
  }
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ acceptDownloads: true, userAgent: UA, viewport: { width: 1600, height: 1000 }, locale: 'fr-FR' });
  const page = await context.newPage();
  page.setDefaultTimeout(navTimeout);
  try {
    await connecterCabinet(page, cabinet, navTimeout, log);
    await page.waitForTimeout(2000);
    return await recupererAppelsClient(context, page, client, { baseFolder: opts.baseFolder, navTimeout, log });
  } catch (err) {
    addRunSafe(client.id, { statut: err.kind === 'mdp' ? 'echec_mdp' : 'echec', message: err.message, nb_docs: 0 });
    log(`ERREUR : ${err.message}`);
    return { ok: false, error: err.message, docs: [] };
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

/**
 * Recupere les appels de cotisations de TOUS les clients sur UNE SEULE session cabinet.
 * @param {Array<{id:number,nom:string,siret:string,dossier?:string}>} clients
 * @param {{onLog?:(m:string)=>void, baseFolder?:string, cabinet?:{login:string,password:string}, shouldStop?:()=>boolean}} [opts]
 */
export async function scrapeAll(clients, opts = {}) {
  const log = (m) => { const line = `[lot] ${m}`; console.log(line); opts.onLog?.(line); };
  const headless = String(process.env.HEADLESS ?? 'true').toLowerCase() !== 'false';
  const navTimeout = Number(process.env.NAV_TIMEOUT ?? 45000);
  const cabinet = opts.cabinet;
  const resume = { total: clients.length, traites: 0, avecDocs: 0, docs: 0, echecs: 0 };
  if (!cabinet?.login || !cabinet?.password) return { ok: false, error: 'Compte cabinet URSSAF manquant.', resume };

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ acceptDownloads: true, userAgent: UA, viewport: { width: 1600, height: 1000 }, locale: 'fr-FR' });
  const page = await context.newPage();
  page.setDefaultTimeout(navTimeout);

  try {
    await connecterCabinet(page, cabinet, navTimeout, log);
    log(`Traitement de ${clients.length} client(s) sur une seule session...`);
    await page.waitForTimeout(2000);

    for (let i = 0; i < clients.length; i++) {
      if (opts.shouldStop && opts.shouldStop()) { log('Arret demande, fin du lot.'); break; }
      const client = clients[i];
      const clog = (m) => { const line = `[${client.nom}] ${m}`; console.log(line); opts.onLog?.(line); };
      clog(`(${i + 1}/${clients.length})`);
      const r = await recupererAppelsClient(context, page, client, { baseFolder: opts.baseFolder, navTimeout, log: clog });
      resume.traites++;
      if (r.ok) { if (r.docs && r.docs.length) { resume.avecDocs++; resume.docs += r.docs.length; } }
      else resume.echecs++;
      // Retour au tableau de bord (ferme les onglets webti/dcl) pour le client suivant.
      await retourTableauBord(context, page, navTimeout).catch((e) => log(`(retour tableau de bord: ${e.message})`));
    }
    log(`Termine : ${resume.docs} document(s) pour ${resume.avecDocs}/${resume.traites} client(s) ; ${resume.echecs} echec(s).`);
    return { ok: true, resume };
  } catch (err) {
    log(`ERREUR session : ${err.message}`);
    return { ok: false, error: err.message, resume };
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}
