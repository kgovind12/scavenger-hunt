const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 🔧 Setup Cloudinary
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'uploads',
    allowed_formats: ['jpg', 'jpeg', 'png'],
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'image') {
      cb(null, true);
    } else {
      cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
    }
  }
});

// 🔐 Initialize Firebase Admin
const admin = require('firebase-admin');

let serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountRaw && process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
  try {
    serviceAccountRaw = fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8');
  } catch (err) {
    console.error('Unable to read FIREBASE_SERVICE_ACCOUNT_PATH:', err.message);
  }
}

if (!serviceAccountRaw) {
  console.error('FIREBASE_SERVICE_ACCOUNT environment variable is required to initialize Firebase Admin');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountRaw);
} catch (err) {
  console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', err.message);
  process.exit(1);
}

if (serviceAccount.private_key) {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://scavenger-hunt-4173c-default-rtdb.firebaseio.com"
});

const db = admin.firestore();

// ✅ Upload Image to Cloudinary
app.post('/upload', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    console.log('Uploaded to Cloudinary:', req.file.path);
    res.json({ imageUrl: req.file.path });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'Upload failed',
      details: err.message || String(err),
    });
  }
});

// ✅ Get Hunt Status from Firebase
app.get('/status', async (req, res) => {
  try {
    const statusDoc = await db.collection('meta').doc('status').get();
    if (statusDoc.exists) {
      res.json({ hidersRemaining: statusDoc.data().hidersRemaining });
    } else {
      res.json({ hidersRemaining: 10 });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch status' });
  }
});

// ✅ Mark a hider as found using the server-side admin SDK
app.post('/found', async (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Player number is required' });
  }

  const player = name.trim();
  const hiderRef = db.collection('hiders').doc(player);
  const metaRef = db.collection('meta').doc('status');

  try {
    await db.runTransaction(async (transaction) => {
      // PHASE 1: Read all documents first
      const hiderDoc = await transaction.get(hiderRef);
      const metaDoc = await transaction.get(metaRef);

      // PHASE 2: Check conditions
      if (hiderDoc.exists) {
        throw { status: 409, message: 'Hider already found' };
      }

      // PHASE 3: All writes
      transaction.set(hiderRef, { name: player });

      if (!metaDoc.exists) {
        transaction.set(metaRef, { hidersFound: 1 });
      } else {
        const current = metaDoc.data().hidersFound || 0;
        transaction.update(metaRef, { hidersFound: current + 1 });
      }
    });

    res.json({ success: true });
  } catch (err) {
    if (err && err.status === 409) {
      return res.status(409).json({ error: err.message });
    }

    const errorPayload = {
      message: err && err.message ? err.message : 'Unknown error',
      name: err && err.name,
      code: err && err.code,
      status: err && err.status,
      stack: err && err.stack,
      details: err && err.details,
      requestBody: req.body,
      player,
    };

    console.error('Failed to mark hider as found:');
    console.error(JSON.stringify(errorPayload, Object.getOwnPropertyNames(err || {}), 2));

    const errorMessage = err && err.message ? err.message : 'Unable to mark hider as found';
    res.status(500).json({ error: errorMessage });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});