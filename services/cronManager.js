const cron = require('node-cron');
const dataCollector = require('./dataCollector');
const notificationService = require('./notificationService');

class CronManager {
  constructor() {
    this.jobs = [];
  }
  
  start() {
    console.log('⏰ Starting cron jobs...');
    
    // Collect data every 15 minutes
    const dataJob = cron.schedule('*/15 * * * *', async () => {
      console.log('🔄 Running scheduled data collection...');
      await dataCollector.collectAllData();
      await notificationService.checkAndSendAlerts();
    });

    // Daily cleanup at midnight
    const cleanupJob = cron.schedule('0 0 * * *', async () => {
      console.log('🧹 Running daily cleanup...');
      await dataCollector.cleanOldRecords('gold');
      await dataCollector.cleanOldRecords('currency');
    });

    // Daily digest at 9:00 AM UTC
    const dailyDigestJob = cron.schedule('0 9 * * *', async () => {
      console.log('📢 Sending daily digest notifications...');
      await notificationService.sendDailyDigest();
    });

    this.jobs.push(dataJob, cleanupJob, dailyDigestJob);

    // Run initial data collection
    dataCollector.collectAllData();

    console.log('✅ Cron jobs started successfully');
  }
  
  stop() {
    console.log('⏹️ Stopping cron jobs...');
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
  }
}

module.exports = new CronManager();
