import express, { type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import setupStatusHandler from '../api/setup-status';
import setupAdminHandler from '../api/setup-admin';
import usersHandler from '../api/users';
import backupHandler from '../api/backup';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const app = express();
const port = Number(process.env.PORT || 10000);

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

function run(handler: (req: any, res: any) => unknown) {
  return (req: Request, res: Response) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      console.error('Unhandled API error:', error);
      if (!res.headersSent) res.status(500).json({ error: 'حدث خطأ غير متوقع.' });
    });
  };
}

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'nexora-collect', time: new Date().toISOString() });
});

app.all('/api/setup-status', run(setupStatusHandler));
app.all('/api/setup-admin', run(setupAdminHandler));
app.all('/api/users', run(usersHandler));
app.all('/api/backup', run(backupHandler));

app.use(
  express.static(distDir, {
    index: false,
    maxAge: '1h',
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }),
);

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(distDir, 'index.html'));
});

app.use((_req, res) => {
  res.status(404).json({ error: 'المسار غير موجود.' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Nexora Collect is running on 0.0.0.0:${port}`);
});
