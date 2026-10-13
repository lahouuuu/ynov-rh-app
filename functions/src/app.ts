/**
 * Application Express de l'API. Toutes les routes (sauf /sante) exigent un
 * utilisateur authentifié et actif ; les contrôles de rôle et de périmètre sont
 * faits dans chaque route / service.
 */
import express, { Router } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { authentifier } from './middleware/authentification';
import { enTetesSecurite, limiteur, verifierAppCheck } from './middleware/securite';
import { gestionnaireErreurs, ErreurHttp } from './infra/erreurs';
import { routesDemandes } from './routes/demandes';
import { routesSignalements } from './routes/signalements';
import { routesJustificatifs } from './routes/justificatifs';
import { routesDotations } from './routes/dotations';
import { routesAdmin } from './routes/admin';
import { routesGenerales } from './routes/general';
import { routesExport } from './routes/export';

/** Convertit récursivement les Timestamp Firestore en chaînes ISO 8601. */
export function serialiser(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(serialiser);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, serialiser(x)]));
  }
  return v;
}

export function creerApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(enTetesSecurite);

  // CORS : uniquement pour le développement local (en production, Firebase
  // Hosting sert le frontend et l'API sur la même origine via /api, et aucune
  // origine tierce n'est autorisée sauf configuration explicite CORS_ORIGINES).
  const enLocal = process.env.FUNCTIONS_EMULATOR === 'true' || process.env.NODE_ENV === 'test' || !process.env.K_SERVICE;
  const originesAutorisees = (process.env.CORS_ORIGINES ?? (enLocal ? 'http://localhost:3000,http://127.0.0.1:3000' : ''))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.use((req, res, next) => {
    const origine = req.headers.origin;
    if (origine && originesAutorisees.includes(origine)) {
      res.setHeader('Access-Control-Allow-Origin', origine);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Firebase-AppCheck');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, OPTIONS');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Corps JSON : 15 Mo uniquement pour le dépôt de justificatifs, 100 Ko ailleurs
  const corpsVolumineux = express.json({ limit: '15mb' });
  const corpsStandard = express.json({ limit: '100kb' });
  app.use((req, res, next) =>
    (req.method === 'POST' && /\/justificatifs\/?$/.test(req.path) ? corpsVolumineux : corpsStandard)(req, res, next),
  );
  app.use((_req, res, next) => {
    const json = res.json.bind(res);
    res.json = (corps: unknown) => json(serialiser(corps));
    next();
  });

  const api = Router();
  api.get('/sante', (_req, res) => {
    res.json({ statut: 'ok', service: 'ynov-rh-api' });
  });
  api.use(verifierAppCheck);
  api.use(authentifier);
  // Limites par utilisateur authentifié
  api.use(limiteur('general', 300, 60_000));
  const limiteDepots = limiteur('depots', 30, 10 * 60_000);
  api.use('/justificatifs', (req, res, next) => (req.method === 'POST' ? limiteDepots(req, res, next) : next()));
  api.use('/export', limiteur('exports', 20, 10 * 60_000));
  api.use('/', routesGenerales);
  api.use('/demandes', routesDemandes);
  api.use('/signalements', routesSignalements);
  api.use('/justificatifs', routesJustificatifs);
  api.use('/dotations', routesDotations);
  api.use('/export', routesExport);
  api.use('/admin', routesAdmin);
  api.use((_req, _res, next) => next(new ErreurHttp(404, 'ROUTE_INCONNUE', 'Route inconnue.')));

  // /api/... via Firebase Hosting ; /... en appel direct de la fonction
  app.use('/api', api);
  app.use('/', api);
  app.use(gestionnaireErreurs);
  return app;
}
