const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============= MIDDLEWARE =============
// Разрешаем CORS для всех (для GitHub Pages)
app.use(cors({
    origin: '*',
    credentials: true
}));

app.use(express.json());

// Раздача статики из корневой папки (для HTML, CSS, JS)
app.use(express.static(path.join(__dirname, '..')));

// ============= БАЗА ДАННЫХ =============
const db = new sqlite3.Database('./database.db');

// Создание таблиц
db.serialize(() => {
    // Таблица пользователей
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT,
            avatar TEXT,
            balance REAL DEFAULT 0,
            level INTEGER DEFAULT 1,
            ads INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT (unixepoch())
        )
    `);
    
    // Таблица блоков рекламы
    db.run(`
        CREATE TABLE IF NOT EXISTS user_blocks (
            user_id TEXT,
            block_id INTEGER,
            views INTEGER DEFAULT 0,
            locked_until INTEGER DEFAULT 0,
            PRIMARY KEY (user_id, block_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);
    
    console.log('✅ База данных инициализирована');
});

// ============= ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =============
function generateUsername() {
    const names = ['CryptoMaster', 'AdKing', 'TokenHunter', 'RewardSeeker', 'LevelUp', 'Miner', 'EagleEye', 'FastClick', 'GoldRush', 'CoinCollector'];
    return names[Math.floor(Math.random() * names.length)] + Math.floor(Math.random() * 1000);
}

function generateAvatar() {
    return `https://i.pravatar.cc/100?img=${Math.floor(Math.random() * 70)}`;
}

// ============= API ENDPOINTS =============

/**
 * POST /api/user
 * Создание или получение пользователя
 */
app.post('/api/user', (req, res) => {
    const { userId, username, avatar } = req.body;
    const id = userId || uuidv4();
    
    console.log(`📌 Запрос пользователя: ${id}`);
    
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
        if (err) {
            console.error('❌ Ошибка БД:', err);
            return res.status(500).json({ error: err.message });
        }
        
        if (user) {
            // Пользователь существует — загружаем его блоки
            db.all('SELECT block_id, views, locked_until FROM user_blocks WHERE user_id = ?', [id], (err, blocks) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                
                const blocksData = {};
                blocks.forEach(b => {
                    blocksData[b.block_id] = { v: b.views, l: b.locked_until };
                });
                
                console.log(`✅ Пользователь загружен: ${user.username}`);
                
                res.json({
                    success: true,
                    user: {
                        id: user.id,
                        username: user.username,
                        avatar: user.avatar,
                        balance: user.balance,
                        level: user.level,
                        ads: user.ads
                    },
                    blocks: blocksData
                });
            });
        } else {
            // Создаём нового пользователя
            const newUsername = username || generateUsername();
            const newAvatar = avatar || generateAvatar();
            
            db.run(
                'INSERT INTO users (id, username, avatar, balance, level, ads) VALUES (?, ?, ?, ?, ?, ?)',
                [id, newUsername, newAvatar, 0, 1, 0],
                (err) => {
                    if (err) {
                        console.error('❌ Ошибка создания:', err);
                        return res.status(500).json({ error: err.message });
                    }
                    
                    // Создаём 3 блока для нового пользователя
                    const stmt = db.prepare('INSERT INTO user_blocks (user_id, block_id, views, locked_until) VALUES (?, ?, ?, ?)');
                    for (let i = 1; i <= 3; i++) {
                        stmt.run(id, i, 0, 0);
                    }
                    stmt.finalize();
                    
                    console.log(`🆕 Новый пользователь: ${newUsername} (${id})`);
                    
                    res.json({
                        success: true,
                        user: {
                            id: id,
                            username: newUsername,
                            avatar: newAvatar,
                            balance: 0,
                            level: 1,
                            ads: 0
                        },
                        blocks: {}
                    });
                }
            );
        }
    });
});

/**
 * POST /api/save
 * Сохранение прогресса пользователя
 */
app.post('/api/save', (req, res) => {
    const { userId, user, blocks } = req.body;
    
    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }
    
    console.log(`💾 Сохранение прогресса: ${userId}, баланс: ${user.balance}`);
    
    // Обновляем пользователя
    db.run(
        'UPDATE users SET balance = ?, level = ?, ads = ? WHERE id = ?',
        [user.balance, user.level, user.ads, userId],
        (err) => {
            if (err) {
                console.error('❌ Ошибка сохранения пользователя:', err);
                return res.status(500).json({ error: err.message });
            }
            
            // Обновляем блоки
            const promises = [];
            for (const [blockId, blockData] of Object.entries(blocks)) {
                promises.push(new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE user_blocks SET views = ?, locked_until = ? WHERE user_id = ? AND block_id = ?',
                        [blockData.v, blockData.l, userId, blockId],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                }));
            }
            
            Promise.all(promises)
                .then(() => {
                    console.log(`✅ Прогресс сохранён`);
                    res.json({ success: true });
                })
                .catch(err => {
                    console.error('❌ Ошибка сохранения блоков:', err);
                    res.status(500).json({ error: err.message });
                });
        }
    );
});

/**
 * GET /api/leaderboard
 * Топ-50 игроков по балансу
 */
app.get('/api/leaderboard', (req, res) => {
    db.all(
        `SELECT id, username, avatar, balance, level 
         FROM users 
         ORDER BY balance DESC 
         LIMIT 50`,
        (err, rows) => {
            if (err) {
                console.error('❌ Ошибка лидерборда:', err);
                return res.status(500).json({ error: err.message });
            }
            
            console.log(`📊 Лидерборд: ${rows.length} игроков`);
            res.json(rows);
        }
    );
});

/**
 * GET /api/stats
 * Статистика приложения
 */
app.get('/api/stats', (req, res) => {
    db.get(
        `SELECT 
            COUNT(*) as totalUsers,
            SUM(balance) as totalBalance,
            AVG(level) as avgLevel
         FROM users`,
        (err, row) => {
            if (err) {
                console.error('❌ Ошибка статистики:', err);
                return res.status(500).json({ error: err.message });
            }
            
            res.json({
                totalUsers: row.totalUsers || 0,
                totalBalance: row.totalBalance || 0,
                avgLevel: Math.round((row.avgLevel || 1) * 10) / 10
            });
        }
    );
});

/**
 * GET /api/user/:id
 * Получение конкретного пользователя
 */
app.get('/api/user/:id', (req, res) => {
    const { id } = req.params;
    
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        db.all('SELECT block_id, views, locked_until FROM user_blocks WHERE user_id = ?', [id], (err, blocks) => {
            const blocksData = {};
            blocks.forEach(b => {
                blocksData[b.block_id] = { v: b.views, l: b.locked_until };
            });
            
            res.json({ user, blocks: blocksData });
        });
    });
});

/**
 * POST /api/reset/:id
 * Сброс прогресса пользователя (для тестирования)
 */
app.post('/api/reset/:id', (req, res) => {
    const { id } = req.params;
    
    db.run('UPDATE users SET balance = 0, level = 1, ads = 0 WHERE id = ?', [id], (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        db.run('UPDATE user_blocks SET views = 0, locked_until = 0 WHERE user_id = ?', [id], (err) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            res.json({ success: true, message: 'Progress reset' });
        });
    });
});

/**
 * GET /health
 * Проверка работоспособности
 */
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

/**
 * Корневой маршрут — отдаём index.html
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// ============= ЗАПУСК СЕРВЕРА =============
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════╗
║     🚀 СЕРВЕР ЗАПУЩЕН!                 ║
╠════════════════════════════════════════╣
║  Порт: ${PORT}                             
║  API:  http://localhost:${PORT}/api     
║  Health: http://localhost:${PORT}/health
╚════════════════════════════════════════╝
    `);
});