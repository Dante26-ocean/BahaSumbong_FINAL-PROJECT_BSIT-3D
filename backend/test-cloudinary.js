
require('dotenv').config();

const cloudinary = require('cloudinary').v2;

// Check Cloudinary configuration
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
  console.error('Missing Cloudinary credentials in .env');
  process.exit(1);
}

// Configure Cloudinary
cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true
});

// Test connection
async function testConnection() {
  try {
    const result = await cloudinary.api.ping();

    if (result.status === 'ok') {
      console.log('Cloudinary connected successfully!');
    } else {
      console.error('Unexpected Cloudinary response.');
    }

  } catch (error) {
    console.error(
      'Cloudinary connection failed:',
      error.message
    );
    process.exitCode = 1;
  }
}

testConnection();
