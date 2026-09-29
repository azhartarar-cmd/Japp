import { App } from './app';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const scan = document.getElementById('scan') as HTMLElement;
const app = new App(canvas, scan);
app.start();
(window as unknown as { __echoThief: App }).__echoThief = app;
