
const express = require('express');
const cloudinary = require('cloudinary').v2;

const {
  getFirestore
} = require('firebase-admin/firestore');

// CLOUDINARY CONFIGURATION
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// DOWNLOAD LIMITS
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const CDN_TIMEOUT_MS = 15000;
const API_TIMEOUT_MS = 20000;

// CHECK IMAGE FILE SIGNATURE
function isExpectedImage(buffer, format) {

  if (format === 'jpg' || format === 'jpeg') {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }

  if (format === 'png') {

    const signature = Buffer.from([
      137, 80, 78, 71, 13, 10, 26, 10
    ]);

    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(signature)
    );
  }

  return false;
}

// CREATE SIGNED CLOUDINARY CDN URL
// This URL stays on the Node.js backend.
function createSignedCdnUrl(publicId, format) {

  return cloudinary.url(publicId, {
    resource_type: 'image',
    type: 'authenticated',
    format: format,
    secure: true,
    sign_url: true
  });
}

// CREATE PRIVATE DOWNLOAD API URL
// Used as a fallback if CDN delivery fails.
function createPrivateDownloadUrl(publicId, format) {

  return cloudinary.utils.private_download_url(
    publicId,
    format,
    {
      resource_type: 'image',
      type: 'authenticated',
      expires_at:
        Math.floor(Date.now() / 1000) + 120
    }
  );
}

// SAFELY DOWNLOAD IMAGE BYTES
async function downloadImageBytes(
  url,
  format,
  timeoutMs
) {

  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    throw new Error(
      `Cloudinary returned HTTP ${response.status}`
    );
  }

  // Check reported size before reading
  const reportedLength =
    response.headers.get('content-length');

  if (reportedLength !== null) {

    const length = Number(reportedLength);

    if (
      Number.isFinite(length) &&
      length > MAX_IMAGE_BYTES
    ) {
      throw new Error('Image exceeds size limit.');
    }
  }

  if (!response.body) {
    throw new Error('Empty image response.');
  }

  // Read with a strict size limit
  const reader = response.body.getReader();

  const chunks = [];
  let totalBytes = 0;

  try {

    while (true) {

      const { done, value } = await reader.read();

      if (done) break;

      totalBytes += value.byteLength;

      if (totalBytes > MAX_IMAGE_BYTES) {

        await reader.cancel();

        throw new Error(
          'Image exceeds download limit.'
        );
      }

      chunks.push(Buffer.from(value));
    }

  } finally {
    reader.releaseLock();
  }

  const imageBuffer = Buffer.concat(
    chunks,
    totalBytes
  );

  if (!isExpectedImage(imageBuffer, format)) {
    throw new Error(
      'Invalid image data received from Cloudinary.'
    );
  }

  return imageBuffer;
}

// DOWNLOAD AUTHENTICATED IMAGE
// FIRST: Signed CDN
// FALLBACK: Cloudinary Private Download API
async function fetchProtectedImage(
  publicId,
  format,
  side
) {

  const methods = [
    {
      name: 'Signed CDN',
      timeout: CDN_TIMEOUT_MS,
      createUrl: createSignedCdnUrl
    },
    {
      name: 'Private Download API',
      timeout: API_TIMEOUT_MS,
      createUrl: createPrivateDownloadUrl
    }
  ];

  let lastError = null;

  for (const method of methods) {

    try {

      console.log(
        `[${side}] Trying ${method.name}...`
      );

      // Generate the URL only on the server
      const url = method.createUrl(
        publicId,
        format
      );

      const imageBuffer = await downloadImageBytes(
        url,
        format,
        method.timeout
      );

      console.log(
        `[${side}] Loaded successfully using ${method.name}.`
      );

      return imageBuffer;

    } catch (error) {

      lastError = error;

      console.warn(
        `[${side}] ${method.name} failed:`,
        error.name,
        error.message
      );
    }
  }

  const error = new Error(
    'Both Cloudinary retrieval methods failed.'
  );

  const isTimeout =
    lastError?.name === 'TimeoutError' ||
    lastError?.name === 'AbortError';

  error.httpStatus = isTimeout ? 504 : 502;

  throw error;
}

// PROTECTED IMAGE ROUTES
module.exports = function createVerificationImageRoutes(
  verifyFirebaseToken
) {

  const router = express.Router();

  // GET /api/verification/images/:uid/:side
  router.get(
    '/images/:uid/:side',

    // Firebase token protection
    verifyFirebaseToken,

    async (req, res) => {

      // Prevent browser/shared cache storage
      res.set('Cache-Control', 'private, no-store');
      res.set('X-Content-Type-Options', 'nosniff');

      const { uid, side } = req.params;

      // VALIDATE IMAGE SIDE
      if (side !== 'front' && side !== 'back') {

        return res.status(400).json({
          status: 'error',
          message: 'Invalid image side.'
        });
      }

      if (!uid || uid.includes('/')) {

        return res.status(400).json({
          status: 'error',
          message: 'Invalid resident ID.'
        });
      }

      try {

        const db = getFirestore();

        const adminUid = req.firebaseUser.uid;

        // VERIFY ADMINISTRATOR
        const adminSnap = await db
          .collection('users')
          .doc(adminUid)
          .get();

        const adminData = adminSnap.exists
          ? adminSnap.data()
          : null;

        if (
          !adminData ||
          adminData.role !== 'admin' ||
          adminData.uid !== adminUid
        ) {

          return res.status(403).json({
            status: 'error',
            message: 'Administrator access required.'
          });
        }

        // GET RESIDENT VERIFICATION REQUEST
        const requestSnap = await db
          .collection('verificationRequests')
          .doc(uid)
          .get();

        if (!requestSnap.exists) {

          return res.status(404).json({
            status: 'error',
            message: 'Verification request not found.'
          });
        }

        const requestData = requestSnap.data();

        if (
          requestData.uid !== uid ||
          requestData.imageDeliveryType !==
          'authenticated'
        ) {

          return res.status(404).json({
            status: 'error',
            message: 'Protected images are unavailable.'
          });
        }

        // SELECT IMAGE REFERENCE
        const publicId = side === 'front'
          ? requestData.frontImagePublicId
          : requestData.backImagePublicId;

        const format = side === 'front'
          ? requestData.frontImageFormat
          : requestData.backImageFormat;

        if (
          typeof publicId !== 'string' ||
          !publicId ||
          typeof format !== 'string'
        ) {

          return res.status(404).json({
            status: 'error',
            message: 'Image not found.'
          });
        }

        const normalizedFormat =
          format.toLowerCase();

        if (
          !['jpg', 'jpeg', 'png'].includes(
            normalizedFormat
          )
        ) {

          return res.status(422).json({
            status: 'error',
            message: 'Unsupported image format.'
          });
        }

        // RETRIEVE THE PROTECTED IMAGE
        const imageBuffer = await fetchProtectedImage(
          publicId,
          normalizedFormat,
          side
        );

        const contentType =
          normalizedFormat === 'png'
            ? 'image/png'
            : 'image/jpeg';

        // SEND IMAGE TO AUTHORIZED ADMINISTRATOR
        res.set('Content-Type', contentType);
        res.set('Content-Disposition', 'inline');

        return res.status(200).send(imageBuffer);

      } catch (error) {

        console.error(
          'Protected image retrieval failed:',
          error.message
        );

        return res.status(
          error.httpStatus || 500
        ).json({
          status: 'error',
          message: 'Unable to load verification image.'
        });
      }
    }
  );

  return router;
};
