'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { getS3, isS3, S3_BUCKET } = require('../lib/s3');

const ALLOWED_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.ppt', '.pptx', '.jpg', '.jpeg', '.png',
];

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
]);

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext) || !ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(
      new Error(
        'Unsupported file type. Allowed: pdf, doc, docx, xls, xlsx, ppt, pptx, jpg, jpeg, png.'
      )
    );
  }
  return cb(null, true);
}

function objectKey(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const unique = crypto.randomBytes(16).toString('hex');
  return `submissions/${Date.now()}-${unique}${ext}`;
}

// Resolve the active storage driver once at load time.
const STORAGE_DRIVER = isS3() ? 's3' : 'local';

let storage;
if (STORAGE_DRIVER === 's3') {
  storage = multerS3({
    s3: getS3(),
    bucket: S3_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata: (req, file, cb) => cb(null, { originalName: encodeURIComponent(file.originalname) }),
    key: (req, file, cb) => cb(null, objectKey(file)),
  });
} else {
  const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || './uploads');
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const unique = crypto.randomBytes(16).toString('hex');
      cb(null, `${Date.now()}-${unique}${ext}`);
    },
  });
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

module.exports = upload;
module.exports.STORAGE_DRIVER = STORAGE_DRIVER;
