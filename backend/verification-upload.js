
const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

const {
  getFirestore,
  FieldValue
} = require('firebase-admin/firestore');

// CLOUDINARY CONFIGURATION
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// IMAGE UPLOAD SETTINGS
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 3 * 1024 * 1024,
    files: 2,
    parts: 2
  },

  fileFilter(req, file, callback) {
    const allowedTypes = [
      'image/jpeg',
      'image/png'
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return callback(
        new Error('Only JPG and PNG images are allowed.')
      );
    }

    callback(null, true);
  }
});

// VALIDATE IMAGE FILE SIGNATURES
function isValidImage(file) {
  if (!file || !file.buffer || !file.buffer.length) {
    return false;
  }

  const data = file.buffer;

  const jpeg =
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff;

  const pngSignature = Buffer.from([
    137, 80, 78, 71, 13, 10, 26, 10
  ]);

  const png =
    data.length >= 8 &&
    data.subarray(0, 8).equals(pngSignature);

  return (
    (file.mimetype === 'image/jpeg' && jpeg) ||
    (file.mimetype === 'image/png' && png)
  );
}

// UPLOAD IMAGE TO PROTECTED CLOUDINARY STORAGE
function uploadImage(file) {
  return new Promise((resolve, reject) => {

    const stream = cloudinary.uploader.upload_stream(
      {
        upload_preset: process.env.CLOUDINARY_UPLOAD_PRESET,
        resource_type: 'image',
        type: 'authenticated',
        overwrite: false
      },

      (error, result) => {
        if (error) {
          return reject(error);
        }

        if (!result) {
          return reject(
            new Error('Cloudinary returned no upload result.')
          );
        }

        resolve(result);
      }
    );

    stream.on('error', reject);
    stream.end(file.buffer);
  });
}

// CLEAN UP NEW IMAGES IF SUBMISSION FAILS
async function cleanupImages(images) {
  await Promise.allSettled(
    images.map(image =>
      cloudinary.uploader.destroy(image.public_id, {
        resource_type: 'image',
        type: image.type,
        invalidate: true
      })
    )
  );
}

// CHECK WHETHER RESIDENT CAN SUBMIT
function canSubmit(user, request) {

  if (!user || user.role !== 'resident') {
    return false;
  }

  // New or previously rejected residents
  const allowedStatus = [
    'not_submitted',
    'rejected'
  ];

  if (!allowedStatus.includes(user.verificationStatus)) {
    return false;
  }

  // First submission
  if (!request) {
    return true;
  }

  // Resubmission after administrator rejection
  return request.status === 'rejected';
}

// EXPORT VERIFICATION ROUTES
module.exports = function createVerificationRoutes(
  verifyFirebaseToken
) {

  const router = express.Router();

  const receiveImages = upload.fields([
    { name: 'frontImage', maxCount: 1 },
    { name: 'backImage', maxCount: 1 }
  ]);

  // POST /api/verification/submit
  router.post(
    '/submit',

    // Verify Firebase authentication token
    verifyFirebaseToken,

    // Receive uploaded images
    (req, res, next) => {

      receiveImages(req, res, error => {

        if (error) {
          return res.status(400).json({
            status: 'error',
            message:
              error.code === 'LIMIT_FILE_SIZE'
                ? 'Each image must be 3 MB or smaller.'
                : 'Invalid upload. Use two JPG or PNG images.'
          });
        }

        next();
      });
    },

    async (req, res) => {

      const frontFile = req.files?.frontImage?.[0];
      const backFile = req.files?.backImage?.[0];

      // Require both images
      if (!frontFile || !backFile) {
        return res.status(400).json({
          status: 'error',
          message: 'Both front and back images are required.'
        });
      }

      // Validate image signatures
      if (
        !isValidImage(frontFile) ||
        !isValidImage(backFile)
      ) {
        return res.status(400).json({
          status: 'error',
          message: 'Please select valid JPG or PNG images.'
        });
      }

      const uid = req.firebaseUser.uid;
      const db = getFirestore();

      const userRef = db.collection('users').doc(uid);

      const requestRef = db
        .collection('verificationRequests')
        .doc(uid);

      const uploadedImages = [];

      try {

        // Check Cloudinary configuration
        const requiredSettings = [
          'CLOUDINARY_CLOUD_NAME',
          'CLOUDINARY_API_KEY',
          'CLOUDINARY_API_SECRET',
          'CLOUDINARY_UPLOAD_PRESET'
        ];

        if (
          requiredSettings.some(name => !process.env[name])
        ) {
          throw new Error(
            'Cloudinary configuration is incomplete.'
          );
        }

        // CHECK RESIDENT BEFORE UPLOADING
        const [userSnap, requestSnap] = await Promise.all([
          userRef.get(),
          requestRef.get()
        ]);

        if (
          !userSnap.exists ||
          userSnap.data().role !== 'resident' ||
          userSnap.data().uid !== uid
        ) {
          return res.status(403).json({
            status: 'error',
            message: 'Only registered residents can submit.'
          });
        }

        if (!canSubmit(
          userSnap.data(),
          requestSnap.exists ? requestSnap.data() : null
        )) {
          return res.status(409).json({
            status: 'error',
            message:
              'Your account cannot submit a new request yet.'
          });
        }

        // UPLOAD FRONT IMAGE
        const front = await uploadImage(frontFile);
        uploadedImages.push(front);

        if (front.type !== 'authenticated') {
          throw new Error('Front image is not protected.');
        }

        // UPLOAD BACK IMAGE
        const back = await uploadImage(backFile);
        uploadedImages.push(back);

        if (back.type !== 'authenticated') {
          throw new Error('Back image is not protected.');
        }

        // SAVE VERIFICATION DATA ATOMICALLY
        await db.runTransaction(async transaction => {

          const currentUser = await transaction.get(userRef);
          const currentRequest = await transaction.get(requestRef);

          if (
            !currentUser.exists ||
            currentUser.data().uid !== uid ||
            !canSubmit(
              currentUser.data(),
              currentRequest.exists
                ? currentRequest.data()
                : null
            )
          ) {
            const error = new Error(
              'Submission status changed.'
            );

            error.code = 'NOT_ELIGIBLE';
            throw error;
          }

          // Update resident status
          transaction.update(userRef, {
            verificationStatus: 'pending'
          });

          // Save uploaded-image references
          // and reset the request to pending.
          //
          // set() without merge replaces an old rejected
          // request and removes its old review metadata.
          transaction.set(requestRef, {
            uid: uid,
            status: 'pending',
            submittedAt: FieldValue.serverTimestamp(),

            // Preserve the existing demo review workflow
            demoOnly: true,
            frontSampleSelected: true,
            backSampleSelected: true,

            // Protected Cloudinary image references
            frontImagePublicId: front.public_id,
            backImagePublicId: back.public_id,

            frontImageFormat: front.format,
            backImageFormat: back.format,

            imageDeliveryType: 'authenticated'
          });
        });

        // SUCCESS
        return res.status(201).json({
          status: 'success',
          message:
            'Verification images submitted for admin review.'
        });

      } catch (error) {

        console.error(
          'Verification upload failed:',
          error.message
        );

        // Remove newly uploaded images on failure
        if (uploadedImages.length > 0) {
          await cleanupImages(uploadedImages);
        }

        return res.status(
          error.code === 'NOT_ELIGIBLE' ? 409 : 500
        ).json({
          status: 'error',
          message:
            error.code === 'NOT_ELIGIBLE'
              ? 'This verification request can no longer be submitted.'
              : 'Unable to upload verification images.'
        });
      }
    }
  );

  return router;
};
