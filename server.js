const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Увеличиваем лимиты для больших запросов
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Логирование запросов
app.use((req, res, next) => {
    console.log(`📡 ${req.method} ${req.url}`);
    next();
});

// ============= ХРАНИЛИЩЕ ДАННЫХ =============
const players = new Map();
const marketListings = new Map();
const chatMessages = [];
let nextListingId = 1;

// ============= ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =============
function getDefaultPlayerData() {
    return {
        coins: 100,
        kills: 0,
        currentFloor: 1,
        floorMultiplier: 1,
        playerLevel: 1,
        playerExp: 0,
        expToNextLevel: 100,
        damage: 10,
        attackSpeed: 1.0,
        critChance: 0,
        critDamage: 1.5,
        inventory: [],
        equipped: {
            weapon: null,
            sight: null,
            laser: null,
            magazine: null,
            silencer: null
        },
        bossFights: {},
        isFightingBoss: false,
        tempCoins: 0,
        name: null,
        lastUpdated: Date.now()
    };
}

// ============= API ПРОГРЕССА ИГРОКА =============

// Сохранение всего прогресса
app.post('/api/save', async (req, res) => {
    try {
        const { telegram_id, save_data } = req.body;
        
        if (!telegram_id) {
            return res.status(400).json({ success: false, error: 'No telegram_id' });
        }
        
        let player = players.get(telegram_id);
        if (!player) {
            player = getDefaultPlayerData();
        }
        
        // Обновляем данные
        Object.assign(player, save_data);
        player.lastUpdated = Date.now();
        
        players.set(telegram_id, player);
        
        console.log(`💾 Сохранено для ${telegram_id}, монет: ${player.coins}`);
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Загрузка всего прогресса
app.post('/api/load', async (req, res) => {
    try {
        const { telegram_id } = req.body;
        
        if (!telegram_id) {
            return res.status(400).json({ success: false, error: 'No telegram_id' });
        }
        
        let player = players.get(telegram_id);
        if (!player) {
            player = getDefaultPlayerData();
            players.set(telegram_id, player);
            console.log(`🆕 Новый игрок: ${telegram_id}`);
        }
        
        console.log(`📥 Загружено для ${telegram_id}, монет: ${player.coins}`);
        res.json({ success: true, save_data: player });
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Синхронизация монет
app.post('/api/coins', async (req, res) => {
    try {
        const { telegram_id, coins } = req.body;
        
        if (!telegram_id) {
            return res.status(400).json({ success: false, error: 'No telegram_id' });
        }
        
        let player = players.get(telegram_id);
        if (!player) {
            player = getDefaultPlayerData();
            players.set(telegram_id, player);
        }
        
        player.coins = coins;
        player.lastUpdated = Date.now();
        
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка синхронизации монет:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ============= API ИМЕНИ ИГРОКА =============

app.post('/api/player/name', async (req, res) => {
    try {
        const { telegram_id, name } = req.body;
        
        if (!telegram_id) {
            return res.status(400).json({ success: false, error: 'No telegram_id' });
        }
        
        let player = players.get(telegram_id);
        if (!player) {
            player = getDefaultPlayerData();
            players.set(telegram_id, player);
        }
        
        player.name = name;
        console.log(`📝 Имя сохранено для ${telegram_id}: ${name}`);
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка сохранения имени:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/player/name/get', async (req, res) => {
    try {
        const { telegram_id } = req.body;
        
        if (!telegram_id) {
            return res.status(400).json({ success: false, error: 'No telegram_id' });
        }
        
        const player = players.get(telegram_id);
        const name = player?.name || null;
        
        res.json({ success: true, name: name });
    } catch (error) {
        console.error('Ошибка загрузки имени:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ============= API БОССОВ =============

app.post('/api/boss/attempt', async (req, res) => {
    try {
        const { telegram_id, bossLevel } = req.body;
        
        if (!telegram_id) {
            return res.status(400).json({ success: false, error: 'No telegram_id' });
        }
        
        let player = players.get(telegram_id);
        if (!player) {
            player = getDefaultPlayerData();
            players.set(telegram_id, player);
        }
        
        if (!player.bossFights) player.bossFights = {};
        player.bossFights[bossLevel] = Date.now();
        
        console.log(`👑 Попытка босса ${bossLevel} для ${telegram_id}`);
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка сохранения попытки босса:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/boss/status', async (req, res) => {
    try {
        const { telegram_id } = req.body;
        
        if (!telegram_id) {
            return res.status(400).json({ success: false, error: 'No telegram_id' });
        }
        
        const player = players.get(telegram_id);
        const bossFights = player?.bossFights || {};
        
        res.json({ success: true, bossFights: bossFights });
    } catch (error) {
        console.error('Ошибка загрузки статуса боссов:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ============= API ГЛОБАЛЬНОГО ЧАТА =============

app.get('/api/chat/messages', async (req, res) => {
    try {
        const recentMessages = chatMessages.slice(-50);
        res.json({ success: true, messages: recentMessages });
    } catch (error) {
        console.error('Ошибка загрузки чата:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/chat/send', async (req, res) => {
    try {
        const { telegram_id, username, text } = req.body;
        
        if (!telegram_id || !text) {
            return res.status(400).json({ success: false, error: 'Missing data' });
        }
        
        const message = {
            id: Date.now(),
            username: (username || 'Игрок').slice(0, 20),
            text: text.slice(0, 200),
            timestamp: Date.now(),
            telegram_id: telegram_id
        };
        
        chatMessages.push(message);
        
        while (chatMessages.length > 500) {
            chatMessages.shift();
        }
        
        console.log(`💬 [Чат] ${message.username}: ${message.text}`);
        res.json({ success: true, message: message });
    } catch (error) {
        console.error('Ошибка отправки сообщения:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ============= API РЫНКА =============

app.get('/api/market/items', async (req, res) => {
    try {
        const listings = Array.from(marketListings.values())
            .filter(l => l.active !== false)
            .sort((a, b) => a.createdAt - b.createdAt);
        
        res.json({ success: true, items: listings });
    } catch (error) {
        console.error('Ошибка загрузки рынка:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/market/sell', async (req, res) => {
    try {
        const { telegram_id, item, price, sellerName } = req.body;
        
        if (!telegram_id || !item || !price) {
            return res.status(400).json({ success: false, error: 'Missing data' });
        }
        
        if (price < 10) {
            return res.json({ success: false, error: 'Минимальная цена 10 монет' });
        }
        
        const listingId = (nextListingId++).toString();
        const listing = {
            id: listingId,
            telegram_id: telegram_id,
            sellerName: (sellerName || 'Игрок').slice(0, 15),
            item: item,
            price: price,
            createdAt: Date.now(),
            active: true
        };
        
        marketListings.set(listingId, listing);
        
        console.log(`📦 Новый лот от ${telegram_id}: ${item.name} за ${price}`);
        res.json({ success: true, listingId: listingId });
    } catch (error) {
        console.error('Ошибка выставления на рынок:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/market/buy', async (req, res) => {
    try {
        const { itemId, buyer_id, buyerName } = req.body;
        
        if (!itemId || !buyer_id) {
            return res.status(400).json({ success: false, error: 'Missing data' });
        }
        
        const listing = marketListings.get(itemId);
        if (!listing) {
            return res.json({ success: false, error: 'Предмет не найден' });
        }
        
        if (!listing.active) {
            return res.json({ success: false, error: 'Предмет уже продан' });
        }
        
        const seller = players.get(listing.telegram_id);
        const buyer = players.get(buyer_id);
        
        if (!buyer) {
            return res.json({ success: false, error: 'Покупатель не найден' });
        }
        
        if (buyer.coins < listing.price) {
            return res.json({ success: false, error: 'Не хватает монет' });
        }
        
        buyer.coins -= listing.price;
        listing.active = false;
        listing.soldTo = buyer_id;
        listing.soldAt = Date.now();
        
        if (!seller.pendingSales) seller.pendingSales = [];
        seller.pendingSales.push({
            id: Date.now(),
            item: listing.item,
            price: listing.price,
            buyerName: buyerName || 'Игрок',
            soldAt: Date.now()
        });
        
        const purchasedItem = {
            ...listing.item,
            id: Date.now() + Math.random(),
            stats: { ...listing.item.stats, upgradeLevel: listing.item.stats?.upgradeLevel || 0 }
        };
        buyer.inventory.push(purchasedItem);
        
        players.set(listing.telegram_id, seller);
        players.set(buyer_id, buyer);
        
        console.log(`💰 Покупка: ${buyer_id} купил ${listing.item.name} за ${listing.price}`);
        res.json({ success: true, item: purchasedItem });
    } catch (error) {
        console.error('Ошибка покупки:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/market/my-listings', async (req, res) => {
    try {
        const { telegram_id } = req.body;
        
        if (!telegram_id) {
            return res.status(400).json({ success: false, error: 'No telegram_id' });
        }
        
        const myListings = Array.from(marketListings.values())
            .filter(l => l.telegram_id === telegram_id && l.active === true);
        
        res.json({ success: true, listings: myListings });
    } catch (error) {
        console.error('Ошибка загрузки моих лотов:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/market/my-sales', async (req, res) => {
    try {
        const { telegram_id } = req.body;
        
        if (!telegram_id) {
            return res.status(400).json({ success: false, error: 'No telegram_id' });
        }
        
        const player = players.get(telegram_id);
        const sales = player?.pendingSales || [];
        
        res.json({ success: true, sales: sales });
    } catch (error) {
        console.error('Ошибка загрузки продаж:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/market/claim', async (req, res) => {
    try {
        const { saleId, telegram_id } = req.body;
        
        if (!saleId || !telegram_id) {
            return res.status(400).json({ success: false, error: 'Missing data' });
        }
        
        const player = players.get(telegram_id);
        if (!player || !player.pendingSales) {
            return res.json({ success: false, error: 'Продажа не найдена' });
        }
        
        const saleIndex = player.pendingSales.findIndex(s => s.id == saleId);
        if (saleIndex === -1) {
            return res.json({ success: false, error: 'Продажа не найдена' });
        }
        
        const sale = player.pendingSales[saleIndex];
        const commission = Math.floor(sale.price * 0.1);
        const earned = sale.price - commission;
        
        player.coins += earned;
        player.pendingSales.splice(saleIndex, 1);
        
        players.set(telegram_id, player);
        
        console.log(`💰 ${telegram_id} получил ${earned} монет от продажи`);
        res.json({ success: true, earned: earned, commission: commission });
    } catch (error) {
        console.error('Ошибка получения монет:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/market/remove', async (req, res) => {
    try {
        const { itemId, telegram_id } = req.body;
        
        if (!itemId || !telegram_id) {
            return res.status(400).json({ success: false, error: 'Missing data' });
        }
        
        const listing = marketListings.get(itemId);
        if (!listing) {
            return res.json({ success: false, error: 'Предмет не найден' });
        }
        
        if (listing.telegram_id !== telegram_id) {
            return res.json({ success: false, error: 'Не ваш предмет' });
        }
        
        const seller = players.get(telegram_id);
        if (seller) {
            const returnedItem = {
                ...listing.item,
                id: Date.now() + Math.random(),
                stats: { ...listing.item.stats, upgradeLevel: listing.item.stats?.upgradeLevel || 0 }
            };
            seller.inventory.push(returnedItem);
            players.set(telegram_id, seller);
        }
        
        marketListings.delete(itemId);
        
        console.log(`🗑️ ${telegram_id} снял с продажи ${listing.item.name}`);
        res.json({ success: true, item: listing.item });
    } catch (error) {
        console.error('Ошибка снятия с рынка:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ============= СТАТИСТИКА =============
app.get('/api/stats', async (req, res) => {
    try {
        const totalPlayers = players.size;
        const activeListings = Array.from(marketListings.values()).filter(l => l.active).length;
        const totalMessages = chatMessages.length;
        
        res.json({
            success: true,
            stats: {
                players: totalPlayers,
                listings: activeListings,
                messages: totalMessages
            }
        });
    } catch (error) {
        console.error('Ошибка получения статистики:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ============= ЗАПУСК СЕРВЕРА =============
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📊 Статистика:`);
    console.log(`   - API доступно: http://localhost:${PORT}`);
    console.log(`   - CORS включён для всех`);
    console.log(`   - Память: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`);
});

// Обработка ошибок
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled Rejection:', error);
});
