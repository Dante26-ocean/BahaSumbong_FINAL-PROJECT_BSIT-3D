
const express = require('express');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

const {
  initializeApp,
  applicationDefault
} = require('firebase-admin/app');

const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

// =========================================
// EXPRESS CONFIGURATION
// =========================================

const app = express();
const PORT = process.env.PORT || 3000;

// Allow requests from Angular.
app.use(cors({
  origin: 'http://localhost:4200'
}));

app.use(express.json({ limit: '100kb' }));

// =========================================
// FIREBASE ADMIN SDK CONFIGURATION
// =========================================

// Firebase service account location.
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!keyPath || !fs.existsSync(keyPath)) {
  console.error('Firebase service account file not found.');
  process.exit(1);
}

// Initialize Firebase Admin SDK.
initializeApp({
  credential: applicationDefault(),
  projectId: 'bahasumbong'
});

// =========================================
// VERIFY FIREBASE LOGIN TOKEN
// =========================================

async function verifyFirebaseToken(req, res, next) {

  const authorization =
    req.headers.authorization || '';

  if (!authorization.startsWith('Bearer ')) {

    return res.status(401).json({
      status: 'error',
      message: 'Firebase login token is required.'
    });

  }

  const token = authorization.slice(7).trim();

  if (!token) {

    return res.status(401).json({
      status: 'error',
      message: 'Firebase login token is required.'
    });

  }

  try {

    const decodedToken = await getAuth().verifyIdToken(
      token,
      true
    );

    req.firebaseUser = decodedToken;

    next();

  } catch (error) {

    console.error(
      'Firebase token verification failed:',
      error.message
    );

    return res.status(401).json({
      status: 'error',
      message: 'Invalid or expired Firebase login token.'
    });

  }

}

// =========================================
// BACKEND HEALTH CHECK
// =========================================

app.get('/api/health', (req, res) => {

  res.json({
    status: 'success',
    message: 'BahaSumbong backend is running!'
  });

});

// =========================================
// CHECK USER AUTHENTICATION AND ROLE
// =========================================

app.get(
  '/api/auth/check',

  verifyFirebaseToken,

  async (req, res) => {

    try {

      const uid = req.firebaseUser.uid;

      const userDoc = await getFirestore()
        .collection('users')
        .doc(uid)
        .get();

      if (!userDoc.exists) {

        return res.status(403).json({
          status: 'error',
          message: 'User account was not found.'
        });

      }

      const userData = userDoc.data();

      if (userData.uid !== uid) {

        return res.status(403).json({
          status: 'error',
          message: 'User account information is invalid.'
        });

      }

      const role = userData.role;

      if (role !== 'resident' && role !== 'admin') {

        return res.status(403).json({
          status: 'error',
          message: 'User role is not authorized.'
        });

      }

      return res.json({
        status: 'success',
        message: 'Firebase login verified successfully!',
        uid: uid,
        role: role
      });

    } catch (error) {

      console.error(
        'Authorization check failed:',
        error.message
      );

      return res.status(500).json({
        status: 'error',
        message: 'Unable to verify user authorization.'
      });

    }

  }
);

// =========================================
// EXISTING CLOUDINARY VERIFICATION UPLOAD
// =========================================

const verificationUploadRoutes =
  require('./verification-upload');

app.use(
  '/api/verification',
  verificationUploadRoutes(verifyFirebaseToken)
);

// =========================================
// EXISTING PROTECTED VERIFICATION IMAGE VIEWER
// =========================================

const verificationImageRoutes =
  require('./verification-image-view');

app.use(
  '/api/verification',
  verificationImageRoutes(verifyFirebaseToken)
);

// =========================================
// EXISTING PROTECTED REPORT PHOTO UPLOAD
// =========================================

// Upload supporting community report photos.

const reportPhotoUploadRoutes =
  require('./report-photo-upload');

// POST /api/reports/:reportId/photos

app.use(
  '/api/reports',
  reportPhotoUploadRoutes(verifyFirebaseToken)
);

// =========================================
// NEW: PROTECTED REPORT PHOTO VIEWER
// =========================================

// Allow authorized residents and administrators
// to view protected community report photos.
//
// GET /api/reports/:reportId/photos/:photoIndex

const reportPhotoViewRoutes =
  require('./report-photo-view');

app.use(
  '/api/reports',
  reportPhotoViewRoutes(verifyFirebaseToken)
);

// =========================================
// VERIFY FIREBASE CONNECTION AND START SERVER
// =========================================

async function startServer() {

  try {

    await getAuth().listUsers(1);

    console.log(
      'Firebase Admin SDK connected successfully!'
    );

    app.listen(PORT, '127.0.0.1', () => {

      console.log(
        `BahaSumbong backend running on port ${PORT}`
      );

    });

  } catch (error) {

    console.error(
      'Firebase connection failed:',
      error.message
    );

    process.exitCode = 1;

  }

}

startServer();
