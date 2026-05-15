const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// ============= ПРЯМОЕ ПОДКЛЮЧЕНИЕ =============
const MONGO_URL = 'mongodb://mongo:MmFGAwrRIXPnPscZUhlXsMNZvHbGrPVs@yamanote.proxy.rlwy.net:55514';
const DB_NAME = 'duckads';

console.log('🔗 Подключаюсь к:', MONGO_URL.replace(/:[^:]*@/, ':****@'));

let db;
let usersCollection;
let blocksCollection;

async function connectDB() {
    try {
        const client = new MongoClient(MONGO_URL);
        await client.connect();
        console.log('✅ MongoDB подключена!');
        
        db = client.db(DB_NAME);
        usersCollection = db.collection('users');
        blocksCollection = db.collection('user_blocks');
        
        await usersCollection.createIndex({ id: 1 }, { unique: true });
        await blocksCollection.createIndex({ user_id: 1, block_id: 1 }, { unique: true });
        
        const count = await usersCollection.countDocuments();
        console.log(`📊 Пользователей: ${count}`);
        
        return true;
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        return false;
    }
}

function generateUsername() {
    const names = ['CryptoMaster', 'AdKing', 'TokenHunter', 'RewardSeeker', 'LevelUp'];
    return names[Math.floor(Math.random() * names.length)] + Math.floor(Math.random() * 1000);
}

// ============= API =============
app.post('/api/user', async (req, res) => {
    const { userId, username, firstName, referrerId } = req.body;
    const id = userId || `tg_${uuidv4()}`;
    const displayName = username || firstName || generateUsername();
    const avatar = `https://i.pravatar.cc/100?img=${Math.floor(Math.random() * 70)}`;
    
    try {
        let user = await usersCollection.findOne({ id });
        
        if (user) {
            await usersCollection.updateOne({ id }, { $set: { last_active: Date.now() } });
            const blocks = await blocksCollection.find({ user_id: id }).toArray();
            const blocksData = {};
            blocks.forEach(b => { blocksData[b.block_id] = { v: b.views, l: b.locked_until }; });
            
            res.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    avatar: user.avatar,
                    balance: user.balance || 0,
                    level: user.level || 1,
                    ads: user.ads || 0
                },
                blocks: blocksData
            });
        } else {
            const newUser = { id, username: displayName, avatar, balance: 0, level: 1, ads: 0, created_at: Date.now(), last_active: Date.now() };
            await usersCollection.insertOne(newUser);
            
            for (let i = 1; i <= 3; i++) {
                await blocksCollection.insertOne({ user_id: id, block_id: i, views: 0, locked_until: 0 });
            }
            
            if (referrerId && referrerId !== id) {
                await usersCollection.updateOne({ id: referrerId }, { $inc: { balance: 0.01 } });
            }
            
            res.json({
                success: true,
                user: { id, username: displayName, avatar, balance: 0, level: 1, ads: 0 },
                blocks: {}
            });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/save', async (req, res) => {
    const { userId, user, blocks } = req.body;
    
    try {
        await usersCollection.updateOne(
            { id: userId },
            { $set: { balance: user.balance, level: user.level, ads: user.ads, last_active: Date.now() } }
        );
        
        for (const [blockId, blockData] of Object.entries(blocks)) {
            await blocksCollection.updateOne(
                { user_id: userId, block_id: parseInt(blockId) },
                { $set: { views: blockData.v, locked_until: blockData.l } }
            );
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    const users = await usersCollection.find({}).sort({ balance: -1 }).limit(50).toArray();
    res.json(users);
});

app.get('/api/stats', async (req, res) => {
    const totalUsers = await usersCollection.countDocuments();
    res.json({ totalUsers });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

connectDB().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Сервер на порту ${PORT}`);
    });
}).catch(err => {
    console.error('❌ Ошибка:', err);
    process.exit(1);
});
