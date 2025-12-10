// server/save-campaign.js
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import Papa from 'papaparse';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '10mb' }));

app.post('/api/save-campaign', (req, res) => {
  try {
    const campaign = req.body;
    const campaignId = uuidv4();
    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');

    const row = {
      id: campaignId,
      timestamp,
      name: campaign.name,
      idea: campaign.idea,
      brand_voice: campaign.brand_voice,
      content_types: JSON.stringify(campaign.content_types),
      webpage_types: JSON.stringify(campaign.webpage_types),
      platforms: JSON.stringify(campaign.platforms),
      needs_images: campaign.needs_images,
      image_for: campaign.needs_images ? JSON.stringify(campaign.image_for) : '',
      mode: campaign.mode,
    };

    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const csvPath = path.join(dataDir, 'campaigns.csv');
    const fileExists = fs.existsSync(csvPath);

    const csvLine = Papa.unparse([row], { header: !fileExists });
    const content = fileExists ? '\n' + csvLine.split('\n').slice(1).join('\n') : csvLine;

    fs.appendFileSync(csvPath, content + '\n');

    const imageDir = path.join(dataDir, 'images', campaignId);
    fs.mkdirSync(imageDir, { recursive: true });

    console.log('Saved campaign:', campaignId);
    res.json({ campaignId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Save failed' });
  }
});

app.listen(3001, () => {
  console.log('API server running on http://localhost:3001');
});