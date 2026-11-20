
const express = require('express');
const cloudinary = require('cloudinary').v2;

const {
  getFirestore
} = require('firebase-admin/firestore');

// =========================================
// CLOUDINARY CONFIGURATION
// =========================================

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// =========================================
// IMAGE DOWNLOAD LIMITS
// =========================================

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const CDN_TIMEOUT_MS = 15000;
const API_TIMEOUT_MS = 20000;

const REPORT_PHOTO_FOLDER =
  'bahasumbong/report-photos/';

// =========================================
// VALIDATE IMAGE SIGNATURE
// =========================================

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

// =========================================
// CREATE SIGNED CLOUDINARY CDN URL
// =========================================

function createSignedCdnUrl(publicId, format) {

  return cloudinary.url(publicId, {
    resource_type: 'image',
    type: 'authenticated',
    format: format,
    secure: true,
    sign_url: true
  });

}

// =========================================
// CREATE TEMPORARY DOWNLOAD URL
// =========================================

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

// =========================================
// DOWNLOAD IMAGE WITH SIZE LIMIT
// =========================================

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

  // Check Content-Length before downloading.
  const reportedLength =
    response.headers.get('content-length');

  if (reportedLength !== null) {

    const length = Number(reportedLength);

    if (
      Number.isFinite(length) &&
      length > MAX_IMAGE_BYTES
    ) {

      await response.body?.cancel();

      throw new Error(
        'Report photo exceeds download limit.'
      );
    }

  }

  if (!response.body) {

    throw new Error(
      'Cloudinary returned an empty response.'
    );

  }

  const reader = response.body.getReader();

  const chunks = [];
  let totalBytes = 0;

  try {

    while (true) {

      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > MAX_IMAGE_BYTES) {

        await reader.cancel();

        throw new Error(
          'Report photo exceeds download limit.'
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

// =========================================
// FETCH PROTECTED REPORT PHOTO
// =========================================

async function fetchProtectedPhoto(
  publicId,
  format
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

      const url = method.createUrl(
        publicId,
        format
      );

      // URLs remain private to the backend.
      const imageBuffer = await downloadImageBytes(
        url,
        format,
        method.timeout
      );

      return imageBuffer;

    } catch (error) {

      lastError = error;

      console.warn(
        `${method.name} report photo retrieval failed:`,
        error.message
      );

    }

  }

  const error = new Error(
    'Unable to retrieve the protected report photo.'
  );

  const timedOut =
    lastError?.name === 'TimeoutError' ||
    lastError?.name === 'AbortError';

  error.httpStatus = timedOut ? 504 : 502;

  throw error;

}

// =========================================
// EXPORT PROTECTED PHOTO VIEW ROUTES
// =========================================

module.exports = function createReportPhotoViewRoutes(
  verifyFirebaseToken
) {

  const router = express.Router();

  // Endpoint:
  // GET /api/reports/:reportId/photos/:photoIndex

  router.get(
    '/:reportId/photos/:photoIndex',

    verifyFirebaseToken,

    async (req, res) => {

      // Prevent browser and shared caching.
      res.set('Cache-Control', 'private, no-store');
      res.set('X-Content-Type-Options', 'nosniff');

      const { reportId, photoIndex } = req.params;

      const uid = req.firebaseUser.uid;

      // =====================================
      // VALIDATE REQUEST PARAMETERS
      // =====================================

      if (
        !/^[A-Za-z0-9_-]{1,128}$/.test(reportId)
      ) {

        return res.status(400).json({
          status: 'error',
          message: 'Invalid report ID.'
        });

      }

      if (!/^[0-2]$/.test(photoIndex)) {

        return res.status(400).json({
          status: 'error',
          message: 'Invalid photo index.'
        });

      }

      const index = Number(photoIndex);

      try {

        const db = getFirestore();

        // =====================================
        // VERIFY CURRENT USER
        // =====================================

        const userSnap = await db
          .collection('users')
          .doc(uid)
          .get();

        if (!userSnap.exists) {

          return res.status(403).json({
            status: 'error',
            message: 'User account not found.'
          });

        }

        const userData = userSnap.data();

        if (userData.uid !== uid) {

          return res.status(403).json({
            status: 'error',
            message: 'Invalid user account.'
          });

        }

        // =====================================
        // RETRIEVE REPORT
        // =====================================

        const reportSnap = await db
          .collection('reports')
          .doc(reportId)
          .get();

        if (!reportSnap.exists) {

          return res.status(404).json({
            status: 'error',
            message: 'Report not found.'
          });

        }

        const report = reportSnap.data();

        // =====================================
        // AUTHORIZE PHOTO ACCESS
        // =====================================

        const isAdministrator =
          userData.role === 'admin';

        const isResidentOwner =
          userData.role === 'resident' &&
          userData.verificationStatus === 'approved' &&
          report.residentId === uid;

        if (
          !isAdministrator &&
          !isResidentOwner
        ) {

          return res.status(403).json({
            status: 'error',
            message:
              'You are not authorized to view this photo.'
          });

        }

        // For residents, independently verify
        // the matching approval request.
        if (!isAdministrator) {

          const verificationSnap = await db
            .collection('verificationRequests')
            .doc(uid)
            .get();

          if (
            !verificationSnap.exists ||
            verificationSnap.data().uid !== uid ||
            verificationSnap.data().status !== 'approved'
          ) {

            return res.status(403).json({
              status: 'error',
              message: 'Approved resident access required.'
            });

          }

        }

        // =====================================
        // CHECK SAVED PHOTO REFERENCES
        // =====================================

        const photos = report.reportPhotos;

        if (
          !Array.isArray(photos) ||
          index >= photos.length
        ) {

          return res.status(404).json({
            status: 'error',
            message: 'Report photo not found.'
          });

        }

        const photo = photos[index];

        if (
          !photo ||
          typeof photo !== 'object' ||
          photo.deliveryType !== 'authenticated' ||
          typeof photo.publicId !== 'string' ||
          typeof photo.format !== 'string'
        ) {

          return res.status(422).json({
            status: 'error',
            message: 'Invalid report photo reference.'
          });

        }

        // Only retrieve assets from the report-photo
        // Cloudinary folder, never verification images.
        if (
          !photo.publicId.startsWith(
            REPORT_PHOTO_FOLDER
          )
        ) {

          return res.status(422).json({
            status: 'error',
            message: 'Unsupported photo location.'
          });

        }

        const format = photo.format.toLowerCase();

        if (
          !['jpg', 'jpeg', 'png'].includes(format)
        ) {

          return res.status(422).json({
            status: 'error',
            message: 'Unsupported photo format.'
          });

        }

        // =====================================
        // VERIFY CLOUDINARY CONFIGURATION
        // =====================================

        const requiredSettings = [
          'CLOUDINARY_CLOUD_NAME',
          'CLOUDINARY_API_KEY',
          'CLOUDINARY_API_SECRET'
        ];

        if (
          requiredSettings.some(
            name => !process.env[name]
          )
        ) {

          return res.status(503).json({
            status: 'error',
            message: 'Photo storage is not configured.'
          });

        }

        // =====================================
        // RETRIEVE PROTECTED IMAGE
        // =====================================

        const imageBuffer = await fetchProtectedPhoto(
          photo.publicId,
          format
        );

        const contentType =
          format === 'png'
            ? 'image/png'
            : 'image/jpeg';

        // =====================================
        // SEND IMAGE TO AUTHORIZED USER
        // =====================================

        res.set('Content-Type', contentType);
        res.set('Content-Disposition', 'inline');

        return res.status(200).send(imageBuffer);

      } catch (error) {

        console.error(
          'Protected report photo retrieval failed:',
          error.message
        );

        return res.status(
          error.httpStatus || 500
        ).json({
          status: 'error',
          message: 'Unable to load report photo.'
        });

      }

    }
  );

  return router;
};
