
const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

const {
  getFirestore,
  FieldValue
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
// UPLOAD LIMITS
// =========================================

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_PHOTO_BYTES,
    files: MAX_PHOTOS,
    fields: 0,
    parts: MAX_PHOTOS
  },

  fileFilter(req, file, callback) {

    if (![
      'image/jpeg',
      'image/png'
    ].includes(file.mimetype)) {

      return callback(
        new Error('Only JPG and PNG photos are allowed.')
      );
    }

    callback(null, true);
  }
});

// =========================================
// IMAGE SIGNATURE CHECK
// =========================================

function isValidImage(file) {

  if (!file?.buffer?.length) {
    return false;
  }

  const bytes = file.buffer;

  const isJpeg =
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;

  const pngSignature = Buffer.from([
    137, 80, 78, 71, 13, 10, 26, 10
  ]);

  const isPng =
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(pngSignature);

  return (
    (file.mimetype === 'image/jpeg' && isJpeg) ||
    (file.mimetype === 'image/png' && isPng)
  );
}

// =========================================
// CHECK RESIDENT APPROVAL
// =========================================

function isApprovedResident(
  userSnap,
  verificationSnap,
  uid
) {

  if (!userSnap.exists || !verificationSnap.exists) {
    return false;
  }

  const user = userSnap.data();
  const verification = verificationSnap.data();

  return (
    user.uid === uid &&
    user.role === 'resident' &&
    user.verificationStatus === 'approved' &&
    verification.uid === uid &&
    verification.status === 'approved'
  );
}

// =========================================
// CHECK REPORT ELIGIBILITY
// =========================================

function canAttachPhotos(report, uid) {

  return (
    report &&
    report.residentId === uid &&
    report.status === 'pending' &&
    !Object.prototype.hasOwnProperty.call(
      report,
      'reportPhotos'
    )
  );
}

// =========================================
// CLOUDINARY PHOTO UPLOAD
// =========================================

function uploadPhoto(file) {

  return new Promise((resolve, reject) => {

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'bahasumbong/report-photos',
        resource_type: 'image',
        type: 'authenticated',
        overwrite: false
      },

      (error, result) => {

        if (error) {
          return reject(error);
        }

        if (!result?.public_id) {
          return reject(
            new Error('Cloudinary returned no photo reference.')
          );
        }

        resolve(result);
      }
    );

    stream.on('error', reject);
    stream.end(file.buffer);

  });
}

// =========================================
// CLEAN UP FAILED UPLOADS
// =========================================

async function cleanupPhotos(images) {

  const results = await Promise.allSettled(
    images.map(image =>
      cloudinary.uploader.destroy(
        image.public_id,
        {
          resource_type: 'image',
          type: image.type || 'authenticated',
          invalidate: true
        }
      )
    )
  );

  for (const result of results) {

    if (
      result.status === 'rejected' ||
      result.value?.result !== 'ok'
    ) {
      console.warn(
        'A Cloudinary photo could not be cleaned up.'
      );
    }

  }
}

// =========================================
// PREVENT PARALLEL CLOUDINARY UPLOADS
// (ONE NODE.JS SERVER PROCESS)
// =========================================

// An in-memory lock protects the current
// single-process academic demo.
//
// The Firestore transaction still provides
// final protection against duplicate
// photo references.
//
// This lock does not coordinate across
// multiple Node.js server instances.

const activePhotoUploads = new Set();

// =========================================
// EXPORT REPORT PHOTO ROUTES
// =========================================

module.exports = function createReportPhotoRoutes(
  verifyFirebaseToken
) {

  const router = express.Router();

  const receivePhotos = upload.array(
    'photos',
    MAX_PHOTOS
  );

  // POST /api/reports/:reportId/photos
  router.post(
    '/:reportId/photos',

    // Verify Firebase login token.
    verifyFirebaseToken,

    // =====================================
    // AUTHORIZE BEFORE RECEIVING FILES
    // =====================================

    async (req, res, next) => {

      const reportId = req.params.reportId;
      const uid = req.firebaseUser.uid;

      // Accept safe Firestore document identifiers.
      if (
        !/^[A-Za-z0-9_-]{1,128}$/.test(reportId)
      ) {

        return res.status(400).json({
          status: 'error',
          message: 'Invalid report ID.'
        });
      }

      try {

        const db = getFirestore();

        const userRef = db
          .collection('users')
          .doc(uid);

        const verificationRef = db
          .collection('verificationRequests')
          .doc(uid);

        const reportRef = db
          .collection('reports')
          .doc(reportId);

        const [
          userSnap,
          verificationSnap,
          reportSnap
        ] = await Promise.all([
          userRef.get(),
          verificationRef.get(),
          reportRef.get()
        ]);

        if (!isApprovedResident(
          userSnap,
          verificationSnap,
          uid
        )) {

          return res.status(403).json({
            status: 'error',
            message: 'Approved resident access required.'
          });
        }

        if (!reportSnap.exists) {

          return res.status(404).json({
            status: 'error',
            message: 'Report not found.'
          });
        }

        const report = reportSnap.data();

        if (report.residentId !== uid) {

          return res.status(403).json({
            status: 'error',
            message: 'You cannot upload photos to this report.'
          });
        }

        if (!canAttachPhotos(report, uid)) {

          return res.status(409).json({
            status: 'error',
            message:
              'This report is no longer accepting photos.'
          });
        }

        req.reportRef = reportRef;
        req.userRef = userRef;
        req.verificationRef = verificationRef;

        next();

      } catch (error) {

        console.error(
          'Report photo authorization failed:',
          error.message
        );

        return res.status(500).json({
          status: 'error',
          message: 'Unable to verify report permissions.'
        });
      }
    },

    // =====================================
    // RECEIVE REPORT PHOTOS
    // =====================================

    (req, res, next) => {

      receivePhotos(req, res, error => {

        if (error) {

          return res.status(400).json({
            status: 'error',

            message:
              error.code === 'LIMIT_FILE_SIZE'
                ? 'Each photo must be 3 MB or smaller.'
                : 'Upload 1 to 3 valid JPG or PNG photos.'
          });
        }

        next();
      });
    },

    // =====================================
    // UPLOAD PHOTOS AND SAVE REFERENCES
    // =====================================

    async (req, res) => {

      res.set('Cache-Control', 'no-store');

      const files = req.files || [];

      if (
        files.length < 1 ||
        files.length > MAX_PHOTOS
      ) {

        return res.status(400).json({
          status: 'error',
          message: 'Please select 1 to 3 photos.'
        });
      }

      // Check image headers and content signatures.
      if (!files.every(isValidImage)) {

        return res.status(400).json({
          status: 'error',
          message: 'Please upload valid JPG or PNG photos.'
        });
      }

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

      const uid = req.firebaseUser.uid;
      const db = getFirestore();

      // =====================================
      // PREVENT SIMULTANEOUS UPLOADS
      // =====================================

      // Acquire the lock synchronously before
      // starting any Cloudinary upload.

      const reportId = req.reportRef.id;

      if (activePhotoUploads.has(reportId)) {

        return res.status(409).json({
          status: 'error',
          message:
            'Photos are already being uploaded for this ' +
            'report. Please wait before retrying.'
        });
      }

      activePhotoUploads.add(reportId);

      const uploadedImages = [];

      try {

        // =====================================
        // UPLOAD PHOTOS TO CLOUDINARY
        // =====================================

        for (const file of files) {

          const result = await uploadPhoto(file);

          uploadedImages.push(result);

          if (
            result.type !== 'authenticated' ||
            result.resource_type !== 'image' ||
            !['jpg', 'jpeg', 'png'].includes(result.format)
          ) {

            throw new Error(
              'Cloudinary returned an unsupported photo.'
            );
          }
        }

        // =====================================
        // PREPARE PROTECTED PHOTO REFERENCES
        // =====================================

        const photoReferences = uploadedImages.map(
          image => ({
            publicId: image.public_id,
            format: image.format,
            deliveryType: 'authenticated'
          })
        );

        // =====================================
        // RECHECK PERMISSIONS AT COMMIT TIME
        // =====================================

        await db.runTransaction(async transaction => {

          const [
            userSnap,
            verificationSnap,
            reportSnap
          ] = await Promise.all([

            transaction.get(req.userRef),

            transaction.get(req.verificationRef),

            transaction.get(req.reportRef)

          ]);

          if (
            !isApprovedResident(
              userSnap,
              verificationSnap,
              uid
            ) ||
            !reportSnap.exists ||
            !canAttachPhotos(
              reportSnap.data(),
              uid
            )
          ) {

            const error = new Error(
              'Report photo upload is no longer allowed.'
            );

            error.code = 'NOT_ELIGIBLE';

            throw error;
          }

          // Firebase Admin SDK performs this update.
          // Residents cannot directly modify photo
          // references through Firestore client rules.

          transaction.update(req.reportRef, {

            reportPhotos: photoReferences,

            photosUpdatedAt:
              FieldValue.serverTimestamp()

          });

        });

        // =====================================
        // SUCCESS
        // =====================================

        return res.status(201).json({
          status: 'success',
          message: 'Report photos uploaded successfully.',
          reportId: req.reportRef.id,
          photoCount: photoReferences.length
        });

      } catch (error) {

        console.error(
          'Report photo upload failed:',
          error.message
        );

        // =====================================
        // CLEAN UP AFTER HANDLED FAILURES
        // =====================================

        // Remove newly uploaded photos if
        // saving to Firestore fails.

        if (uploadedImages.length > 0) {
          await cleanupPhotos(uploadedImages);
        }

        return res.status(
          error.code === 'NOT_ELIGIBLE' ? 409 : 500
        ).json({
          status: 'error',

          message:
            error.code === 'NOT_ELIGIBLE'
              ? 'This report can no longer accept photos.'
              : 'Unable to save report photos.'
        });

      } finally {

        // =====================================
        // RELEASE UPLOAD LOCK
        // =====================================

        // Release the lock after success or
        // a handled error.

        // A server restart clears these locks.
        // This implementation does not provide
        // cross-process or crash recovery locks.

        activePhotoUploads.delete(reportId);
      }
    }
  );

  return router;
};
