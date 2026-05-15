const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============= MIDDLEWARE =============
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ============= СТАТИКА =============
const rootPath = path.join(__dirname, '..');
app.use(express.static(rootPath));

// ============= MONGODB =============
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'duckads';

console.log('🔍 Переменные:');
console.log('   MONGODB_URI:', MONGODB_URI ? '✅ задана' : '❌ не задана');
console.log('   DB_NAME:', DB_NAME);

let db;
let usersCollection;
let blocksCollection;
let referralsCollection;
let transactionsCollection;

async function connectDB() {
    try {
        console.log('🔄 Подключение к MongoDB (Railway)...');
        
        const client = new MongoClient(MONGODB_URI, {
            connectTimeoutMS: 10000,
            serverSelectionTimeoutMS: 10000
        });
        
        await client.connect();
        console.log('✅ MongoDB подключена!');
        
        db = client.db(DB_NAME);
        usersCollection = db.collection('users');
        blocksCollection = db.collection('user_blocks');
        referralsCollection = db.collection('referrals');
        transactionsCollection = db.collection('transactions');
        
        // Создаём индексы
        try {
            await usersCollection.createIndex({ id: 1 }, { unique: true });
            await usersCollection.createIndex({ telegram_id: 1 });
            await usersCollection.createIndex({ balance: -1 });
            await blocksCollection.createIndex({ user_id: 1, block_id: 1 }, { unique: true });
            await transactionsCollection.createIndex({ user_id: 1 });
            await transactionsCollection.createIndex({ created_at: -1 });
            console.log('✅ Индексы созданы');
        } catch (indexError) {
            console.log('⚠️ Индексы уже существуют или ошибка:', indexError.message);
        }
        
        const userCount = await usersCollection.countDocuments();
        console.log(`📊 Пользователей в базе: ${userCount}`);
        
        return true;
    } catch (error) {
        console.error('❌ Ошибка MongoDB:', error.message);
        return false;
    }
}

function generateUsername() {
    const names = ['CryptoMaster', 'AdKing', 'TokenHunter', 'RewardSeeker', 'LevelUp', 'Miner', 'EagleEye', 'FastClick', 'GoldRush', 'CoinCollector'];
    return names[Math.floor(Math.random() * names.length)] + Math.floor(Math.random() * 1000);
}

async function logTransaction(userId, type, amount, description) {
    try {
        await transactionsCollection.insertOne({
            user_id: userId,
            type,
            amount,
            description,
            created_at: Date.now()
        });
    } catch (error) {
        console.error('Ошибка транзакции:', error);
    }
}

// ============= API =============

app.post('/api/user', async (req, res) => {
    const { userId, username, firstName, lastName, avatar, languageCode, isPremium, referrerId } = req.body;
    const id = userId || `tg_${uuidv4()}`;
    const displayName = username || firstName || generateUsername();
    const userAvatar = avatar || `https://i.pravatar.cc/100?img=${Math.floor(Math.random() * 70)}`;
    
    console.log(`📌 Запрос: ${id}, Имя: ${displayName}`);
    
    try {
        let user = await usersCollection.findOne({ id });
        
        if (user) {
            await usersCollection.updateOne(
                { id },
                { 
                    $set: {
                        username: displayName,
                        avatar: userAvatar,
                        is_premium: isPremium || false,
                        language: languageCode || 'ru',
                        last_active: Date.now()
                    }
                }
            );
            
            const blocks = await blocksCollection.find({ user_id: id }).toArray();
            const blocksData = {};
            blocks.forEach(b => {
                blocksData[b.block_id] = { v: b.views, l: b.locked_until };
            });
            
            console.log(`✅ Пользователь загружен: ${displayName}`);
            
            res.json({
                success: true,
                user: {
                    id: user.id,
                    username: displayName,
                    avatar: userAvatar,
                    balance: user.balance || 0,
                    level: user.level || 1,
                    ads: user.ads || 0,
                    totalViews: user.total_views || 0
                },
                blocks: blocksData
            });
        } else {
            const newUser = {
                id,
                username: displayName,
                avatar: userAvatar,
                balance: 0,
                level: 1,
                ads: 0,
                is_premium: isPremium || false,
                language: languageCode || 'ru',
                telegram_id: id.replace('tg_', ''),
                referrer_id: referrerId || null,
                total_views: 0,
                created_at: Date.now(),
                last_active: Date.now()
            };
            
            await usersCollection.insertOne(newUser);
            
            for (let i = 1; i <= 3; i++) {
                await blocksCollection.insertOne({
                    user_id: id,
                    block_id: i,
                    views: 0,
                    locked_until: 0
                });
            }
            
            if (referrerId && referrerId !== id) {
                const bonusAmount = 0.01;
                await usersCollection.updateOne(
                    { id: referrerId },
                    { $inc: { balance: bonusAmount } }
                );
                
                await referralsCollection.insertOne({
                    referrer_id: referrerId,
                    referred_id: id,
                    reward: bonusAmount,
                    created_at: Date.now()
                });
                
                await logTransaction(referrerId, 'referral_bonus', bonusAmount, `За приглашение ${displayName}`);
                console.log(`🎁 Реферальный бонус: ${referrerId} +${bonusAmount}$`);
            }
            
            await logTransaction(id, 'registration', 0, 'Регистрация');
            console.log(`🆕 Новый пользователь: ${displayName}`);
            
            res.json({
                success: true,
                user: {
                    id: newUser.id,
                    username: displayName,
                    avatar: userAvatar,
                    balance: 0,
                    level: 1,
                    ads: 0,
                    totalViews: 0
                },
                blocks: {}
            });
        }
    } catch (error) {
        console.error('❌ Ошибка:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/save', async (req, res) => {
    const { userId, user, blocks } = req.body;
    
    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }
    
    try {
        await usersCollection.updateOne(
            { id: userId },
            {
                $set: {
                    balance: user.balance,
                    level: user.level,
                    ads: user.ads,
                    last_active: Date.now()
                },
                $inc: { total_views: 1 }
            }
        );
        
        for (const [blockId, blockData] of Object.entries(blocks)) {
            await blocksCollection.updateOne(
                { user_id: userId, block_id: parseInt(blockId) },
                {
                    $set: {
                        views: blockData.v,
                        locked_until: blockData.l
                    }
                }
            );
        }
        
        console.log(`💾 Сохранено: ${userId}, баланс: ${user.balance}`);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Ошибка сохранения:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const users = await usersCollection
            .find({})
            .sort({ balance: -1 })
            .limit(50)
            .project({ id: 1, username: 1, avatar: 1, balance: 1, level: 1, total_views: 1 })
            .toArray();
        
        console.log(`📊 Лидерборд: ${users.length} игроков`);
        res.json(users);
    } catch (error) {
        console.error('❌ Ошибка лидерборда:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        const totalUsers = await usersCollection.countDocuments();
        const totalBalanceResult = await usersCollection.aggregate([
            { $group: { _id: null, total: { $sum: '$balance' } } }
        ]).toArray();
        
        res.json({
            totalUsers,
            totalBalance: totalBalanceResult[0]?.total || 0
        });
    } catch (error) {
        console.error('❌ Ошибка статистики:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/user/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const user = await usersCollection.findOne({ id });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const blocks = await blocksCollection.find({ user_id: id }).toArray();
        const blocksData = {};
        blocks.forEach(b => {
            blocksData[b.block_id] = { v: b.views, l: b.locked_until };
        });
        
        res.json({ user, blocks: blocksData });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/referrals/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const referrals = await referralsCollection
            .find({ referrer_id: id })
            .sort({ created_at: -1 })
            .toArray();
        
        res.json(referrals);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/transactions/:id', async (req, res) => {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    try {
        const transactions = await transactionsCollection
            .find({ user_id: id })
            .sort({ created_at: -1 })
            .limit(limit)
            .toArray();
        
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/reset/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        await usersCollection.updateOne(
            { id },
            { $set: { balance: 0, level: 1, ads: 0, total_views: 0 } }
        );
        
        await blocksCollection.updateMany(
            { user_id: id },
            { $set: { views: 0, locked_until: 0 } }
        );
        
        await logTransaction(id, 'reset', 0, 'Сброс прогресса');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/health', async (req, res) => {
    try {
        await usersCollection.findOne({});
        res.json({ 
            status: 'ok', 
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            database: 'mongodb-railway'
        });
    } catch (error) {
        res.status(500).json({ status: 'error', error: error.message });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(rootPath, 'index.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(rootPath, 'index.html'));
});

// ============= ЗАПУСК =============
async function startServer() {
    console.log('🔄 Запуск сервера...');
    console.log('📁 Корневая папка:', rootPath);
    
    const dbConnected = await connectDB();
    
    if (!dbConnected) {
        console.error('❌ MongoDB не подключена!');
        process.exit(1);
    }
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`
╔══════════════════════════════════════════════════════════╗
║                     🚀 СЕРВЕР ЗАПУЩЕН                      ║
╠══════════════════════════════════════════════════════════╣
║  Порт: ${PORT}                                              
║  API:  http://localhost:${PORT}/api                        
║  Health: http://localhost:${PORT}/health                   
╠══════════════════════════════════════════════════════════╣
║  ✅ MongoDB подключена                                     
║  ✅ База данных: ${DB_NAME}                                
║  ✅ CORS разрешён для всех                                 
╚══════════════════════════════════════════════════════════╝
        `);
    });
}

startServer();
