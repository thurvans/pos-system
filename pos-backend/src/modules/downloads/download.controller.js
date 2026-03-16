const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { AppError } = require('../../utils/errors');

const getS3Client = () => {
  const region = process.env.APK_REGION || 'ap-southeast-1';
  return new S3Client({
    region,
    endpoint: process.env.APK_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: process.env.APK_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.APK_SECRET_ACCESS_KEY || '',
    },
  });
};

const getAndroidDownload = async (_req, res, next) => {
  try {
    const directUrl = String(process.env.APK_DOWNLOAD_URL || '').trim();
    let url = directUrl;

    if (!url) {
      const bucket = process.env.APK_BUCKET;
      const objectKey = process.env.APK_OBJECT_KEY;
      if (!bucket || !objectKey) {
        throw new AppError(
          'APK belum dikonfigurasi. Set APK_DOWNLOAD_URL atau APK_BUCKET + APK_OBJECT_KEY.',
          500
        );
      }

      const ttl = Number(process.env.APK_URL_TTL_SECONDS || 600);
      const s3 = getS3Client();
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      });
      url = await getSignedUrl(s3, command, { expiresIn: ttl });
    }

    res.json({
      url,
      version: process.env.APK_VERSION || null,
      build: process.env.APK_BUILD || null,
      checksum: process.env.APK_CHECKSUM || null,
      releaseNotes: process.env.APK_RELEASE_NOTES || null,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAndroidDownload };
