'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const pool = require('../db/pool');
const verifyToken = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const upload = require('../middleware/upload');
const { getS3, S3_BUCKET } = require('../lib/s3');
const { SITE_DEFAULTS } = require('../lib/siteDefaults');

const router = express.Router();

const EDITABLE_KEYS = Object.keys(SITE_DEFAULTS); // hero, metrics, decade, journey, about, programs, newsletter, contact
const MEDIA_KEYS = ['hero', 'about'];

// ---- Public ----

// GET /api/site/content — full landing content (defaults merged with DB overrides)
router.get('/content', async (req, res, next) => {
  try {
    const content = JSON.parse(JSON.stringify(SITE_DEFAULTS));
    const { rows } = await pool.query('SELECT key, value FROM site_settings');
    for (const r of rows) content[r.key] = r.value;

    const partners = await pool.query(
      'SELECT id, name, website, logo_url FROM partners WHERE is_active = true ORDER BY sort_order, id'
    );
    content.partners = partners.rows.map((p) => ({
      id: p.id,
      name: p.name,
      website: p.website,
      logo: p.logo_url ? `/api/site/partners/${p.id}/logo` : null,
    }));

    const media = await pool.query('SELECT key FROM site_media');
    content.media = {};
    for (const m of media.rows) content.media[m.key] = `/api/site/media/${m.key}`;

    return res.json({ content });
  } catch (err) {
    return next(err);
  }
});

// GET /api/site/partners/:id/logo — public logo (streamed from local disk or S3)
router.get('/partners/:id/logo', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(404).end();

    const { rows } = await pool.query(
      'SELECT logo_url, logo_storage FROM partners WHERE id = $1',
      [id]
    );
    const p = rows[0];
    if (!p || !p.logo_url) return res.status(404).end();

    if ((p.logo_storage || 's3') === 'local') {
      const dir = path.resolve(process.env.UPLOADS_DIR || './uploads');
      const fp = path.join(dir, path.basename(p.logo_url));
      if (!fs.existsSync(fp)) return res.status(404).end();
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.sendFile(fp);
    }

    try {
      const obj = await getS3().send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: p.logo_url }));
      res.setHeader('Content-Type', obj.ContentType || 'image/png');
      if (obj.ContentLength != null) res.setHeader('Content-Length', obj.ContentLength);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      obj.Body.on('error', next);
      return obj.Body.pipe(res);
    } catch (e) {
      if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return res.status(404).end();
      throw e;
    }
  } catch (err) {
    return next(err);
  }
});

// GET /api/site/media/:key — public hero/about imagery (local disk or S3)
router.get('/media/:key', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT file_url, file_storage FROM site_media WHERE key = $1',
      [req.params.key]
    );
    const m = rows[0];
    if (!m || !m.file_url) return res.status(404).end();

    if ((m.file_storage || 's3') === 'local') {
      const dir = path.resolve(process.env.UPLOADS_DIR || './uploads');
      const fp = path.join(dir, path.basename(m.file_url));
      if (!fs.existsSync(fp)) return res.status(404).end();
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.sendFile(fp);
    }

    try {
      const obj = await getS3().send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: m.file_url }));
      res.setHeader('Content-Type', obj.ContentType || 'image/jpeg');
      if (obj.ContentLength != null) res.setHeader('Content-Length', obj.ContentLength);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      obj.Body.on('error', next);
      return obj.Body.pipe(res);
    } catch (e) {
      if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return res.status(404).end();
      throw e;
    }
  } catch (err) {
    return next(err);
  }
});

// ---- Admin only (everything below) ----
router.use(verifyToken, requireRole('admin'));

// PUT /api/site/media/:key — upload hero/about image (field "file")
router.put('/media/:key', upload.single('file'), async (req, res, next) => {
  try {
    const { key } = req.params;
    if (!MEDIA_KEYS.includes(key)) return res.status(400).json({ error: 'Unknown media slot' });
    if (!req.file) return res.status(400).json({ error: 'An image file is required' });

    const fileUrl = req.file.key || req.file.filename;
    await pool.query(
      `INSERT INTO site_media (key, file_url, file_storage, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET file_url = EXCLUDED.file_url,
         file_storage = EXCLUDED.file_storage, updated_at = NOW()`,
      [key, fileUrl, upload.STORAGE_DRIVER]
    );
    return res.json({ key, url: `/api/site/media/${key}` });
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/site/media/:key
router.delete('/media/:key', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM site_media WHERE key = $1', [req.params.key]);
    return res.json({ message: 'Image removed' });
  } catch (err) {
    return next(err);
  }
});

// PUT /api/site/content/:key — replace a section's content
router.put('/content/:key', async (req, res, next) => {
  try {
    const { key } = req.params;
    if (!EDITABLE_KEYS.includes(key)) {
      return res.status(400).json({ error: 'Unknown content section' });
    }
    const value = req.body && req.body.value !== undefined ? req.body.value : req.body;
    if (value === null || typeof value !== 'object') {
      return res.status(400).json({ error: 'Content must be a JSON object or array' });
    }

    await pool.query(
      `INSERT INTO site_settings (key, value, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, JSON.stringify(value)]
    );
    return res.json({ key, value });
  } catch (err) {
    return next(err);
  }
});

// GET /api/site/partners — all partners (admin, incl. inactive)
router.get('/partners', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, website, logo_url, sort_order, is_active, created_at
         FROM partners ORDER BY sort_order, id`
    );
    return res.json({
      partners: rows.map((p) => ({ ...p, logo: p.logo_url ? `/api/site/partners/${p.id}/logo` : null })),
    });
  } catch (err) {
    return next(err);
  }
});

// POST /api/site/partners — create (optional logo upload under "logo")
router.post('/partners', upload.single('logo'), async (req, res, next) => {
  try {
    const { name, website, sort_order } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'Partner name is required' });

    let logoUrl = null;
    let logoStorage = null;
    if (req.file) {
      logoUrl = req.file.key || req.file.filename;
      logoStorage = upload.STORAGE_DRIVER;
    }

    const { rows } = await pool.query(
      `INSERT INTO partners (name, website, logo_url, logo_storage, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, website, logo_url, sort_order, is_active, created_at`,
      [name.trim(), website && website.trim() ? website.trim() : null, logoUrl, logoStorage, parseInt(sort_order, 10) || 0]
    );
    return res.status(201).json({ partner: rows[0] });
  } catch (err) {
    return next(err);
  }
});

// PATCH /api/site/partners/:id — update fields and/or replace logo
router.patch('/partners/:id', upload.single('logo'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid partner id' });

    const { name, website, sort_order, is_active } = req.body || {};
    const sets = [];
    const params = [];
    const add = (frag, val) => {
      params.push(val);
      sets.push(`${frag} = $${params.length}`);
    };

    if (name !== undefined) add('name', String(name).trim());
    if (website !== undefined) add('website', website ? String(website).trim() : null);
    if (sort_order !== undefined) add('sort_order', parseInt(sort_order, 10) || 0);
    if (is_active !== undefined) add('is_active', is_active === 'true' || is_active === true);
    if (req.file) {
      add('logo_url', req.file.key || req.file.filename);
      add('logo_storage', upload.STORAGE_DRIVER);
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE partners SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, name, website, logo_url, sort_order, is_active, created_at`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Partner not found' });
    return res.json({ partner: rows[0] });
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/site/partners/:id
router.delete('/partners/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid partner id' });
    const { rowCount } = await pool.query('DELETE FROM partners WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Partner not found' });
    return res.json({ message: 'Partner deleted' });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
