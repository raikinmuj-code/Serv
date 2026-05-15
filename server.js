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

// ============= ПУТИ ДЛЯ СТАТИКИ =============
const rootPath = path.join(__dirname, '..');
app.use(express.static(rootPath));

// ============= ПОДКЛЮЧЕНИЕ К MONGODB =============
// Пробуем разные возможные переменные окружения
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL || process.env.DATABASE_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'duckads';

console.log('🔍 Переменные окружения:');
console.log('   MONGODB_URI:', MONGODB_URI ? '✅ задана' : '❌ не задана');
console.log('   DB_NAME:', DB_NAME);

let db;
let usersCollection;
let blocksCollection;
let referralsCollection;
let transactionsCollection;

async function connectDB() {
    try {
        console.log('🔄 Подключение к MongoDB...');
        console.log('   URI:', MONGODB_URI.replace(/:[^:]*@/, ':****@')); // Скрываем пароль
        
        const client = new MongoClient(MONGODB_URI, {
            connectTimeoutMS: 10000,
            serverSelectionTimeoutMS: 10000
        });
        
        await client.connect();
        console.log('✅ Подключено к MongoDB');
        
        db = client.db(DB_NAME);
        usersCollection = db.collection('users');
        blocksCollection = db.collection('user_blocks');
        referralsCollection = db.collection('referrals');
        transactionsCollection = db.collection('transactions');
        
        // Создаём индексы
        await usersCollection.createIndex({ id: 1 }, { unique: true });
        await usersCollection.createIndex({ telegram_id: 1 });
        await usersCollection.createIndex({ balance: -1 });
        await blocksCollection.createIndex({ user_id: 1, block_id: 1 }, { unique: true });
        await referralsCollection.createIndex({ referrer_id: 1 });
        await transactionsCollection.createIndex({ user_id: 1 });
        await transactionsCollection.createIndex({ created_at: -1 });
        
        console.log('✅ Индексы созданы');
        
        // Проверяем, есть ли данные
        const userCount = await usersCollection.countDocuments();
        console.log(`📊 В базе уже ${userCount} пользователей`);
        
        return true;
    } catch (error) {
        console.error('❌ Ошибка подключения к MongoDB:', error.message);
        console.error('   Полная ошибка:', error);
        return false;
    }
}

// ============= ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =============
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
        console.error('Ошибка записи транзакции:', error);
    }
}

// ============= API ENDPOINTS =============

// 1. Регистрация/получение пользователя
app.post('/api/user', async (req, res) => {
    console.log('📌 POST /api/user', req.body);
    
    const { 
        userId, 
        username, 
        firstName, 
        lastName, 
        avatar, 
        languageCode, 
        isPremium,
        referrerId 
    } = req.body;
    
    const id = userId || `tg_${uuidv4()}`;
    const displayName = username || firstName || generateUsername();
    const userAvatar = avatar || `https://i.pravatar.cc/100?img=${Math.floor(Math.random() * 70)}`;
    
    console.log(`👤 Пользователь: ${id}, Имя: ${displayName}`);
    
    try {
        let user = await usersCollection.findOne({ id });
        
        if (user) {
            console.log(`✅ Существующий пользователь: ${displayName}`);
            
            // Обновляем активность
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
            
            // Получаем блоки
            const blocks = await blocksCollection.find({ user_id: id }).toArray();
            const blocksData = {};
            blocks.forEach(b => {
                blocksData[b.block_id] = { v: b.views, l: b.locked_until };
            });
            
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
            console.log(`🆕 Новый пользователь: ${displayName}`);
            
            // Создаём нового пользователя
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
            
            // Создаём 3 блока
            for (let i = 1; i <= 3; i++) {
                await blocksCollection.insertOne({
                    user_id: id,
                    block_id: i,
                    views: 0,
                    locked_until: 0
                });
            }
            
            // Реферальный бонус
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

// 2. Сохранение прогресса
app.post('/api/save', async (req, res) => {
    const { userId, user, blocks } = req.body;
    
    console.log(`💾 POST /api/save для ${userId}, баланс: ${user?.balance}`);
    
    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }
    
    try {
        // Обновляем пользователя
        const updateResult = await usersCollection.updateOne(
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
        
        if (updateResult.matchedCount === 0) {
            console.log(`⚠️ Пользователь не найден: ${userId}`);
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Обновляем блоки
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
        
        console.log(`✅ Прогресс сохранён: ${userId}, баланс: ${user.balance}`);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Ошибка сохранения:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. Лидерборд
app.get('/api/leaderboard', async (req, res) => {
    try {
        const users = await usersCollection
            .find({})
            .sort({ balance: -1 })
            .limit(50)
            .project({ id: 1, username: 1, avatar: 1, balance: 1, level: 1 })
            .toArray();
        
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Статистика
app.get('/api/stats', async (req, res) => {
    try {
        const totalUsers = await usersCollection.countDocuments();
        res.json({ totalUsers });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 5. Health check
app.get('/health', async (req, res) => {
    try {
        await usersCollection.findOne({});
        res.json({ status: 'ok', timestamp: new Date().toISOString(), database: 'mongodb' });
    } catch (error) {
        res.status(500).json({ status: 'error', error: error.message });
    }
});

// 6. Корневой маршрут
app.get('/', (req, res) => {
    res.sendFile(path.join(rootPath, 'index.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(rootPath, 'index.html'));
});

// ============= ЗАПУСК СЕРВЕРА =============
async function startServer() {
    console.log('🔄 Запуск сервера...');
    console.log('📁 Корневая папка:', rootPath);
    
    const dbConnected = await connectDB();
    
    if (!dbConnected) {
        console.error('❌ MongoDB не подключена! Использую режим без БД (только для теста)');
        // Создаём заглушки
        db = { command: async () => {} };
        usersCollection = { findOne: async () => null, updateOne: async () => {}, insertOne: async () => {}, countDocuments: async () => 0 };
        blocksCollection = { find: async () => ({ toArray: async () => [] }), updateOne: async () => {}, insertOne: async () => {} };
        referralsCollection = { insertOne: async () => {} };
        transactionsCollection = { insertOne: async () => {} };
    }
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Сервер запущен на порту ${PORT}`);
        console.log(`   API: http://localhost:${PORT}/api`);
        console.log(`   Health: http://localhost:${PORT}/health`);
    });
}

startServer();
