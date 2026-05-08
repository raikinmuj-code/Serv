const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shooter_idle';
let db;
let client;

async function connectDB() {
    try {
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db();
        console.log('✅ MongoDB connected');
        
        // Create indexes
        await db.collection('users').createIndex({ telegram_id: 1 }, { unique: true });
        await db.collection('market').createIndex({ telegram_id: 1 });
        await db.collection('market').createIndex({ createdAt: -1 });
        await db.collection('pending_sales').createIndex({ seller_id: 1 });
        await db.collection('chat_messages').createIndex({ timestamp: -1 });
        
    } catch (error) {
        console.error('MongoDB connection error:', error);
        setTimeout(connectDB, 5000);
    }
}

connectDB();

// ============= SAVE/LOAD DATA =============

app.post('/api/load', async (req, res) => {
    const { telegram_id } = req.body;
    
    try {
        const user = await db.collection('users').findOne({ telegram_id });
        
        if (user) {
            res.json({ success: true, save_data: user });
        } else {
            res.json({ success: false, save_data: null });
        }
    } catch (error) {
        console.error('Load error:', error);
        res.json({ success: false, error: error.message });
    }
});

app.post('/api/save', async (req, res) => {
    const { telegram_id, save_data } = req.body;
    
    try {
        await db.collection('users').updateOne(
            { telegram_id },
            { $set: { ...save_data, telegram_id, updatedAt: new Date() } },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Save error:', error);
        res.json({ success: false, error: error.message });
    }
});

// ============= PLAYER NAME =============

app.post('/api/player/name', async (req, res) => {
    const { telegram_id, name } = req.body;
    
    try {
        await db.collection('users').updateOne(
            { telegram_id },
            { $set: { name, telegram_id } },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.post('/api/player/name/get', async (req, res) => {
    const { telegram_id } = req.body;
    
    try {
        const user = await db.collection('users').findOne({ telegram_id });
        res.json({ success: true, name: user?.name || null });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ============= CHAT =============

app.get('/api/chat/messages', async (req, res) => {
    try {
        const messages = await db.collection('chat_messages')
            .find()
            .sort({ timestamp: -1 })
            .limit(100)
            .toArray();
        
        res.json({ success: true, messages: messages.reverse() });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.post('/api/chat/send', async (req, res) => {
    const { telegram_id, username, text } = req.body;
    
    if (!text || text.trim().length === 0) {
        return res.json({ success: false, error: 'Пустое сообщение' });
    }
    
    try {
        const message = {
            telegram_id,
            username: username || 'Игрок',
            text: text.substring(0, 200),
            timestamp: new Date().toISOString(),
            isSystem: false
        };
        
        await db.collection('chat_messages').insertOne(message);
        
        // Keep only last 500 messages
        const count = await db.collection('chat_messages').countDocuments();
        if (count > 500) {
            const oldest = await db.collection('chat_messages')
                .find()
                .sort({ timestamp: 1 })
                .limit(count - 500)
                .toArray();
            for (const old of oldest) {
                await db.collection('chat_messages').deleteOne({ _id: old._id });
            }
        }
        
        res.json({ success: true, message });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ============= MARKET =============

// Get all market items
app.get('/api/market/items', async (req, res) => {
    try {
        const items = await db.collection('market')
            .find()
            .sort({ createdAt: -1 })
            .toArray();
        res.json({ success: true, items });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Get my listings
app.post('/api/market/my-listings', async (req, res) => {
    const { telegram_id } = req.body;
    
    try {
        const listings = await db.collection('market')
            .find({ telegram_id })
            .toArray();
        res.json({ success: true, listings });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Get pending sales (money waiting to be claimed)
app.post('/api/market/my-sales', async (req, res) => {
    const { telegram_id } = req.body;
    
    try {
        const sales = await db.collection('pending_sales')
            .find({ seller_id: telegram_id, claimed: false })
            .toArray();
        res.json({ success: true, sales });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Sell item on market
app.post('/api/market/sell', async (req, res) => {
    const { telegram_id, item, price, sellerName } = req.body;
    
    if (!telegram_id || !item || !price) {
        return res.json({ success: false, error: 'Missing data' });
    }
    
    try {
        const marketItem = {
            id: Date.now() + Math.random(),
            telegram_id,
            sellerName: sellerName || 'Игрок',
            item: {
                ...item,
                stats: { ...item.stats }
            },
            price: Math.floor(price),
            createdAt: new Date()
        };
        
        await db.collection('market').insertOne(marketItem);
        res.json({ success: true, item: marketItem });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Buy item from market
app.post('/api/market/buy', async (req, res) => {
    const { itemId, buyer_id, buyerName } = req.body;
    
    try {
        const listing = await db.collection('market').findOne({ id: itemId });
        if (!listing) {
            return res.json({ success: false, error: 'Предмет уже продан' });
        }
        
        const sellerId = listing.telegram_id;
        const price = listing.price;
        const commission = Math.floor(price * 0.1);
        const sellerEarn = price - commission;
        
        // Check buyer balance
        const buyer = await db.collection('users').findOne({ telegram_id: buyer_id });
        if (!buyer || (buyer.coins || 100) < price) {
            return res.json({ success: false, error: 'Не хватает монет' });
        }
        
        // Deduct money from buyer
        await db.collection('users').updateOne(
            { telegram_id: buyer_id },
            { $inc: { coins: -price } }
        );
        
        // Add pending sale for seller (if not buying from himself)
        if (sellerId !== buyer_id) {
            await db.collection('pending_sales').insertOne({
                id: Date.now() + Math.random(),
                seller_id: sellerId,
                item: listing.item,
                price: price,
                earned: sellerEarn,
                commission: commission,
                createdAt: new Date(),
                claimed: false
            });
        }
        
        // Remove from market
        await db.collection('market').deleteOne({ id: itemId });
        
        res.json({ success: true, item: listing.item });
    } catch (error) {
        console.error('Buy error:', error);
        res.json({ success: false, error: error.message });
    }
});

// Claim money from sale
app.post('/api/market/claim', async (req, res) => {
    const { saleId, telegram_id } = req.body;
    
    try {
        const sale = await db.collection('pending_sales').findOne({ id: saleId });
        if (!sale) {
            return res.json({ success: false, error: 'Продажа не найдена' });
        }
        
        if (sale.seller_id !== telegram_id) {
            return res.json({ success: false, error: 'Это не ваша продажа' });
        }
        
        if (sale.claimed) {
            return res.json({ success: false, error: 'Монеты уже получены' });
        }
        
        // Add money to seller
        await db.collection('users').updateOne(
            { telegram_id },
            { $inc: { coins: sale.earned } }
        );
        
        // Mark as claimed
        await db.collection('pending_sales').updateOne(
            { id: saleId },
            { $set: { claimed: true, claimedAt: new Date() } }
        );
        
        res.json({ success: true, earned: sale.earned, commission: sale.commission });
    } catch (error) {
        console.error('Claim error:', error);
        res.json({ success: false, error: error.message });
    }
});

// Remove item from market
app.post('/api/market/remove', async (req, res) => {
    const { itemId, telegram_id } = req.body;
    
    try {
        const listing = await db.collection('market').findOne({ id: itemId });
        if (!listing) {
            return res.json({ success: false, error: 'Предмет не найден' });
        }
        
        if (listing.telegram_id !== telegram_id) {
            return res.json({ success: false, error: 'Это не ваш предмет' });
        }
        
        await db.collection('market').deleteOne({ id: itemId });
        res.json({ success: true, item: listing.item });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ============= BOSS SYSTEM =============

app.post('/api/boss/status', async (req, res) => {
    const { telegram_id } = req.body;
    
    try {
        const bossFights = await db.collection('boss_fights').findOne({ telegram_id });
        res.json({ success: true, bossFights: bossFights?.fights || {} });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.post('/api/boss/attempt', async (req, res) => {
    const { telegram_id, bossLevel } = req.body;
    
    try {
        const now = Date.now();
        await db.collection('boss_fights').updateOne(
            { telegram_id },
            { $set: { [`fights.${bossLevel}`]: now, updatedAt: new Date() } },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ============= HEALTH CHECK =============

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});