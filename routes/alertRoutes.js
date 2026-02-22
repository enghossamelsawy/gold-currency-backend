const express = require('express');
const router = express.Router();
const UserAlert = require('../models/UserAlert');
const notificationService = require('../services/notificationService');

// Register for alerts
router.post('/register', async (req, res) => {
  try {
    const { userId, fcmToken, goldAlerts, currencyAlerts, language } = req.body;

    // Check if user already exists
    let userAlert = await UserAlert.findOne({ userId });

    if (userAlert) {
      // Update existing alert
      userAlert.fcmToken = fcmToken;
      if (language) userAlert.language = language;
      userAlert.goldAlerts = goldAlerts || userAlert.goldAlerts;
      userAlert.currencyAlerts = currencyAlerts || userAlert.currencyAlerts;
      await userAlert.save();
    } else {
      // Create new alert
      userAlert = new UserAlert({
        userId,
        fcmToken,
        language: language || 'en',
        goldAlerts: goldAlerts || [],
        currencyAlerts: currencyAlerts || []
      });
      await userAlert.save();
    }

    res.json({
      success: true,
      message: 'Alert registered successfully',
      data: userAlert
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update alert settings
router.put('/settings/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { enabled, minInterval, language } = req.body;

    const userAlert = await UserAlert.findOne({ userId });

    if (!userAlert) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (enabled !== undefined) {
      userAlert.notificationSettings.enabled = enabled;
    }

    if (minInterval !== undefined) {
      userAlert.notificationSettings.minInterval = minInterval;
    }

    if (language !== undefined) {
      userAlert.language = language;
    }

    await userAlert.save();

    res.json({
      success: true,
      message: 'Settings updated',
      data: userAlert
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get user alerts
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const userAlert = await UserAlert.findOne({ userId });

    if (!userAlert) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: userAlert
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Trigger a test notification for a registered user
router.post('/test', async (req, res) => {
  try {
    const { userId, title, body, data } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    if (!notificationService.isFirebaseReady()) {
      return res.status(503).json({
        success: false,
        error: 'Firebase not initialized'
      });
    }

    const userAlert = await UserAlert.findOne({ userId });

    if (!userAlert || !userAlert.fcmToken) {
      return res.status(404).json({
        success: false,
        error: 'User not found or has no FCM token'
      });
    }

    const response = await notificationService.sendNotification(
      userAlert.fcmToken,
      title || 'Test Notification',
      body || 'If you received this, your notifications are working.',
      typeof data === 'object' && data !== null ? data : {}
    );

    return res.json({
      success: true,
      message: 'Notification dispatched',
      data: response
    });
  } catch (error) {
    console.error('❌ Error sending test notification:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Send a notification and return the notification ID
router.post('/notify', async (req, res) => {
  try {
    const { userId, fcmToken, title, body, data } = req.body;

    if (!userId && !fcmToken) {
      return res.status(400).json({
        success: false,
        error: 'Either userId or fcmToken is required'
      });
    }

    if (!notificationService.isFirebaseReady()) {
      return res.status(503).json({
        success: false,
        error: 'Firebase not initialized'
      });
    }

    let targetToken = fcmToken;
    let alertDoc = null;

    if (!targetToken && userId) {
      alertDoc = await UserAlert.findOne({ userId });

      if (!alertDoc || !alertDoc.fcmToken) {
        return res.status(404).json({
          success: false,
          error: 'User not found or has no FCM token'
        });
      }

      targetToken = alertDoc.fcmToken;
    }

    const notificationId = await notificationService.sendNotification(
      targetToken,
      title || 'Notification',
      body || 'You have a new notification.',
      typeof data === 'object' && data !== null ? data : {}
    );

    return res.json({
      success: true,
      message: 'Notification sent successfully',
      notificationId
    });
  } catch (error) {
    console.error('❌ Error sending notification:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
