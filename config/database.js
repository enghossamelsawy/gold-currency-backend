const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.error('❌ MONGODB_URI is not defined in environment variables!');
      process.exit(1);
    }

    // Log a masked version of the URI for debugging
    const maskedUri = uri.replace(/\/\/.*:.*@/, '//****:****@');
    console.log(`📡 Attempting to connect to MongoDB: ${maskedUri}`);

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000, // Fail fast if DNS/Network is down
    });
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error logic:');
    console.error(`   Code: ${error.code}`);
    console.error(`   Message: ${error.message}`);
    if (error.code === 'ENOTFOUND') {
      console.error('   💡 TIP: This is a DNS error. Your server cannot find the MongoDB host.');
      console.error('   💡 FIX: Try using the "Standard Connection String" (mongodb:// instead of mongodb+srv://) from your Atlas dashboard.');
    }
    process.exit(1);
  }
};

module.exports = connectDB;