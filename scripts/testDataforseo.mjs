import fs from 'fs';
import path from 'path';

const envFile = path.resolve('.env.local');
if (fs.existsSync(envFile)) {
  const content = fs.readFileSync(envFile, 'utf-8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...rest] = trimmed.split('=');
    if (!key || rest.length === 0) return;
    const value = rest.join('=').trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
}

const query = process.argv[2] || '"OpenAI" latest announcement';
const maxItems = Number(process.argv[3] || 2);

const login =
  process.env.VITE_DATAFORSEO_LOGIN ||
  process.env.DATAFORSEO_LOGIN ||
  process.env.VITE_DATAFORSEO_LOGIN ||
  process.env.DATAFORSEO_USERNAME;

const password =
  process.env.VITE_DATAFORSEO_PASSWORD ||
  process.env.DATAFORSEO_PASSWORD ||
  process.env.VITE_DATAFORSEO_KEY ||
  process.env.DATAFORSEO_KEY;

if (!login || !password) {
  console.error('Missing DataForSEO credentials in environment variables or .env.local.');
  process.exit(1);
}

const payload = [
  {
    language_name: 'English',
    location_name: 'United States',
    keyword: query,
    max_items: maxItems,
  },
];

const auth = Buffer.from(`${login}:${password}`).toString('base64');

const main = async () => {
  const response = await fetch('https://api.dataforseo.com/v3/serp/google/news/live/advanced', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await response.text();
  console.log('Status:', response.status);
  console.log('Body snippet:', body.slice(0, 400));
};

main().catch(err => {
  console.error('DataForSEO test failed:', err);
  process.exit(1);
});

