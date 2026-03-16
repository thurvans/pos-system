const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

// ── Folder uploads ────────────────────────────────────────────
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'products');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── Multer: simpan ke memory dulu ─────────────────────────────
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Format tidak didukung. Gunakan JPG, PNG, atau WebP.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// ── Simpan file ke disk ───────────────────────────────────────
// Pure Node.js — tidak butuh sharp/jimp
// Simpan file asli dengan nama unik, ekstensi sesuai mimetype
const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png':  '.png',
  'image/webp': '.webp',
  'image/gif':  '.gif',
};

const processAndSaveImage = async (fileBuffer, mimetype, originalName) => {
  const ext      = MIME_EXT[mimetype] || path.extname(originalName || '').toLowerCase() || '.jpg';
  const filename = `product_${crypto.randomBytes(10).toString('hex')}${ext}`;
  const filepath = path.join(UPLOAD_DIR, filename);

  fs.writeFileSync(filepath, fileBuffer);
  return filename;
};

// ── Hapus file lama ───────────────────────────────────────────
const deleteImageFile = (urlOrFilename) => {
  if (!urlOrFilename) return;
  try {
    // Ambil nama file saja dari URL atau path
    const basename = path.basename(urlOrFilename);
    const filepath = path.join(UPLOAD_DIR, basename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  } catch (_) {}
};

module.exports = { upload, processAndSaveImage, deleteImageFile, UPLOAD_DIR };
