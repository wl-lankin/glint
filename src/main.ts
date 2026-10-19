import { App } from './app';
import { loadBackend } from './backend';

const backend = await loadBackend();
const app = new App(backend);
await app.start();
