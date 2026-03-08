const cron = require('node-cron');
const dataCollector = require('./dataCollector');
const notificationService = require('./notificationService');

class CronManager {
  constructor() {
    this.jobs = [];
  }

  start() {
    console.log('⏰ Starting cron jobs...');

    // Collect data 3 times a day (10:00, 16:00, 22:00 UTC)
    const dataJob = cron.schedule('0 10,16,22 * * *', async () => {
      console.log('🔄 Running scheduled gold price notification (3x daily)...');
      await dataCollector.collectAndNotifyGoldOnly();
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
