const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// MongoDB подключение
const MONGODB_URI = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = 'shooter_game';

let db;
let players;

async function connectDB() {
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        console.log('✅ Connected to MongoDB');
        
        db = client.db(DB_NAME);
        players = db.collection('players');
        
        await players.createIndex({ telegram_id: 1 }, { unique: true });
        
        console.log('✅ Collections ready');
        return client;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        console.log('Retrying in 5 seconds...');
        setTimeout(connectDB, 5000);
        return null;
    }
}

app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Shooter Backend running with MongoDB' });
});

app.post('/api/save', async (req, res) => {
    const { telegram_id, save_data } = req.body;
    if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });
    
    try {
        await players.updateOne(
            { telegram_id: telegram_id },
            { $set: { save_data: save_data, updated_at: Date.now() } },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Save error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/load', async (req, res) => {
    const { telegram_id } = req.body;
    if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });
    
    try {
        const player = await players.findOne({ telegram_id: telegram_id });
        res.json({ success: true, save_data: player?.save_data || null });
    } catch (error) {
        console.error('Load error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/coins', async (req, res) => {
    const { telegram_id, coins } = req.body;
    if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });
    
    try {
        if (coins !== undefined) {
            await players.updateOne(
                { telegram_id: telegram_id },
                { $set: { coins: coins, coins_updated_at: Date.now() } },
                { upsert: true }
            );
            res.json({ success: true });
        } else {
            const player = await players.findOne({ telegram_id: telegram_id });
            res.json({ success: true, coins: player?.coins || 100 });
        }
    } catch (error) {
        console.error('Coins error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/market', async (req, res) => {
    const { telegram_id, marketItems } = req.body;
    if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });
    
    try {
        if (marketItems !== undefined) {
            await players.updateOne(
                { telegram_id: telegram_id },
                { $set: { market_items: marketItems, market_updated_at: Date.now() } },
                { upsert: true }
            );
            res.json({ success: true });
        } else {
            const player = await players.findOne({ telegram_id: telegram_id });
            res.json({ success: true, marketItems: player?.market_items || [] });
        }
    } catch (error) {
        console.error('Market error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/history', async (req, res) => {
    const { telegram_id, history } = req.body;
    if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });
    
    try {
        await players.updateOne(
            { telegram_id: telegram_id },
            { $set: { purchase_history: history, history_updated_at: Date.now() } },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (error) {
        console.error('History error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/history/load', async (req, res) => {
    const { telegram_id } = req.body;
    if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });
    
    try {
        const player = await players.findOne({ telegram_id: telegram_id });
        res.json({ 
            success: true, 
            history: player?.purchase_history || { shop: [], market: [], lastVisit: 0 }
        });
    } catch (error) {
        console.error('Load history error:', error);
        res.status(500).json({ error: error.message });
    }
});

connectDB().then(() => {
    app.listen(port, '0.0.0.0', () => {
        console.log(`🚀 Server running on port ${port}`);
    });
});
