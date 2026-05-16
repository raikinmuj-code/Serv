const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());
app.use(express.static('.'));

// MongoDB подключение
const MONGODB_URI = 'mongodb://mongo:HifCudFNbVfxsoSXpdXnNSXhWPfeDpLQ@shinkansen.proxy.rlwy.net:44359';
const DB_NAME = 'duckads';

let db;
let usersCollection;

// Подключение к MongoDB
async function connectDB() {
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        console.log('✅ MongoDB подключена');
        
        db = client.db(DB_NAME);
        usersCollection = db.collection('users');
        
        // Индексы для скорости
        await usersCollection.createIndex({ id: 1 }, { unique: true });
        await usersCollection.createIndex({ token: 1 });
        
        return true;
    } catch (error) {
        console.error('❌ Ошибка MongoDB:', error.message);
        return false;
    }
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Middleware
async function authMiddleware(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) {
        return res.status(401).json({ error: 'Нет токена' });
    }
    
    try {
        const user = await usersCollection.findOne({ token: token });
        if (!user) {
            return res.status(401).json({ error: 'Неверный токен' });
        }
        req.user = user;
        next();
    } catch (error) {
        res.status(500).json({ error: 'Ошибка БД' });
    }
}

// ==================== API ====================

// Авторизация
app.post('/api/auth', async (req, res) => {
    const { telegramId, name, avatar, referrerId } = req.body;
    
    if (!telegramId) {
        return res.status(400).json({ error: 'telegramId обязателен' });
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
                adsBlocks: [
                    { id: 0, watched: 0, maxWatches: 15, rewardPerView: 0.0009 },
                    { id: 1, watched: 0, maxWatches: 15, rewardPerView: 0.0009 },
                    { id: 2, watched: 0, maxWatches: 15, rewardPerView: 0.0009 }
                ],
                autoMode: true
            };
            
            await usersCollection.insertOne(newUser);
            user = newUser;
            
            // Награда рефереру
            if (referrerId) {
                await usersCollection.updateOne(
                    { id: referrerId },
                    { $inc: { balance: 0.50 }, $push: { referrals: telegramId } }
                );
            }
        } else {
            await usersCollection.updateOne(
                { id: telegramId },
                { $set: { token: generateToken(), lastSeen: new Date() } }
            );
            user = await usersCollection.findOne({ id: telegramId });
        }
        
        res.json({
            success: true,
            token: user.token,
            user: {
                id: user.id,
                name: user.name,
                balance: user.balance,
                level: user.level,
                xp: user.xp,
                boostDouble: user.boostDouble,
                boostDoubleEnd: user.boostDoubleEnd,
                completedTasks: user.completedTasks || [],
                adsBlocks: user.adsBlocks,
                autoMode: user.autoMode
            }
        });
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение данных
app.get('/api/user', authMiddleware, async (req, res) => {
    res.json({
        balance: req.user.balance,
        level: req.user.level,
        xp: req.user.xp,
        boostDouble: req.user.boostDouble,
        boostDoubleEnd: req.user.boostDoubleEnd,
        completedTasks: req.user.completedTasks || [],
        adsBlocks: req.user.adsBlocks,
        autoMode: req.user.autoMode
    });
});

// Сохранение прогресса
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
        
        await usersCollection.updateOne(
            { id: req.user.id },
            { $set: updateData }
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сохранения' });
    }
});

// Топ игроков
app.get('/api/leaderboard', async (req, res) => {
    try {
        const leaders = await usersCollection
            .find({})
            .sort({ balance: -1 })
            .limit(50)
            .project({ name: 1, balance: 1, level: 1 })
            .toArray();
        res.json(leaders);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

// Статистика
app.get('/api/stats', async (req, res) => {
    try {
        const totalUsers = await usersCollection.countDocuments();
        const totalBalance = await usersCollection.aggregate([
            { $group: { _id: null, total: { $sum: '$balance' } } }
        ]).toArray();
        res.json({ 
            totalUsers, 
            totalBalance: totalBalance[0]?.total.toFixed(2) || 0 
        });
    } catch (error) {
        res.json({ totalUsers: 0, totalBalance: 0 });
    }
});

// Добавление просмотра
app.post('/api/addWatch', authMiddleware, async (req, res) => {
    try {
        await usersCollection.updateOne(
            { id: req.user.id },
            { $inc: { totalWatched: 1 } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

// Проверка здоровья
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Запуск
async function startServer() {
    const dbConnected = await connectDB();
    if (!dbConnected) {
        process.exit(1);
    }
    
    app.listen(PORT, () => {
        console.log(`🚀 Сервер на порту ${PORT}`);
    });
}

startServer();