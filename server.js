const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============= ХРАНИЛИЩЕ ДАННЫХ =============
// В реальном проекте используйте PostgreSQL или MongoDB
// Для демо используем Map в памяти
const players = new Map(); // telegram_id -> playerData
const marketListings = new Map(); // listingId -> listing
const chatMessages = []; // глобальный чат
let nextListingId = 1;

// ============= ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =============
function getDefaultPlayerData() {
    return {
        // Прогресс
        coins: 100,
        kills: 0,
        currentFloor: 1,
        floorMultiplier: 1,
        playerLevel: 1,
        playerExp: 0,
        expToNextLevel: 100,
        
        // Характеристики
        damage: 10,
        attackSpeed: 1.0,
        critChance: 0,
        critDamage: 1.5,
        
        // Инвентарь и экипировка
        inventory: [],
        equipped: {
            weapon: null,
            sight: null,
            laser: null,
            magazine: null,
            silencer: null
        },
        
        // Боссы
        bossFights: {}, // bossLevel -> timestamp
        isFightingBoss: false,
        
        // Временные монеты (для сбора)
        tempCoins: 0,
        
        // Последнее обновление
        lastUpdated: Date.now()
    };
}

// ============= API ПРОГРЕССА ИГРОКА =============

// Сохранение всего прогресса
app.post('/api/save', async (req, res) => {
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
});

// Загрузка всего прогресса
app.post('/api/load', async (req, res) => {
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
});

// Синхронизация монет (для временных монет)
app.post('/api/coins', async (req, res) => {
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
});

// ============= API ИМЕНИ ИГРОКА =============

// Сохранение имени
app.post('/api/player/name', async (req, res) => {
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
    res.json({ success: true });
});

// Загрузка имени
app.post('/api/player/name/get', async (req, res) => {
    const { telegram_id } = req.body;
    
    if (!telegram_id) {
        return res.status(400).json({ success: false, error: 'No telegram_id' });
    }
    
    const player = players.get(telegram_id);
    const name = player?.name || null;
    
    res.json({ success: true, name: name });
});

// ============= API БОССОВ =============

// Сохранение попытки боя с боссом
app.post('/api/boss/attempt', async (req, res) => {
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
    
    res.json({ success: true });
});

// Загрузка статуса боссов
app.post('/api/boss/status', async (req, res) => {
    const { telegram_id } = req.body;
    
    if (!telegram_id) {
        return res.status(400).json({ success: false, error: 'No telegram_id' });
    }
    
    const player = players.get(telegram_id);
    const bossFights = player?.bossFights || {};
    
    res.json({ success: true, bossFights: bossFights });
});

// ============= API ГЛОБАЛЬНОГО ЧАТА =============

// Получение сообщений чата
app.get('/api/chat/messages', async (req, res) => {
    // Возвращаем последние 50 сообщений
    const recentMessages = chatMessages.slice(-50);
    res.json({ success: true, messages: recentMessages });
});

// Отправка сообщения
app.post('/api/chat/send', async (req, res) => {
    const { telegram_id, username, text } = req.body;
    
    if (!telegram_id || !text) {
        return res.status(400).json({ success: false, error: 'Missing data' });
    }
    
    const message = {
        id: Date.now(),
        username: username || 'Игрок',
        text: text.slice(0, 200),
        timestamp: Date.now(),
        telegram_id: telegram_id
    };
    
    chatMessages.push(message);
    
    // Ограничиваем размер чата
    while (chatMessages.length > 500) {
        chatMessages.shift();
    }
    
    console.log(`💬 [Чат] ${message.username}: ${message.text}`);
    res.json({ success: true, message: message });
});

// ============= API РЫНКА =============

// Получение всех предметов на рынке
app.get('/api/market/items', async (req, res) => {
    const listings = Array.from(marketListings.values())
        .filter(l => l.active !== false)
        .sort((a, b) => a.createdAt - b.createdAt);
    
    res.json({ success: true, items: listings });
});

// Выставить предмет на продажу
app.post('/api/market/sell', async (req, res) => {
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
        sellerName: sellerName || 'Игрок',
        item: item,
        price: price,
        createdAt: Date.now(),
        active: true
    };
    
    marketListings.set(listingId, listing);
    
    console.log(`📦 Новый лот от ${telegram_id}: ${item.name} за ${price}`);
    res.json({ success: true, listingId: listingId });
});

// Купить предмет
app.post('/api/market/buy', async (req, res) => {
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
    
    // Списываем монеты у покупателя
    buyer.coins -= listing.price;
    
    // Отмечаем предмет как проданный
    listing.active = false;
    listing.soldTo = buyer_id;
    listing.soldAt = Date.now();
    
// Создаём запись о продаже для продавца
if (!seller.pendingSales) seller.pendingSales = [];
seller.pendingSales.push({
    id: Date.now(),
    item: listing.item,
    price: listing.price,
    buyerName: buyerName,
    soldAt: Date.now(),
    claimed: false   // ← ДОБАВЬ ЭТУ СТРОКУ
});
    
    // Добавляем предмет покупателю
    const purchasedItem = {
        ...listing.item,
        id: Date.now() + Math.random(),
        stats: { ...listing.item.stats, upgradeLevel: listing.item.stats?.upgradeLevel || 0 }
    };
    buyer.inventory.push(purchasedItem);
    
    players.set(listing.telegram_id, seller);
    players.set(buyer_id, buyer);
    
    console.log(`💰 Покупка: ${buyer_id} купил ${listing.item.name} за ${listing.price} у ${listing.telegram_id}`);
    res.json({ success: true, item: purchasedItem });
});

// Получить мои лоты
app.post('/api/market/my-listings', async (req, res) => {
    const { telegram_id } = req.body;
    
    if (!telegram_id) {
        return res.status(400).json({ success: false, error: 'No telegram_id' });
    }
    
    const myListings = Array.from(marketListings.values())
        .filter(l => l.telegram_id === telegram_id && l.active === true);
    
    res.json({ success: true, listings: myListings });
});

// Получить неподтверждённые продажи
app.post('/api/market/my-sales', async (req, res) => {
    const { telegram_id } = req.body;
    
    if (!telegram_id) {
        return res.status(400).json({ success: false, error: 'No telegram_id' });
    }
    
    const player = players.get(telegram_id);
    const sales = player?.pendingSales || [];
    
    res.json({ success: true, sales: sales });
});

// Забрать монеты с продажи
app.post('/api/market/claim', async (req, res) => {
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
    
    // ПРОВЕРКА: уже получено?
    if (sale.claimed) {
        return res.json({ success: false, error: 'Монеты уже получены' });
    }
    
    const commission = Math.floor(sale.price * 0.1);
    const earned = sale.price - commission;
    
    player.coins += earned;
    sale.claimed = true;  // ОТМЕЧАЕМ КАК ПОЛУЧЕННОЕ
    
    players.set(telegram_id, player);
    
    console.log(`💰 ${telegram_id} получил ${earned} монет от продажи`);
    res.json({ success: true, earned: earned, commission: commission });
});

// Снять предмет с рынка
app.post('/api/market/remove', async (req, res) => {
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
    
    // Возвращаем предмет продавцу
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
    
    // Удаляем лот
    marketListings.delete(itemId);
    
    console.log(`🗑️ ${telegram_id} снял с продажи ${listing.item.name}`);
    res.json({ success: true, item: listing.item });
});

// ============= СТАТИСТИКА =============
app.get('/api/stats', async (req, res) => {
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
});

// ============= ЗАПУСК СЕРВЕРА =============
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📊 Статистика:`);
    console.log(`   - API доступно: http://localhost:${PORT}`);
    console.log(`   - CORS включён для всех`);
});