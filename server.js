const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const MONGODB_URI = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = 'shooter_game';

let db;
let users;
let market;

async function connectDB() {
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        console.log('✅ Connected to MongoDB');
        
        db = client.db(DB_NAME);
        users = db.collection('users');
        market = db.collection('market');
        
        await users.createIndex({ telegram_id: 1 }, { unique: true });
        
        console.log('✅ Database ready');
        return client;
    } catch (error) {
        console.error('❌ MongoDB error:', error);
        return null;
    }
}

app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Shooter Backend running' });
});

// ============= СОХРАНЕНИЕ ВСЕГО ПРОГРЕССА =============

app.post('/api/save', async (req, res) => {
    const { telegram_id, save_data } = req.body;
    if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });
    
    try {
        await users.updateOne(
            { telegram_id: telegram_id },
            { 
                $set: { 
                    save_data: save_data,
                    coins: save_data.coins,
                    updated_at: Date.now() 
                } 
            },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/load', async (req, res) => {
    const { telegram_id } = req.body;
    if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });
    
    try {
        const user = await users.findOne({ telegram_id: telegram_id });
        res.json({ success: true, save_data: user?.save_data || null });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============= БОССЫ (серверное хранение времени) =============

// Получить статус боссов для игрока
app.post('/api/bosses/status', async (req, res) => {
    const { telegram_id } = req.body;
    if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });
    
    try {
        const user = await users.findOne({ telegram_id: telegram_id });
        const bossTimers = user?.boss_timers || {};
        res.json({ success: true, bossTimers: bossTimers });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Записать попытку боя с боссом (обновить таймер)
app.post('/api/bosses/attempt', async (req, res) => {
    const { telegram_id, bossLevel } = req.body;
    if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });
    
    try {
        const now = Date.now();
        const updateField = {};
        updateField[`boss_timers.${bossLevel}`] = now;
        
        await users.updateOne(
            { telegram_id: telegram_id },
            { $set: updateField },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============= МОНЕТЫ (быстрый доступ) =============

app.post('/api/coins', async (req, res) => {
    const { telegram_id, coins } = req.body;
    if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });
    
    try {
        if (coins !== undefined) {
            await users.updateOne(
                { telegram_id: telegram_id },
                { 
                    $set: { 
                        coins: coins,
                        'save_data.coins': coins
                    } 
                },
                { upsert: true }
            );
            res.json({ success: true });
        } else {
            const user = await users.findOne({ telegram_id: telegram_id });
            const coins = user?.coins ?? user?.save_data?.coins ?? 100;
            res.json({ success: true, coins: coins });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============= ГЛОБАЛЬНЫЙ РЫНОК =============

// Получить все предметы на рынке
app.get('/api/market/items', async (req, res) => {
    try {
        const items = await market.find({}).toArray();
        res.json({ success: true, items: items });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Выставить предмет на рынок
app.post('/api/market/sell', async (req, res) => {
    const { telegram_id, item, price, sellerName } = req.body;
    if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });
    
    try {
        const marketItem = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 6),
            telegram_id: telegram_id,
            sellerName: sellerName || 'Неизвестный',
            item: item,
            price: price,
            created_at: Date.now()
        };
        
        await market.insertOne(marketItem);
        res.json({ success: true, itemId: marketItem.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Купить предмет на рынке
app.post('/api/market/buy', async (req, res) => {
    const { itemId, buyer_id, buyerName } = req.body;
    if (!itemId || !buyer_id) return res.status(400).json({ error: 'itemId and buyer_id required' });
    
    try {
        const item = await market.findOne({ id: itemId });
        if (!item) return res.status(404).json({ error: 'Item not found' });
        if (item.telegram_id === buyer_id) {
            return res.status(400).json({ error: 'Cannot buy your own item' });
        }
        
        const buyer = await users.findOne({ telegram_id: buyer_id });
        const buyerCoins = buyer?.coins ?? buyer?.save_data?.coins ?? 100;
        
        if (buyerCoins < item.price) {
            return res.status(400).json({ error: 'Not enough coins' });
        }
        
        const newBuyerCoins = buyerCoins - item.price;
        
        const seller = await users.findOne({ telegram_id: item.telegram_id });
        const sellerCoins = seller?.coins ?? seller?.save_data?.coins ?? 0;
        const newSellerCoins = sellerCoins + item.price;
        
        // Обновляем покупателя
        await users.updateOne(
            { telegram_id: buyer_id },
            { 
                $set: { 
                    coins: newBuyerCoins,
                    'save_data.coins': newBuyerCoins
                } 
            }
        );
        
        // Обновляем продавца
        await users.updateOne(
            { telegram_id: item.telegram_id },
            { 
                $set: { 
                    coins: newSellerCoins,
                    'save_data.coins': newSellerCoins
                } 
            }
        );
        
        // Добавляем предмет в инвентарь покупателя
        const buyerData = await users.findOne({ telegram_id: buyer_id });
        const inventory = buyerData?.save_data?.inventory || [];
        inventory.push(item.item);
        
        await users.updateOne(
            { telegram_id: buyer_id },
            { $set: { 'save_data.inventory': inventory } }
        );
        
        await market.deleteOne({ id: itemId });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Market buy error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Снять предмет с рынка
app.post('/api/market/remove', async (req, res) => {
    const { itemId, telegram_id } = req.body;
    if (!itemId || !telegram_id) return res.status(400).json({ error: 'itemId and telegram_id required' });
    
    try {
        const item = await market.findOne({ id: itemId });
        if (!item) return res.status(404).json({ error: 'Item not found' });
        if (item.telegram_id !== telegram_id) return res.status(403).json({ error: 'Not your item' });
        
        const seller = await users.findOne({ telegram_id: telegram_id });
        const inventory = seller?.save_data?.inventory || [];
        inventory.push(item.item);
        
        await users.updateOne(
            { telegram_id: telegram_id },
            { $set: { 'save_data.inventory': inventory } }
        );
        
        await market.deleteOne({ id: itemId });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

connectDB().then(() => {
    app.listen(port, '0.0.0.0', () => {
        console.log(`🚀 Server running on port ${port}`);
    });
});
