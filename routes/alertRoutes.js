const express = require('express');
const router = express.Router();
const UserAlert = require('../models/UserAlert');

// Register for alerts
router.post('/register', async (req, res) => {
  try {
    const { userId, fcmToken, goldAlerts, currencyAlerts } = req.body;
    
    // Check if user already exists
    let userAlert = await UserAlert.findOne({ userId });
    
    if (userAlert) {
      // Update existing alert
      userAlert.fcmToken = fcmToken;
      userAlert.goldAlerts = goldAlerts || userAlert.goldAlerts;
      userAlert.currencyAlerts = currencyAlerts || userAlert.currencyAlerts;
      await userAlert.save();
    } else {
      // Create new alert
      userAlert = new UserAlert({
        userId,
        fcmToken,
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
    const { enabled, minInterval } = req.body;
    
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

module.exports = router;