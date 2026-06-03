'use strict';

const { S3Client } = require('@aws-sdk/client-s3');

const S3_BUCKET = process.env.S3_BUCKET;

let _client = null;

/**
 * Lazily construct the S3 client only when the S3 storage driver is actually
 * used, so a misconfigured/blank AWS setup never breaks local-disk uploads.
 */
function getS3() {
  if (_client) return _client;
  _client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    ...(process.env.S3_ENDPOINT
      ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }
      : {}),
  });
  return _client;
}

function isS3 () {
  return (process.env.STORAGE_DRIVER || 'local') === 's3';
}

module.exports = { getS3, isS3, S3_BUCKET };
