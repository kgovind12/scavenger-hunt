const express = require('express');
const multer = require('multer');
const cors = require('cors');
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
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

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
      const hiderDoc = await transaction.get(hiderRef);
      if (hiderDoc.exists) {
        throw { status: 409, message: 'Hider already found' };
      }

      transaction.set(hiderRef, { name: player });

      const metaDoc = await transaction.get(metaRef);
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
    console.error(err);
    res.status(500).json({ error: 'Unable to mark hider as found' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});