// Создайте временный скрипт для очистки
// cleanup.js - запустите один раз

const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://mongo:MmFGAwrRIXPnPscZUhlXsMNZvHbGrPVs@yamanote.proxy.rlwy.net:55514';

async function cleanup() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');
        
        const db = mongoose.connection.db;
        
        // Удаляем старую коллекцию users
        await db.collection('users').drop();
        console.log('✅ Collection "users" dropped');
        
        console.log('✅ Cleanup completed! Restart your server now.');
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

cleanup();
