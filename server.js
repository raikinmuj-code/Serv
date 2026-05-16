const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());
app.use(express.static('.'));

// MongoDB connection
const MONGODB_URI = 'mongodb://mongo:MmFGAwrRIXPnPscZUhlXsMNZvHbGrPVs@yamanote.proxy.rlwy.net:55514';
const DB_NAME = 'duckads';

let db;
let usersCollection;
let adsCollection;
let transactionsCollection;

// Подключение к MongoDB
async function connectDB() {
    try {
        const client = new MongoClient(MONGODB_URI, {
            maxPoolSize: 10,
            connectTimeoutMS: 10000,
            socketTimeoutMS: 45000
        });
        
        await client.connect();
        console.log('✅ Подключено к MongoDB');
        
        db = client.db(DB_NAME);
        usersCollection = db.collection('users');
        adsCollection = db.collection('ads_blocks');
        transactionsCollection = db.collection('transactions');
        
        // Создаем индексы
        await usersCollection.createIndex({ id: 1 }, { unique: true });
        await usersCollection.createIndex({ token: 1 });
        await usersCollection.createIndex({ balance: -1 });
        
        return true;
    } catch (error) {
        console.error('❌ Ошибка подключения к MongoDB:', error.message);
        return false;
    }
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Middleware для проверки токена
async function authMiddleware(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    
    try {
        const user = await usersCollection.findOne({ token: token });
        if (!user) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
}

// ==================== API РОУТЫ ====================

// Регистрация/авторизация через Telegram
app.post('/api/auth', async (req, res) => {
    const { telegramId, name, avatar, referrerId } = req.body;
    
    if (!telegramId) {
        return res.status(400).json({ error: 'telegramId required' });
    }
    
    try {
        let user = await usersCollection.findOne({ id: telegramId });
        
        if (!user) {
            const newUser = {
                id: telegramId,
                name: name || 'User',
                avatar: avatar || '',
                balance: 0,
                level: 1,
                xp: 0,
                boostDouble: false,
                boostDoubleEnd: 0,
                completedTasks: [],
                referrals: [],
                referrerId: referrerId || null,
                token: generateToken(),
                createdAt: new Date(),
                lastSeen: new Date(),
                totalWatched: 0,
                adsBlocks: [
                    { id: 0, watched: 0, maxWatches: 15, rewardPerView: 0.0009 },
                    { id: 1, watched: 0, maxWatches: 15, rewardPerView: 0.0009 },
                    { id: 2, watched: 0, maxWatches: 15, rewardPerView: 0.0009 }
                ],
                autoMode: true
            };
            
            await usersCollection.insertOne(newUser);
            user = newUser;
            
            // Награда за реферала
            if (referrerId) {
                try {
                    await usersCollection.updateOne(
                        { id: referrerId },
                        { 
                            $inc: { balance: 0.50 },
                            $push: { referrals: telegramId }
                        }
                    );
                } catch (refError) {
                    console.error('Referral error:', refError);
                }
            }
        } else {
            await usersCollection.updateOne(
                { id: telegramId },
                { 
                    $set: { 
                        name: name || user.name,
                        avatar: avatar || user.avatar,
                        lastSeen: new Date(),
                        token: generateToken()
                    }
                }
            );
            user = await usersCollection.findOne({ id: telegramId });
        }
        
        res.json({
            success: true,
            token: user.token,
            user: {
                id: user.id,
                name: user.name,
                avatar: user.avatar,
                balance: user.balance,
                level: user.level,
                xp: user.xp,
                boostDouble: user.boostDouble,
                boostDoubleEnd: user.boostDoubleEnd,
                completedTasks: user.completedTasks || [],
                referrerId: user.referrerId,
                adsBlocks: user.adsBlocks,
                autoMode: user.autoMode
            }
        });
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Получение данных пользователя
app.get('/api/user', authMiddleware, async (req, res) => {
    try {
        res.json({
            id: req.user.id,
            name: req.user.name,
            avatar: req.user.avatar,
            balance: req.user.balance,
            level: req.user.level,
            xp: req.user.xp,
            boostDouble: req.user.boostDouble,
            boostDoubleEnd: req.user.boostDoubleEnd,
            completedTasks: req.user.completedTasks || [],
            referrerId: req.user.referrerId,
            totalWatched: req.user.totalWatched || 0,
            adsBlocks: req.user.adsBlocks,
            autoMode: req.user.autoMode
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Сохранение прогресса (только на сервер)
app.post('/api/save', authMiddleware, async (req, res) => {
    const { balance, level, xp, boostDouble, boostDoubleEnd, completedTasks, adsBlocks, autoMode } = req.body;
    
    try {
        const updateData = {};
        if (balance !== undefined) updateData.balance = balance;
        if (level !== undefined) updateData.level = level;
        if (xp !== undefined) updateData.xp = xp;
        if (boostDouble !== undefined) updateData.boostDouble = boostDouble;
        if (boostDoubleEnd !== undefined) updateData.boostDoubleEnd = boostDoubleEnd;
        if (completedTasks !== undefined) updateData.completedTasks = completedTasks;
        if (adsBlocks !== undefined) updateData.adsBlocks = adsBlocks;
        if (autoMode !== undefined) updateData.autoMode = autoMode;
        updateData.lastSeen = new Date();
        
        await usersCollection.updateOne(
            { id: req.user.id },
            { $set: updateData }
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Save error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Добавление реферала
app.post('/api/addReferral', authMiddleware, async (req, res) => {
    const { referrerId } = req.body;
    
    try {
        if (referrerId && referrerId !== req.user.id && !req.user.referrerId) {
            await usersCollection.updateOne(
                { id: req.user.id },
                { $set: { referrerId: referrerId } }
            );
            
            await usersCollection.updateOne(
                { id: referrerId },
                { 
                    $inc: { balance: 0.50 },
                    $push: { referrals: req.user.id }
                }
            );
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Получение топа игроков
app.get('/api/leaderboard', async (req, res) => {
    try {
        const leaders = await usersCollection
            .find({})
            .sort({ balance: -1 })
            .limit(50)
            .project({ name: 1, balance: 1, level: 1, avatar: 1 })
            .toArray();
        
        res.json(leaders);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Получение статистики
app.get('/api/stats', async (req, res) => {
    try {
        const totalUsers = await usersCollection.countDocuments();
        const totalBalanceResult = await usersCollection.aggregate([
            { $group: { _id: null, total: { $sum: '$balance' } } }
        ]).toArray();
        const totalBalance = totalBalanceResult[0]?.total || 0;
        
        res.json({
            totalUsers,
            totalBalance: totalBalance.toFixed(2),
            totalWatched: 0
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Обновление просмотров
app.post('/api/addWatch', authMiddleware, async (req, res) => {
    try {
        await usersCollection.updateOne(
            { id: req.user.id },
            { $inc: { totalWatched: 1 } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== ЗАПУСК СЕРВЕРА ====================
async function startServer() {
    const dbConnected = await connectDB();
    
    if (!dbConnected) {
        console.error('❌ Невозможно продолжить без MongoDB');
        process.exit(1);
    }
    
    app.listen(PORT, () => {
        console.log(`🚀 Сервер запущен на порту ${PORT}`);
        console.log(`🗄️  MongoDB подключена`);
    });
}

startServer();