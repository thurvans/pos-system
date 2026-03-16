const { AppError } = require('../../utils/errors');

const getAndroidDownload = (_req, res, next) => {
  try {
    const url = String(process.env.APK_DOWNLOAD_URL || '').trim();
    if (!url) {
      throw new AppError('APK belum dikonfigurasi. Set APK_DOWNLOAD_URL.', 500);
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
