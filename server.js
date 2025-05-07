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
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
