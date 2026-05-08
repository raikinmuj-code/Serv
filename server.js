const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
const port = process.env.PORT || 3000;

// CORS настройки
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Дополнительные CORS заголовки
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// MongoDB подключение
const MONGODB_URI = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = 'shooter_game';

let db;
let players;

async function connectDB() {
    try {
        const client = new MongoClient(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        await client.connect();
        console.log('✅ Connected to MongoDB');
        
        db = client.db(DB_NAME);
        players = db.collection('players');
        
        // Создаём индекс для быстрого поиска
        try {
            await players.createIndex({ telegram_id: 1 }, { unique: true });
            console.log('✅ Index created');
        } catch (indexErr) {
            console.log('Index already exists');
        }
        
        console.log('✅ Database ready');
        return client;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        return null;
    }
}

// Health check
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Shooter Backend running with MongoDB', timestamp: Date.now() });
});

// ============= СОХРАНЕНИЕ ПРОГРЕССА =============

app.post('/api/save', async (req, res) => {
    const { telegram_id, save_data } = req.body;
    console.log(`📝 Save request for: ${telegram_id}`);
    
    if (!telegram_id) {
        return res.status(400).json({ error: 'telegram_id required' });
    }
    
    try {
        const result = await players.updateOne(
            { telegram_id: telegram_id },
            { 
                $set: { 
                    save_data: save_data, 
                    updated_at: Date.now() 
                }
            },
            { upsert: true }
        );
        console.log(`✅ Saved for ${telegram_id}`);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Save error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/load', async (req, res) => {
    const { telegram_id } = req.body;
    console.log(`📥 Load request for: ${telegram_id}`);
    
    if (!telegram_id) {
        return res.status(400).json({ error: 'telegram_id required' });
    }
    
    try {
        const player = await players.findOne({ telegram_id: telegram_id });
        console.log(`✅ Loaded for ${telegram_id}: ${player ? 'found' : 'not found'}`);
        res.json({ success: true, save_data: player?.save_data || null });
    } catch (error) {
        console.error('❌ Load error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============= МОНЕТЫ =============

app.post('/api/coins', async (req, res) => {
    const { telegram_id, coins } = req.body;
    console.log(`💰 Coins request for: ${telegram_id}, coins: ${coins}`);
    
    if (!telegram_id) {
        return res.status(400).json({ error: 'telegram_id required' });
    }
    
    try {
        if (coins !== undefined) {
            await players.updateOne(
                { telegram_id: telegram_id },
                { $set: { coins: coins, coins_updated_at: Date.now() } },
                { upsert: true }
            );
            console.log(`✅ Coins saved: ${coins}`);
            res.json({ success: true });
        } else {
            const player = await players.findOne({ telegram_id: telegram_id });
            const coinBalance = player?.coins || 100;
            console.log(`✅ Coins loaded: ${coinBalance}`);
            res.json({ success: true, coins: coinBalance });
        }
    } catch (error) {
        console.error('❌ Coins error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============= РЫНОК =============

app.post('/api/market', async (req, res) => {
    const { telegram_id, marketItems } = req.body;
    console.log(`🏪 Market request for: ${telegram_id}`);
    
    if (!telegram_id) {
        return res.status(400).json({ error: 'telegram_id required' });
    }
    
    try {
        if (marketItems !== undefined) {
            await players.updateOne(
                { telegram_id: telegram_id },
                { $set: { market_items: marketItems, market_updated_at: Date.now() } },
                { upsert: true }
            );
            console.log(`✅ Market saved: ${marketItems.length} items`);
            res.json({ success: true });
        } else {
            const player = await players.findOne({ telegram_id: telegram_id });
            const items = player?.market_items || [];
            console.log(`✅ Market loaded: ${items.length} items`);
            res.json({ success: true, marketItems: items });
        }
    } catch (error) {
        console.error('❌ Market error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============= ИСТОРИЯ ПОКУПОК =============

app.post('/api/history', async (req, res) => {
    const { telegram_id, history } = req.body;
    console.log(`📜 History save for: ${telegram_id}`);
    
    if (!telegram_id) {
        return res.status(400).json({ error: 'telegram_id required' });
    }
    
    try {
        await players.updateOne(
            { telegram_id: telegram_id },
            { $set: { purchase_history: history, history_updated_at: Date.now() } },
            { upsert: true }
        );
        console.log(`✅ History saved`);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ History error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/history/load', async (req, res) => {
    const { telegram_id } = req.body;
    console.log(`📜 History load for: ${telegram_id}`);
    
    if (!telegram_id) {
        return res.status(400).json({ error: 'telegram_id required' });
    }
    
    try {
        const player = await players.findOne({ telegram_id: telegram_id });
        const history = player?.purchase_history || { shop: [], market: [], lastVisit: 0 };
        console.log(`✅ History loaded`);
        res.json({ 
            success: true, 
            history: history
        });
    } catch (error) {
        console.error('❌ Load history error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Запуск сервера
connectDB().then(() => {
    app.listen(port, '0.0.0.0', () => {
        console.log(`🚀 Server running on port ${port}`);
        console.log(`📍 URL: http://localhost:${port}`);
    });
});
