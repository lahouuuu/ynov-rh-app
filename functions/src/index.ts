/**
 * Point d'entrée Cloud Functions for Firebase (2e génération).
 * Une seule fonction HTTP « api » héberge l'API Express ; Firebase Hosting lui
 * transmet les requêtes /api/** (même origine que le frontend).
 */
import { onRequest } from 'firebase-functions/https';
import { setGlobalOptions } from 'firebase-functions';
import { creerApp } from './app';

setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

export const api = onRequest({ memory: '512MiB', timeoutSeconds: 60, concurrency: 40 }, creerApp());
