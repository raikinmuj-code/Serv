const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB connection
const MONGODB_URI = 'mongodb://mongo:MmFGAwrRIXPnPscZUhlXsMNZvHbGrPVs@yamanote.proxy.rlwy.net:55514';

mongoose.connect(MONGODB_URI, {
    dbName: 'duckads',
    retryWrites: true,
    w: 'majority'
}).then(async () => {
    console.log('✅ Connected to MongoDB');
    await cleanOldIndexes();
}).catch(err => {
    console.error('❌ MongoDB connection error:', err);
});

// Clean old indexes
async function cleanOldIndexes() {
    try {
        const db = mongoose.connection.db;
        const collections = await db.listCollections({ name: 'users' }).toArray();
        
        if (collections.length > 0) {
            const indexes = await db.collection('users').indexes();
            const oldIndex = indexes.find(idx => idx.key && idx.key.id);
            
            if (oldIndex) {
                console.log('🗑️ Removing old index on "id" field...');
                await db.collection('users').dropIndex('id_1');
                console.log('✅ Old index removed');
            }
        }
    } catch (error) {
        console.warn('⚠️ Error cleaning indexes:', error.message);
    }
}

// ============= SCHEMAS =============

const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    username: { type: String, default: null },
    firstName: { type: String, default: null },
    lastName: { type: String, default: null },
    avatar: { type: String, default: null },
    languageCode: { type: String, default: 'ru' },
    isPremium: { type: Boolean, default: false },
    referrerId: { type: String, default: null },
    
    balance: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    ads: { type: Number, default: 0 },
    
    blocks: {
        '1': { v: { type: Number, default: 0 }, l: { type: Number, default: 0 } },
        '2': { v: { type: Number, default: 0 }, l: { type: Number, default: 0 } },
        '3': { v: { type: Number, default: 0 }, l: { type: Number, default: 0 } }
    },
    
    boosts: {
        doubleIncome: { type: Boolean, default: false },
        doubleIncomeUntil: { type: Number, default: 0 },
        autoClicker: { type: Boolean, default: false },
        autoClickerUntil: { type: Number, default: 0 }
    },
    
    tasks: {
        subscribe: { type: Boolean, default: false },
        share: { type: Boolean, default: false }
    },
    
    referrals: [{ type: String }],
    
    createdAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now }
});

const withdrawalSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'completed', 'cancelled'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    processedAt: { type: Date }
});

const taskCompletionSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    taskId: { type: String, required: true },
    completedAt: { type: Date, default: Date.now }
});

taskCompletionSchema.index({ userId: 1, taskId: 1 }, { unique: true });

const User = mongoose.model('User', userSchema);
const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);
const TaskCompletion = mongoose.model('TaskCompletion', taskCompletionSchema);

// ============= HELPER FUNCTIONS =============

async function updateReferralReward(referrerId, newUserId) {
    if (!referrerId) return;
    
    try {
        const referrer = await User.findOne({ userId: referrerId });
        if (referrer && !referrer.referrals.includes(newUserId)) {
            referrer.referrals.push(newUserId);
            referrer.balance += 0.01;
            await referrer.save();
            console.log(`💰 Referral reward: ${referrerId} +0.01 from ${newUserId}`);
        }
    } catch (error) {
        console.error('Error updating referral reward:', error);
    }
}

// ============= API ROUTES =============

// Create or get user
app.post('/api/user', async (req, res) => {
    try {
        const { userId, username, firstName, lastName, avatar, languageCode, isPremium, referrerId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ success: false, error: 'userId is required' });
        }
        
        let user = await User.findOne({ userId });
        
        if (!user) {
            user = new User({
                userId,
                username: username || `user_${userId.slice(-6)}`,
                firstName: firstName || null,
                lastName: lastName || null,
                avatar: avatar || null,
                languageCode: languageCode || 'ru',
                isPremium: isPremium || false,
                referrerId: referrerId || null,
                balance: 0,
                level: 1,
                ads: 0
            });
            
            await user.save();
            console.log(`🆕 New user created: ${userId}`);
            
            if (referrerId && referrerId !== userId) {
                await updateReferralReward(referrerId, userId);
            }
        } else {
            user.lastActive = new Date();
            await user.save();
            console.log(`👤 User logged in: ${userId}, balance: ${user.balance}, level: ${user.level}`);
        }
        
        res.json({
            success: true,
            user: {
                id: user._id,
                userId: user.userId,
                username: user.username,
                balance: user.balance,
                level: user.level,
                ads: user.ads,
                avatar: user.avatar
            },
            blocks: user.blocks,
            boosts: user.boosts,
            referrerCount: user.referrals ? user.referrals.length : 0
        });
        
    } catch (error) {
        console.error('Error in /api/user:', error);
        
        if (error.code === 11000) {
            return res.status(409).json({ 
                success: false, 
                error: 'User already exists' 
            });
        }
        
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get user data
app.get('/api/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const user = await User.findOne({ userId });
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        res.json({
            success: true,
            user: {
                userId: user.userId,
                username: user.username,
                balance: user.balance,
                level: user.level,
                ads: user.ads,
                avatar: user.avatar
            },
            blocks: user.blocks,
            boosts: user.boosts
        });
        
    } catch (error) {
        console.error('Error in /api/user/:userId:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Save game data
app.post('/api/save', async (req, res) => {
    try {
        const { userId, user: userData, blocks, boosts } = req.body;
        
        if (!userId) {
            return res.status(400).json({ success: false, error: 'userId is required' });
        }
        
        const user = await User.findOne({ userId });
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        if (userData) {
            if (typeof userData.balance !== 'undefined') user.balance = userData.balance;
            if (typeof userData.level !== 'undefined') user.level = userData.level;
            if (typeof userData.ads !== 'undefined') user.ads = userData.ads;
        }
        
        if (blocks) {
            for (const [blockId, blockData] of Object.entries(blocks)) {
                if (user.blocks[blockId]) {
                    if (typeof blockData.v !== 'undefined') user.blocks[blockId].v = blockData.v;
                    if (typeof blockData.l !== 'undefined') user.blocks[blockId].l = blockData.l;
                }
            }
        }
        
        if (boosts) {
            user.boosts = { ...user.boosts, ...boosts };
        }
        
        await user.save();
        
        console.log(`💾 Data saved: ${userId} - balance: ${user.balance}, level: ${user.level}`);
        
        res.json({ success: true, message: 'Data saved successfully' });
        
    } catch (error) {
        console.error('Error in /api/save:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Complete task
app.post('/api/task', async (req, res) => {
    try {
        const { userId, taskId } = req.body;
        
        if (!userId || !taskId) {
            return res.status(400).json({ success: false, error: 'userId and taskId are required' });
        }
        
        const existingCompletion = await TaskCompletion.findOne({ userId, taskId });
        if (existingCompletion) {
            return res.json({ 
                success: false, 
                message: 'Task already completed',
                completed: true 
            });
        }
        
        await TaskCompletion.create({ userId, taskId });
        
        const user = await User.findOne({ userId });
        if (user && user.tasks) {
            user.tasks[taskId] = true;
            await user.save();
        }
        
        res.json({ success: true, message: 'Task completed successfully' });
        
    } catch (error) {
        console.error('Error in /api/task:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Withdraw funds
app.post('/api/withdraw', async (req, res) => {
    try {
        const { userId, amount } = req.body;
        
        if (!userId) {
            return res.status(400).json({ success: false, error: 'userId is required' });
        }
        
        if (amount < 0.01) {
            return res.status(400).json({ success: false, error: 'Minimum withdrawal amount is $0.01' });
        }
        
        const user = await User.findOne({ userId });
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        if (user.balance < amount) {
            return res.status(400).json({ success: false, error: 'Insufficient balance' });
        }
        
        const withdrawal = await Withdrawal.create({
            userId,
            amount,
            status: 'pending'
        });
        
        user.balance -= amount;
        await user.save();
        
        console.log(`💰 Withdrawal request: ${userId} - $${amount}`);
        
        res.json({ 
            success: true, 
            message: 'Withdrawal request submitted successfully',
            withdrawalId: withdrawal._id
        });
        
    } catch (error) {
        console.error('Error in /api/withdraw:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get leaderboard
app.get('/api/leaderboard', async (req, res) => {
    try {
        const users = await User.find({})
            .sort({ balance: -1 })
            .limit(50)
            .select('userId username balance level avatar');
        
        const leaderboard = users.map(user => ({
            userId: user.userId,
            username: user.username || user.userId.slice(0, 8),
            balance: user.balance,
            level: user.level,
            avatar: user.avatar
        }));
        
        res.json(leaderboard);
        
    } catch (error) {
        console.error('Error in /api/leaderboard:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get user referrals
app.get('/api/referrals/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const user = await User.findOne({ userId });
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        const referrals = await User.find({ userId: { $in: user.referrals } })
            .select('userId username level balance');
        
        res.json({
            success: true,
            count: user.referrals.length,
            referrals: referrals.map(ref => ({
                username: ref.username || ref.userId.slice(0, 8),
                level: ref.level,
                balance: ref.balance
            }))
        });
        
    } catch (error) {
        console.error('Error in /api/referrals/:userId:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: Get withdrawal requests
app.get('/api/admin/withdrawals', async (req, res) => {
    try {
        const withdrawals = await Withdrawal.find({ status: 'pending' })
            .sort({ createdAt: -1 });
        
        res.json(withdrawals);
        
    } catch (error) {
        console.error('Error in /api/admin/withdrawals:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: Process withdrawal
app.post('/api/admin/withdrawals/:id/process', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const withdrawal = await Withdrawal.findById(id);
        if (!withdrawal) {
            return res.status(404).json({ success: false, error: 'Withdrawal not found' });
        }
        
        withdrawal.status = status;
        withdrawal.processedAt = new Date();
        await withdrawal.save();
        
        if (status === 'cancelled') {
            const user = await User.findOne({ userId: withdrawal.userId });
            if (user) {
                user.balance += withdrawal.amount;
                await user.save();
            }
        }
        
        res.json({ success: true, message: `Withdrawal ${status}` });
        
    } catch (error) {
        console.error('Error in /api/admin/withdrawals/:id/process:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Debug endpoint - check user data
app.get('/api/debug/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findOne({ userId });
        
        if (!user) {
            return res.json({ exists: false });
        }
        
        res.json({
            exists: true,
            userId: user.userId,
            balance: user.balance,
            level: user.level,
            ads: user.ads,
            blocks: user.blocks,
            boosts: user.boosts,
            createdAt: user.createdAt,
            lastActive: user.lastActive
        });
    } catch (error) {
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

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'Duck Ads API',
        version: '1.0.0',
        endpoints: [
            'POST /api/user',
            'GET /api/user/:userId',
            'POST /api/save',
            'POST /api/task',
            'POST /api/withdraw',
            'GET /api/leaderboard',
            'GET /api/referrals/:userId',
            'GET /api/admin/withdrawals',
            'POST /api/admin/withdrawals/:id/process',
            'GET /api/debug/user/:userId',
            'GET /api/health'
        ]
    });
});

// ============= START SERVER =============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 API available at http://localhost:${PORT}/api`);
});