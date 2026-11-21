
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

// Use the hosting provider's port when provided.
const PORT = Number(process.env.PORT || 3000);

// Keep localhost-only binding during local
// development unless HOST is explicitly set.
//
// In production, listen on all interfaces
// so the hosting platform can reach the server.

const HOST =
  process.env.HOST ||
  (
    process.env.NODE_ENV === 'production'
      ? '0.0.0.0'
      : '127.0.0.1'
  );

// =========================================
// CONFIGURABLE CORS ORIGINS
// =========================================

// Local Angular addresses are allowed by default.
//
// When deploying, configure ALLOWED_ORIGINS
// with the exact HTTPS frontend origin.
//
// Multiple origins can be separated by commas.

const defaultOrigins =
  'http://localhost:4200,http://127.0.0.1:4200';

const allowedOrigins = new Set(
  (
    process.env.ALLOWED_ORIGINS ||
    defaultOrigins
  )
    .split(',')
    .map(origin => origin.trim().replace(/\/$/, ''))
    .filter(origin => origin.length > 0)
);

// =========================================
// CORS MIDDLEWARE
// =========================================

app.use(
  cors({
    origin: (origin, callback) => {

      // Permit requests without an Origin header,
      // such as requests from server-side tools.
      //
      // Authentication checks still apply
      // to protected endpoints.

      if (!origin) {
        callback(null, true);
        return;
      }

      // Permit only configured browser origins.
      if (allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      // Do not grant cross-origin browser access
      // to unconfigured frontend origins.

      callback(null, false);
    }
  })
);

// =========================================
// REQUEST BODY CONFIGURATION
// =========================================

app.use(
  express.json({
    limit: '100kb'
  })
);

// =========================================
// FIREBASE ADMIN SDK CONFIGURATION
// =========================================

// Keep the original Firebase project ID as
// the default for local development.

const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  'bahasumbong';

// Local development can use the existing
// GOOGLE_APPLICATION_CREDENTIALS file.
//
// Supported cloud hosting environments may
// provide application-default credentials
// automatically without a local JSON file.

const keyPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS;

// If a credentials path is explicitly configured,
// verify that the specified file exists.

if (keyPath && !fs.existsSync(keyPath)) {

  console.error(
    'Configured Firebase service account file not found.'
  );

  process.exit(1);
}

// Initialize Firebase Admin SDK.
//
// applicationDefault() uses the configured
// local credentials or the hosting environment's
// supported default credentials.

initializeApp({
  credential: applicationDefault(),
  projectId: FIREBASE_PROJECT_ID
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

    const decodedToken =
      await getAuth().verifyIdToken(
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

      if (
        role !== 'resident' &&
        role !== 'admin'
      ) {

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
// EXISTING PROTECTED REPORT PHOTO VIEWER
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

    // Confirm that Firebase Admin SDK
    // can communicate with Firebase Auth.

    await getAuth().listUsers(1);

    console.log(
      'Firebase Admin SDK connected successfully!'
    );

    // Use the configured host and port.
    //
    // Local default:
    // 127.0.0.1:3000
    //
    // Production default:
    // 0.0.0.0:<PORT>

    app.listen(PORT, HOST, () => {

      console.log(
        `BahaSumbong backend running on ${HOST}:${PORT}`
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
