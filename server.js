const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const MONGODB_URI = 'mongodb://mongo:MmFGAwrRIXPnPscZUhlXsMNZvHbGrPVs@yamanote.proxy.rlwy.net:55514';

mongoose.connect(MONGODB_URI, {
    dbName: 'duckads'
}).then(() => {
    console.log('✅ Connected to MongoDB');
}).catch(err => {
    console.error('❌ MongoDB connection error:', err);
});

// ============= SCHEMAS =============

const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    username: { type: String, default: null },
    firstName: { type: String, default: null },
    lastName: { type: String, default: null },
    avatar: { type: String, default: null },
    referrerId: { type: String, default: null },
    
    // Game data
    balance: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    ads: { type: Number, default: 0 },
    
    // Ad blocks
    block1views: { type: Number, default: 0 },
    block1lock: { type: Number, default: 0 },
    block2views: { type: Number, default: 0 },
    block2lock: { type: Number, default: 0 },
    block3views: { type: Number, default: 0 },
    block3lock: { type: Number, default: 0 },
    
    // Boosts
    doubleIncome: { type: Boolean, default: false },
    doubleIncomeUntil: { type: Number, default: 0 },
    autoClicker: { type: Boolean, default: false },
    autoClickerUntil: { type: Number, default: 0 },
    
    // Referrals
    referrals: [{ type: String }],
    
    createdAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// ============= API ROUTES =============

// Create or get user
app.post('/api/user', async (req, res) => {
    try {
        const { userId, username, firstName, lastName, avatar, referrerId } = req.body;
        
        console.log('📝 /api/user called with:', { userId, username, referrerId });
        
        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }
        
        let user = await User.findOne({ userId });
        
        if (!user) {
            // Create new user
            user = new User({
                userId,
                username: username || `user_${userId.slice(-6)}`,
                firstName: firstName || null,
                lastName: lastName || null,
                avatar: avatar || null,
                referrerId: referrerId || null,
                balance: 0,
                level: 1,
                ads: 0
            });
            
            await user.save();
            console.log(`🆕 NEW USER: ${userId}`);
            
            // Give referral reward to referrer
            if (referrerId && referrerId !== userId) {
                const referrer = await User.findOne({ userId: referrerId });
                if (referrer && !referrer.referrals.includes(userId)) {
                    referrer.referrals.push(userId);
                    referrer.balance += 0.01;
                    await referrer.save();
                    console.log(`💰 Referral reward: ${referrerId} +0.01`);
                }
            }
        } else {
            user.lastActive = new Date();
            await user.save();
            console.log(`👤 EXISTING USER: ${userId}, balance: ${user.balance}, level: ${user.level}, ads: ${user.ads}`);
        }
        
        // Return full user data
        res.json({
            userId: user.userId,
            username: user.username,
            balance: user.balance,
            level: user.level,
            ads: user.ads,
            avatar: user.avatar,
            blocks: {
                '1': { v: user.block1views, l: user.block1lock },
                '2': { v: user.block2views, l: user.block2lock },
                '3': { v: user.block3views, l: user.block3lock }
            },
            boosts: {
                doubleIncome: user.doubleIncome,
                doubleIncomeUntil: user.doubleIncomeUntil,
                autoClicker: user.autoClicker,
                autoClickerUntil: user.autoClickerUntil
            }
        });
        
    } catch (error) {
        console.error('Error in /api/user:', error);
        res.status(500).json({ error: error.message });
    }
});

// Save game data
app.post('/api/save', async (req, res) => {
    try {
        const { userId, balance, level, ads, blocks, boosts } = req.body;
        
        console.log('💾 /api/save called for:', userId);
        console.log('   Data:', { balance, level, ads });
        
        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }
        
        const user = await User.findOne({ userId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Update user data
        if (typeof balance !== 'undefined') user.balance = balance;
        if (typeof level !== 'undefined') user.level = level;
        if (typeof ads !== 'undefined') user.ads = ads;
        
        // Update blocks
        if (blocks) {
            if (blocks['1']) {
                user.block1views = blocks['1'].v;
                user.block1lock = blocks['1'].l;
            }
            if (blocks['2']) {
                user.block2views = blocks['2'].v;
                user.block2lock = blocks['2'].l;
            }
            if (blocks['3']) {
                user.block3views = blocks['3'].v;
                user.block3lock = blocks['3'].l;
            }
        }
        
        // Update boosts
        if (boosts) {
            if (typeof boosts.doubleIncome !== 'undefined') user.doubleIncome = boosts.doubleIncome;
            if (typeof boosts.doubleIncomeUntil !== 'undefined') user.doubleIncomeUntil = boosts.doubleIncomeUntil;
            if (typeof boosts.autoClicker !== 'undefined') user.autoClicker = boosts.autoClicker;
            if (typeof boosts.autoClickerUntil !== 'undefined') user.autoClickerUntil = boosts.autoClickerUntil;
        }
        
        await user.save();
        
        console.log(`✅ SAVED: ${userId} - balance: ${user.balance}, level: ${user.level}, ads: ${user.ads}`);
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Error in /api/save:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get user data
app.get('/api/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        console.log('📥 /api/user/:userId GET for:', userId);
        
        const user = await User.findOne({ userId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({
            userId: user.userId,
            username: user.username,
            balance: user.balance,
            level: user.level,
            ads: user.ads,
            avatar: user.avatar,
            blocks: {
                '1': { v: user.block1views, l: user.block1lock },
                '2': { v: user.block2views, l: user.block2lock },
                '3': { v: user.block3views, l: user.block3lock }
            },
            boosts: {
                doubleIncome: user.doubleIncome,
                doubleIncomeUntil: user.doubleIncomeUntil,
                autoClicker: user.autoClicker,
                autoClickerUntil: user.autoClickerUntil
            }
        });
        
    } catch (error) {
        console.error('Error in /api/user/:userId GET:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get leaderboard
app.get('/api/leaderboard', async (req, res) => {
    try {
        const users = await User.find({})
            .sort({ balance: -1 })
            .limit(50)
            .select('userId username balance level avatar');
        
        res.json(users);
        
    } catch (error) {
        console.error('Error in /api/leaderboard:', error);
        res.status(500).json({ error: error.message });
    }
});

// Complete task
app.post('/api/task', async (req, res) => {
    try {
        const { userId, taskId } = req.body;
        
        console.log('📋 Task completed:', userId, taskId);
        
        // For now, just return success
        // You can add task completion tracking later
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Error in /api/task:', error);
        res.status(500).json({ error: error.message });
    }
});

// Withdraw funds
app.post('/api/withdraw', async (req, res) => {
    try {
        const { userId, amount } = req.body;
        
        console.log('💰 Withdraw request:', userId, amount);
        
        const user = await User.findOne({ userId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (user.balance < amount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }
        
        user.balance -= amount;
        await user.save();
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Error in /api/withdraw:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// Root
app.get('/', (req, res) => {
    res.json({ message: 'Duck Ads API Server', version: '2.0' });
});

// ============= START SERVER =============
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});