const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();

const app = express();
const upload = multer();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('public'));

// initialize firebase admin
const admin = require('firebase-admin');
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// Fix the private_key formatting (replace literal `\n` with actual newlines)
serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://scavenger-hunt-4173c-default-rtdb.firebaseio.com"
  });

const db = admin.firestore();

// Upload endpoint
app.post('/upload', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const imgurResponse = await fetch('https://api.imgur.com/3/image', {
      method: 'POST',
      headers: {
        Authorization: `Client-ID ${process.env.IMGUR_CLIENT_ID}`,
      },
      body: new URLSearchParams({
        image: req.file.buffer.toString('base64'),
        type: 'base64',
      }),
    });

    const result = await imgurResponse.json();

    if (!result.success) {
      return res.status(500).json({ error: 'Imgur upload failed' });
    }

    res.json({ imageUrl: result.data.link });
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      error: 'Upload failed', 
      details: err.message || String(err) 
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

app.get('/status', async (req, res) => {
    try {
      const statusDoc = await db.collection('meta').doc('status').get();
      if (statusDoc.exists) {
        res.json({ hidersRemaining: statusDoc.data().hidersRemaining });
      } else {
        res.json({ hidersRemaining: 10 }); // fallback value
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not fetch status' });
    }
  });
  
